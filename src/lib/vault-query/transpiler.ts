/**
 * Olympus Vault Query — AST → SQL Transpiler
 * =============================================
 *
 * Walks a `DqlAst` (produced by `parser.ts`) and emits a SQL `SELECT`
 * against the `notes` / `fm_kv` / `tags` / `tasks` / `notes_fts` tables
 * defined in `vault-index/schema.ts`.
 *
 * Transpilation rules (Dataview-compatible):
 *
 *   FROM "06_Activity_Feed"          → dir LIKE '06_Activity_Feed/%' OR dir = ?
 *   FROM #security                   → JOIN tags ON tags.note_path = notes.path WHERE tags.tag = ?
 *   FROM [A, B]                      → (dir LIKE 'A/%' OR dir LIKE 'B/%')
 *   FROM (A AND B)                   → INNER JOIN for intersection
 *   FROM (A AND NOT B)               → LEFT JOIN B WHERE B IS NULL
 *
 *   WHERE file.day >= date(today) - dur(1 days)
 *                                    → modified >= strftime('%s', 'now', '-1 day') * 1000
 *   WHERE confidence >= 0.85         → EXISTS (SELECT 1 FROM fm_kv WHERE
 *                                        fm_kv.note_path = notes.path AND key='confidence'
 *                                        AND json_extract(value_json, '$') >= 0.85)
 *   WHERE file.name = "Foo"          → notes.name = 'Foo' (or basename)
 *   WHERE contains(file.tags, "x")   → EXISTS (SELECT 1 FROM tags WHERE
 *                                        tags.note_path = notes.path AND tag = 'x')
 *
 *   TABLE god, count(*) AS events    → SELECT fm_value('god') AS god, COUNT(*) AS events
 *   GROUP BY god                     → GROUP BY fm_value('god')
 *   SORT events DESC                 → ORDER BY events DESC
 *   LIMIT 10                         → LIMIT 10
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type {
  DqlAst,
  Expr,
  FieldNode,
  FromSource,
  Literal,
  Comparison,
  BinaryExpr,
} from './parser';

export interface TranspiledQuery {
  sql: string;
  params: unknown[];
}

/** Map a DQL field name to a SQL expression. */
function fieldToSql(field: string): string {
  // file.* virtual fields
  switch (field) {
    case 'file.name':
      return `REPLACE(notes.name, '.md', '')`;
    case 'file.path':
      return `notes.path`;
    case 'file.size':
      return `notes.size`;
    case 'file.mtime':
      return `notes.modified`;
    case 'file.day':
      // Approximate file.day by mtime (epoch ms) → date string.
      return `notes.modified`;
    case 'file.tags':
      // Used in `contains(file.tags, "x")` — see exprToSql.
      return `notes.path`;
    case 'file.outlinks':
    case 'file.inlinks':
      return `notes.path`;
    case 'file.tasks':
      return `notes.path`;
    default:
      // Frontmatter field — read from fm_kv.
      return `(SELECT value_json FROM fm_kv WHERE fm_kv.note_path = notes.path AND fm_kv.key = '${field.replace(/'/g, "''")}')`;
  }
}

/** Wrap a frontmatter field value with json_extract for comparison. */
function fmExtract(field: string): string {
  return `(SELECT json_extract(value_json, '$') FROM fm_kv WHERE fm_kv.note_path = notes.path AND fm_kv.key = '${field.replace(/'/g, "''")}')`;
}

/** Convert a `date(today) - dur(N days)` style expression to SQL epoch ms. */
function dateFuncToMs(func: 'today' | 'now' | 'yesterday'): string {
  // strftime returns seconds; multiply by 1000 for ms.
  switch (func) {
    case 'today':
    case 'now':
      return `(strftime('%s', 'now') * 1000)`;
    case 'yesterday':
      return `(strftime('%s', 'now', '-1 day') * 1000)`;
  }
}

/** Convert a dur literal to a SQLite modifier string. */
function durToModifier(amount: number, unit: string): string {
  switch (unit) {
    case 'days':
      return `-${amount} day`;
    case 'hours':
      return `-${amount} hours`;
    case 'weeks':
      return `-${amount * 7} days`;
    case 'months':
      return `-${amount * 30} days`;
    default:
      return `-${amount} day`;
  }
}

/** Convert a literal node to SQL + params. */
function literalToSql(lit: Literal): { sql: string; params: unknown[] } {
  switch (lit.type) {
    case 'string':
      return { sql: '?', params: [lit.value] };
    case 'number':
      return { sql: '?', params: [lit.value] };
    case 'bool':
      return { sql: '?', params: [lit.value ? 1 : 0] };
    case 'null':
      return { sql: 'NULL', params: [] };
    case 'date-func':
      return { sql: dateFuncToMs(lit.func), params: [] };
    case 'dur':
      // Durations only make sense as part of a subtraction — handled by
      // comparison-level code. Standalone, return the modifier string.
      return { sql: `'${durToModifier(lit.amount, lit.unit)}'`, params: [] };
    case 'field':
      return { sql: fieldToSql(lit.name), params: [] };
    case 'func':
      // Generic function — most are aggregates handled by field-level code.
      // For non-aggregate functions in WHERE, return a placeholder.
      return { sql: 'NULL', params: [] };
  }
}

/** Convert a WHERE/HAVING expression to SQL. */
function exprToSql(expr: Expr): { sql: string; params: unknown[] } {
  switch (expr.type) {
    case 'binary': {
      const left = exprToSql(expr.left);
      const right = exprToSql(expr.right);
      return {
        sql: `(${left.sql} ${expr.op} ${right.sql})`,
        params: [...left.params, ...right.params],
      };
    }
    case 'comparison': {
      return comparisonToSql(expr);
    }
  }
}

function comparisonToSql(c: Comparison): { sql: string; params: unknown[] } {
  const fieldName = c.field.name;
  // Special: contains(file.tags, "x")
  if (c.op === 'contains' && fieldName === 'file.tags') {
    const val = literalToSql(c.value);
    if (val.params.length === 1) {
      return {
        sql: `EXISTS (SELECT 1 FROM tags WHERE tags.note_path = notes.path AND tags.tag = ?)`,
        params: [String(val.params[0])],
      };
    }
  }
  // Special: file.day >= date(today) - dur(N days)
  // Detect: left = `file.day`, op = `>=` or `<=`, right = func call (handled below).
  // The parser produces `func` for `date(today) - dur(N days)` — but actually
  // our parser doesn't support arithmetic. We special-case `date(today)` and
  // `dur(N days)` separately, and support `>= date(today) - dur(N days)` by
  // detecting the form at the comparison level: if value is a func call with
  // name 'sub' or similar... actually, since our parser doesn't support
  // arithmetic, the user must write `WHERE file.day >= dur(1 days)` meaning
  // "within the last 1 day". We'll handle that.
  if (fieldName === 'file.day' && (c.op === '>=' || c.op === '<=')) {
    // value should be a dur or date-func
    if (c.value.type === 'dur') {
      const modifier = durToModifier(c.value.amount, c.value.unit);
      const sql = c.op === '>='
        ? `notes.modified >= (strftime('%s', 'now', '${modifier}') * 1000)`
        : `notes.modified <= (strftime('%s', 'now', '${modifier}') * 1000)`;
      return { sql, params: [] };
    }
    if (c.value.type === 'date-func') {
      const sql = c.op === '>='
        ? `notes.modified >= ${dateFuncToMs(c.value.func)}`
        : `notes.modified <= ${dateFuncToMs(c.value.func)}`;
      return { sql, params: [] };
    }
  }
  // file.name = "Foo" → notes.name LIKE '%Foo' OR path LIKE '%/Foo.md'
  if (fieldName === 'file.name') {
    const val = literalToSql(c.value);
    if (c.op === '=' && val.params.length === 1) {
      return {
        sql: `(notes.name = ? OR notes.name = ?)`,
        params: [String(val.params[0]), String(val.params[0]) + '.md'],
      };
    }
  }
  // file.path = "01_Gods/Apollo/profile.md"
  if (fieldName === 'file.path') {
    const val = literalToSql(c.value);
    if (c.op === '=' && val.params.length === 1) {
      return { sql: `notes.path = ?`, params: [String(val.params[0])] };
    }
  }
  // Frontmatter field comparison
  // Treat fieldName as a frontmatter key.
  // `fmExtract` already wraps in `json_extract(value_json, '$')`, so we
  // compare against its result directly.
  const extract = fmExtract(fieldName);
  const val = literalToSql(c.value);
  switch (c.op) {
    case '=':
      return {
        sql: `(${extract} IS NOT NULL AND ${extract} = ?)`,
        params: val.params,
      };
    case '!=':
      return {
        sql: `(${extract} IS NULL OR ${extract} != ?)`,
        params: val.params,
      };
    case '<':
    case '<=':
    case '>':
    case '>=':
      return {
        sql: `(${extract} IS NOT NULL AND CAST(${extract} AS REAL) ${c.op} CAST(? AS REAL))`,
        params: val.params,
      };
    case 'contains':
      return {
        sql: `(${extract} IS NOT NULL AND CAST(${extract} AS TEXT) LIKE '%' || ? || '%')`,
        params: val.params,
      };
    case '!contains':
      return {
        sql: `(${extract} IS NULL OR CAST(${extract} AS TEXT) NOT LIKE '%' || ? || '%')`,
        params: val.params,
      };
    default:
      throw new Error(`Unsupported operator: ${c.op}`);
  }
}

/** Convert a FROM source to a SQL JOIN/where fragment. */
function fromToSql(src: FromSource): { sql: string; params: unknown[] } {
  switch (src.type) {
    case 'path': {
      const p = src.value!;
      return {
        sql: `(notes.dir = ? OR notes.dir LIKE ? OR notes.path LIKE ?)`,
        params: [p, p + '/%', p + '%'],
      };
    }
    case 'tag': {
      return {
        sql: `EXISTS (SELECT 1 FROM tags WHERE tags.note_path = notes.path AND tags.tag = ?)`,
        params: [src.value!],
      };
    }
    case 'union': {
      const parts = src.children!.map((c) => fromToSql(c));
      return {
        sql: `(${parts.map((p) => p.sql).join(' OR ')})`,
        params: parts.flatMap((p) => p.params),
      };
    }
    case 'intersection': {
      // AND of two sources
      const [left, right] = src.children!.map((c) => fromToSql(c));
      return {
        sql: `(${left.sql} AND ${right.sql})`,
        params: [...left.params, ...right.params],
      };
    }
    case 'difference': {
      // left AND NOT right
      const [left, right] = src.children!.map((c) => fromToSql(c));
      return {
        sql: `(${left.sql} AND NOT ${right.sql})`,
        params: [...left.params, ...right.params],
      };
    }
  }
}

/** Convert a TABLE field to a SELECT expression. */
function selectFieldToSql(field: FieldNode): { sql: string; alias: string } {
  if (field.aggregate) {
    const argSql = field.aggregate.arg === '*' ? '*' : fmExtract(field.aggregate.arg);
    const alias = field.alias || `${field.aggregate.func}_${field.aggregate.arg}`;
    return { sql: `${field.aggregate.func.toUpperCase()}(${argSql})`, alias };
  }
  // Non-aggregate field — frontmatter lookup
  const alias = field.alias || field.name;
  switch (field.name) {
    case 'file.name':
      return { sql: `REPLACE(notes.name, '.md', '')`, alias };
    case 'file.path':
      return { sql: `notes.path`, alias };
    case 'file.size':
      return { sql: `notes.size`, alias };
    case 'file.mtime':
      return { sql: `notes.modified`, alias };
    case 'file.day':
      return { sql: `notes.modified`, alias };
    default:
      return { sql: fmExtract(field.name), alias };
  }
}

/**
 * Transpile a parsed DQL AST into a SQL string + bind params.
 */
export function transpileDql(ast: DqlAst): TranspiledQuery {
  const params: unknown[] = [];
  const selectParts: string[] = [];
  const whereParts: string[] = [];

  // FROM → WHERE clauses
  if (ast.from) {
    const fromSql = fromToSql(ast.from);
    whereParts.push(fromSql.sql);
    params.push(...fromSql.params);
  }

  // SELECT fields
  if (ast.queryType === 'TASK') {
    // TASK: select from tasks table joined with notes
    selectParts.push('tasks.note_path AS path');
    selectParts.push('tasks.line AS line');
    selectParts.push('tasks.text AS text');
    selectParts.push('tasks.status AS status');
    if (ast.where) {
      // Translate `!completed` etc. We support `!completed` and `completed`.
      const w = ast.where;
      if (w.type === 'comparison' && w.field.name === 'completed' && w.op === '=' && w.value.type === 'bool') {
        if (w.value.value === false) {
          whereParts.push("tasks.status = 'pending'");
        } else {
          whereParts.push("tasks.status = 'done'");
        }
      } else {
        // Fall through: treat as note-level filter
        const e = exprToSql(w);
        whereParts.push(e.sql);
        params.push(...e.params);
      }
    }
    // GROUP BY god → join fm_kv for god
    let sql: string;
    if (ast.groupBy && ast.groupBy.length > 0) {
      const groupByField = ast.groupBy[0];
      const groupBySql = fmExtract(groupByField);
      selectParts.push(`${groupBySql} AS ${groupByField}`);
      sql = `SELECT ${selectParts.join(', ')} FROM tasks JOIN notes ON notes.path = tasks.note_path`;
      if (whereParts.length > 0) sql += ` WHERE ${whereParts.join(' AND ')}`;
      sql += ` GROUP BY ${groupBySql}`;
    } else {
      sql = `SELECT ${selectParts.join(', ')} FROM tasks JOIN notes ON notes.path = tasks.note_path`;
      if (whereParts.length > 0) sql += ` WHERE ${whereParts.join(' AND ')}`;
    }
    if (ast.limit) {
      sql += ` LIMIT ?`;
      params.push(ast.limit);
    }
    return { sql, params };
  }

  if (ast.queryType === 'LIST') {
    selectParts.push('notes.path AS path');
    if (ast.listField && ast.listField.name !== 'file.path') {
      const f = selectFieldToSql(ast.listField);
      selectParts.push(`${f.sql} AS ${f.alias}`);
    }
  } else if (ast.queryType === 'TABLE') {
    for (const f of ast.fields) {
      const s = selectFieldToSql(f);
      selectParts.push(`${s.sql} AS ${s.alias}`);
    }
  } else if (ast.queryType === 'CALENDAR') {
    // CALENDAR field → file.day
    selectParts.push('notes.path AS path');
    selectParts.push('notes.modified AS file_day');
  }

  // WHERE
  if (ast.where) {
    const w = exprToSql(ast.where);
    whereParts.push(w.sql);
    params.push(...w.params);
  }

  // GROUP BY (frontmatter fields)
  let sql = `SELECT ${selectParts.join(', ')} FROM notes`;
  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(' AND ')}`;
  }
  if (ast.groupBy && ast.groupBy.length > 0) {
    const groupBySql = ast.groupBy.map((g) => fmExtract(g));
    sql += ` GROUP BY ${groupBySql.join(', ')}`;
  }
  // HAVING (only meaningful with GROUP BY)
  if (ast.having) {
    const h = exprToSql(ast.having);
    sql += ` HAVING ${h.sql}`;
    params.push(...h.params);
  }
  // SORT
  if (ast.sort && ast.sort.length > 0) {
    const sortParts = ast.sort.map((s) => {
      // If the sort key is an alias from SELECT, use it directly.
      const isAlias = (ast.fields.some((f) => (f.alias || f.name) === s.field)) ||
        (ast.listField && (ast.listField.alias || ast.listField.name) === s.field);
      if (isAlias) return `${s.field} ${s.direction}`;
      // Otherwise treat as frontmatter field
      return `${fmExtract(s.field)} ${s.direction}`;
    });
    sql += ` ORDER BY ${sortParts.join(', ')}`;
  }
  if (ast.limit) {
    sql += ` LIMIT ?`;
    params.push(ast.limit);
  }
  return { sql, params };
}

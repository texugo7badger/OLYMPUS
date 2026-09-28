/**
 * Olympus Vault Query — DQL Parser
 * ===================================
 *
 * Hand-written recursive-descent parser for a Dataview-compatible DQL
 * subset. Produces an AST that `transpiler.ts` walks to emit SQL.
 *
 * Supported grammar (EBNF):
 *
 *   query        := queryType fromClause? whereClause? groupByClause?
 *                   havingClause? sortClause? limitClause?
 *   queryType    := 'TABLE' fieldList | 'LIST' field? | 'TASK' | 'CALENDAR' field
 *   fieldList    := field (',' field)*
 *   field        := identifier ('AS' alias)?           # AS alias optional
 *   fromClause   := 'FROM' source
 *   source       := stringLit | '#' tag | '[' source (',' source)* ']'
 *                  | '(' source ('AND' | 'OR' | 'AND NOT') source ')'
 *   whereClause  := 'WHERE' expr
 *   groupByClause:= 'GROUP BY' field (',' field)*
 *   havingClause := 'HAVING' expr
 *   sortClause   := 'SORT' field ('ASC' | 'DESC')? (',' field ('ASC' | 'DESC')?)*
 *   limitClause  := 'LIMIT' integer
 *   expr         := comparison (('AND' | 'OR') comparison)*
 *   comparison   := field op (literal | functionCall)
 *   op           := '=' | '!=' | '<' | '<=' | '>' | '>='
 *                  | 'contains' | '!contains'
 *   functionCall := funcName '(' argList? ')'
 *   funcName     := 'sum' | 'count' | 'avg' | 'min' | 'max' | 'date' | 'dur'
 *                  | 'today' | 'now' | 'yesterday' | 'file.day' | ...
 *   field        := identifier ('.' identifier)*
 *   literal      := stringLit | number | boolean | 'null'
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { QueryResult } from '../vault/types';

// ──────────────────────────────────────────────────────────────────────────
// AST node types
// ──────────────────────────────────────────────────────────────────────────

export type QueryType = 'TABLE' | 'LIST' | 'TASK' | 'CALENDAR';

export interface FieldNode {
  type: 'field';
  /** Raw field name, e.g. "god", "file.day", "confidence". */
  name: string;
  /** Optional alias (`AS events`). */
  alias?: string;
  /** Optional aggregate function wrapper, e.g. `count(*)`, `sum(tokens)`. */
  aggregate?: {
    func: string;
    arg: string; // '*' or a field name
  };
}

export interface StringLit {
  type: 'string';
  value: string;
}
export interface NumberLit {
  type: 'number';
  value: number;
}
export interface BoolLit {
  type: 'bool';
  value: boolean;
}
export interface NullLit {
  type: 'null';
}
export interface DateFunc {
  type: 'date-func';
  func: 'today' | 'now' | 'yesterday';
}
export interface DurLit {
  type: 'dur';
  amount: number;
  unit: 'days' | 'hours' | 'weeks' | 'months';
}
export interface FuncCall {
  type: 'func';
  name: string;
  args: Expr[];
}

export type Literal = StringLit | NumberLit | BoolLit | NullLit | DateFunc | DurLit | FuncCall | FieldNode;

export interface Comparison {
  type: 'comparison';
  field: FieldNode;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | '!contains';
  value: Literal;
}

export interface BinaryExpr {
  type: 'binary';
  op: 'AND' | 'OR';
  left: Expr;
  right: Expr;
}

export type Expr = Comparison | BinaryExpr;

export interface FromSource {
  type: 'path' | 'tag' | 'union' | 'intersection' | 'difference';
  /** For path/tag sources. */
  value?: string;
  /** For union/intersection/difference. */
  children?: FromSource[];
}

export interface SortKey {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface DqlAst {
  queryType: QueryType;
  fields: FieldNode[];
  /** `LIST` may have a single field expression. */
  listField?: FieldNode;
  from?: FromSource;
  where?: Expr;
  groupBy?: string[];
  having?: Expr;
  sort?: SortKey[];
  limit?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Tokenizer
// ──────────────────────────────────────────────────────────────────────────

interface Token {
  type: 'kw' | 'id' | 'string' | 'number' | 'op' | 'punct' | 'eof';
  value: string;
  pos: number;
}

const KEYWORDS = new Set([
  'TABLE', 'LIST', 'TASK', 'CALENDAR',
  'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'SORT', 'LIMIT',
  'AS', 'ASC', 'DESC', 'AND', 'OR', 'NOT',
  'contains',
  'today', 'now', 'yesterday', 'date', 'dur',
  'true', 'false', 'null',
]);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    // Line comments
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // String literal (double-quoted)
    if (c === '"') {
      let j = i + 1;
      let val = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) {
          val += src[j + 1];
          j += 2;
        } else {
          val += src[j];
          j++;
        }
      }
      if (j >= n) throw new Error(`Unterminated string at pos ${i}`);
      out.push({ type: 'string', value: val, pos: i });
      i = j + 1;
      continue;
    }
    // Number
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      out.push({ type: 'number', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // Identifier / keyword
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper) || KEYWORDS.has(word)) {
        out.push({ type: 'kw', value: upper, pos: i });
      } else {
        out.push({ type: 'id', value: word, pos: i });
      }
      i = j;
      continue;
    }
    // Operators
    if (c === '!' && src[i + 1] === '=') {
      out.push({ type: 'op', value: '!=', pos: i });
      i += 2;
      continue;
    }
    if (c === '!' && (i + 1 >= n || /[\sA-Za-z]/.test(src[i + 1]))) {
      // Unary `!` (e.g. `!completed` in a TASK WHERE clause)
      out.push({ type: 'op', value: '!', pos: i });
      i++;
      continue;
    }
    if (c === '<' && src[i + 1] === '=') {
      out.push({ type: 'op', value: '<=', pos: i });
      i += 2;
      continue;
    }
    if (c === '>' && src[i + 1] === '=') {
      out.push({ type: 'op', value: '>=', pos: i });
      i += 2;
      continue;
    }
    if ('=<>'.includes(c)) {
      out.push({ type: 'op', value: c, pos: i });
      i++;
      continue;
    }
    // Punctuation
    if ('()[],#*'.includes(c)) {
      out.push({ type: 'punct', value: c, pos: i });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${c}' at pos ${i}`);
  }
  out.push({ type: 'eof', value: '', pos: src.length });
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Parser
// ──────────────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(type: Token['type'], value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Expected ${type}${value ? ` "${value}"` : ''} but got ${t.type} "${t.value}" at pos ${t.pos}`,
      );
    }
    return this.next();
  }

  private acceptKw(value: string): boolean {
    const t = this.peek();
    if (t.type === 'kw' && t.value === value) {
      this.next();
      return true;
    }
    return false;
  }

  parse(): DqlAst {
    const queryType = this.parseQueryType();
    const fields = this.parseFieldList(queryType);
    let listField: FieldNode | undefined;
    if (queryType === 'LIST' && fields.length === 0) {
      // LIST with no fields → use file.path implicitly.
      listField = { type: 'field', name: 'file.path' };
    } else if (queryType === 'LIST' && fields.length === 1) {
      listField = fields[0];
    }
    const from = this.parseFromClause();
    const where = this.parseWhereClause();
    const groupBy = this.parseGroupByClause();
    const having = this.parseHavingClause();
    const sort = this.parseSortClause();
    const limit = this.parseLimitClause();
    return { queryType, fields, listField, from, where, groupBy, having, sort, limit };
  }

  private parseQueryType(): QueryType {
    const t = this.peek();
    if (t.type !== 'kw' || !['TABLE', 'LIST', 'TASK', 'CALENDAR'].includes(t.value)) {
      throw new Error(`Expected query type (TABLE|LIST|TASK|CALENDAR) at pos ${t.pos}`);
    }
    this.next();
    return t.value as QueryType;
  }

  private parseFieldList(queryType: QueryType): FieldNode[] {
    if (queryType === 'TASK' || queryType === 'CALENDAR') {
      // TASK has no field list; CALENDAR has one optional field
      if (queryType === 'CALENDAR' && this.peek().type === 'id') {
        return [this.parseField()];
      }
      return [];
    }
    if (queryType === 'LIST') {
      // LIST can have 0 or 1 field expression
      const t = this.peek();
      if (t.type === 'kw' && t.value === 'FROM') return [];
      if (t.type === 'eof' || (t.type === 'kw' && ['WHERE', 'SORT', 'LIMIT', 'GROUP', 'HAVING'].includes(t.value))) {
        return [];
      }
      return [this.parseField()];
    }
    // TABLE fieldList
    const fields: FieldNode[] = [this.parseField()];
    while (this.peek().type === 'punct' && this.peek().value === ',') {
      this.next();
      fields.push(this.parseField());
    }
    return fields;
  }

  private parseField(): FieldNode {
    // Aggregate? `func(arg)` followed by optional AS alias
    const t = this.peek();
    if (t.type === 'id' && this.peek(1).type === 'punct' && this.peek(1).value === '(') {
      const funcName = t.value.toLowerCase();
      this.next(); // function name
      this.next(); // (
      const argTok = this.peek();
      let arg = '*';
      if (!(argTok.type === 'punct' && argTok.value === ')')) {
        // Allow `*` as an argument (for count(*)).
        if (argTok.type === 'punct' && argTok.value === '*') {
          this.next();
          arg = '*';
        } else {
          arg = this.expect('id').value;
          if (arg.includes('.')) {
            // keep dotted name as-is
          }
        }
      }
      this.expect('punct', ')');
      const alias = this.acceptKw('AS') ? this.expect('id').value : undefined;
      return { type: 'field', name: arg, alias, aggregate: { func: funcName, arg } };
    }
    const name = this.expect('id').value;
    const alias = this.acceptKw('AS') ? this.expect('id').value : undefined;
    return { type: 'field', name, alias };
  }

  private parseFromClause(): FromSource | undefined {
    if (!this.acceptKw('FROM')) return undefined;
    return this.parseSource();
  }

  private parseSource(): FromSource {
    const t = this.peek();
    if (t.type === 'string') {
      this.next();
      return { type: 'path', value: t.value };
    }
    if (t.type === 'punct' && t.value === '#') {
      this.next();
      const tagName = this.expect('id').value;
      return { type: 'tag', value: tagName };
    }
    if (t.type === 'punct' && t.value === '[') {
      this.next();
      const children: FromSource[] = [this.parseSource()];
      while (this.peek().type === 'punct' && this.peek().value === ',') {
        this.next();
        children.push(this.parseSource());
      }
      this.expect('punct', ']');
      return { type: 'union', children };
    }
    if (t.type === 'punct' && t.value === '(') {
      this.next();
      const left = this.parseSource();
      const opTok = this.peek();
      let op: 'AND' | 'OR' | 'AND NOT' = 'OR';
      if (opTok.type === 'kw' && opTok.value === 'AND') {
        this.next();
        if (this.acceptKw('NOT')) op = 'AND NOT';
        else op = 'AND';
      } else if (opTok.type === 'kw' && opTok.value === 'OR') {
        this.next();
        op = 'OR';
      } else {
        throw new Error(`Expected AND|OR inside parenthesized source at pos ${opTok.pos}`);
      }
      const right = this.parseSource();
      this.expect('punct', ')');
      return {
        type: op === 'AND' ? 'intersection' : op === 'AND NOT' ? 'difference' : 'union',
        children: [left, right],
      };
    }
    throw new Error(`Expected source at pos ${t.pos}, got ${t.type} "${t.value}"`);
  }

  private parseWhereClause(): Expr | undefined {
    if (!this.acceptKw('WHERE')) return undefined;
    return this.parseExpr();
  }

  private parseExpr(): Expr {
    let left = this.parseComparison();
    while (true) {
      const t = this.peek();
      if (t.type === 'kw' && (t.value === 'AND' || t.value === 'OR')) {
        this.next();
        const right = this.parseComparison();
        left = { type: 'binary', op: t.value as 'AND' | 'OR', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(): Expr {
    // Handle unary `!field` — sugar for `field = false`. Used in TASK queries
    // (`WHERE !completed`).
    const peekTok = this.peek();
    if (peekTok.type === 'op' && peekTok.value === '!') {
      this.next();
      const field = this.parseField();
      return {
        type: 'comparison',
        field,
        op: '=',
        value: { type: 'bool', value: false },
      };
    }
    const field = this.parseField();
    const opTok = this.peek();
    let op: Comparison['op'];
    if (opTok.type === 'op') {
      op = opTok.value as Comparison['op'];
      this.next();
    } else if (opTok.type === 'kw' && opTok.value === 'contains') {
      op = 'contains';
      this.next();
    } else if (opTok.type === 'kw' && opTok.value === 'NOT') {
      this.next();
      this.expect('kw', 'contains');
      op = '!contains';
    } else {
      throw new Error(`Expected operator at pos ${opTok.pos}, got ${opTok.type} "${opTok.value}"`);
    }
    const value = this.parseLiteral();
    return { type: 'comparison', field, op, value };
  }

  private parseLiteral(): Literal {
    const t = this.peek();
    if (t.type === 'string') {
      this.next();
      return { type: 'string', value: t.value };
    }
    if (t.type === 'number') {
      this.next();
      return { type: 'number', value: parseFloat(t.value) };
    }
    if (t.type === 'kw' && t.value === 'true') {
      this.next();
      return { type: 'bool', value: true };
    }
    if (t.type === 'kw' && t.value === 'false') {
      this.next();
      return { type: 'bool', value: false };
    }
    if (t.type === 'kw' && t.value === 'null') {
      this.next();
      return { type: 'null' };
    }
    if (t.type === 'kw' && t.value === 'today') {
      this.next();
      return { type: 'date-func', func: 'today' };
    }
    if (t.type === 'kw' && t.value === 'now') {
      this.next();
      return { type: 'date-func', func: 'now' };
    }
    if (t.type === 'kw' && t.value === 'yesterday') {
      this.next();
      return { type: 'date-func', func: 'yesterday' };
    }
    if (t.type === 'kw' && t.value === 'date') {
      this.next();
      this.expect('punct', '(');
      const inner = this.parseLiteral();
      this.expect('punct', ')');
      return inner;
    }
    if (t.type === 'kw' && t.value === 'dur') {
      this.next();
      this.expect('punct', '(');
      const numTok = this.expect('number');
      const unitTok = this.expect('id');
      this.expect('punct', ')');
      const unit = unitTok.value.toLowerCase();
      if (!['days', 'hours', 'weeks', 'months'].includes(unit)) {
        throw new Error(`Unknown dur unit "${unit}"`);
      }
      return {
        type: 'dur',
        amount: parseFloat(numTok.value),
        unit: unit as 'days' | 'hours' | 'weeks' | 'months',
      };
    }
    if (t.type === 'id') {
      // function call or field reference
      if (this.peek(1).type === 'punct' && this.peek(1).value === '(') {
        const name = t.value;
        this.next();
        this.next();
        const args: Expr[] = [];
        if (!(this.peek().type === 'punct' && this.peek().value === ')')) {
          args.push(this.parseExpr());
          while (this.peek().type === 'punct' && this.peek().value === ',') {
            this.next();
            args.push(this.parseExpr());
          }
        }
        this.expect('punct', ')');
        return { type: 'func', name, args };
      }
      return this.parseField();
    }
    throw new Error(`Expected literal at pos ${t.pos}, got ${t.type} "${t.value}"`);
  }

  private parseGroupByClause(): string[] | undefined {
    if (!this.acceptKw('GROUP')) return undefined;
    this.expect('kw', 'BY');
    const fields: string[] = [this.expect('id').value];
    while (this.peek().type === 'punct' && this.peek().value === ',') {
      this.next();
      fields.push(this.expect('id').value);
    }
    return fields;
  }

  private parseHavingClause(): Expr | undefined {
    if (!this.acceptKw('HAVING')) return undefined;
    return this.parseExpr();
  }

  private parseSortClause(): SortKey[] | undefined {
    if (!this.acceptKw('SORT')) return undefined;
    const keys: SortKey[] = [this.parseSortKey()];
    while (this.peek().type === 'punct' && this.peek().value === ',') {
      this.next();
      keys.push(this.parseSortKey());
    }
    return keys;
  }

  private parseSortKey(): SortKey {
    const field = this.expect('id').value;
    let direction: 'ASC' | 'DESC' = 'ASC';
    if (this.acceptKw('DESC')) direction = 'DESC';
    else if (this.acceptKw('ASC')) direction = 'ASC';
    return { field, direction };
  }

  private parseLimitClause(): number | undefined {
    if (!this.acceptKw('LIMIT')) return undefined;
    return parseInt(this.expect('number').value, 10);
  }
}

/**
 * Parse a DQL string into an AST. Throws on syntax errors.
 *
 * @example
 *   parseDql('TABLE god, count(*) AS events FROM "06_Activity_Feed" GROUP BY god SORT events DESC LIMIT 10')
 */
export function parseDql(src: string): DqlAst {
  const tokens = tokenize(src);
  return new Parser(tokens).parse();
}

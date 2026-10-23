import path from "node:path"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

/**
 * #188 follow-up (2026-10-23): the ECC store that used to live at
 * `.opencode/plugins/lib/changed-files-store.js` was DELETED with the v2
 * plugin migration (its writer, ecc-hooks, retired under #189) — but this
 * tool still imported it, and the v2 ToolRegistry hard-failed on the resolve
 * (`Cannot find module '../plugins/lib/changed-files-store.js'`,
 * opencode.log 2026-10-23T21:00:06Z). The store is inlined here instead of
 * restoring a legacy plugin directory: same shape, no cross-directory
 * import, no auto-discovery ambiguity.
 */

export type ChangeType = "added" | "modified" | "deleted"

export interface TreeNode {
  name: string
  path: string
  changeType?: ChangeType
  children: TreeNode[]
}

const changes = new Map<string, ChangeType>()
let worktreeRoot = ""

export function initStore(worktree: string): void {
  worktreeRoot = worktree || process.cwd()
}

/** Paths are recorded relative to the worktree (absolute paths normalized). */
function toRelative(p: string): string {
  if (!p) return ""
  const normalized = path.normalize(p)
  if (path.isAbsolute(normalized) && worktreeRoot) {
    const rel = path.relative(worktreeRoot, normalized)
    return rel.startsWith("..") ? normalized : rel
  }
  return normalized
}

export function recordChange(filePath: string, type: ChangeType): void {
  const rel = toRelative(filePath)
  if (!rel) return
  changes.set(rel, type)
}

export function getChanges(): Map<string, ChangeType> {
  return new Map(changes)
}

export function clearChanges(): void {
  changes.clear()
}

function addToTree(
  children: TreeNode[],
  segs: string[],
  fullPath: string,
  changeType: ChangeType,
): void {
  if (segs.length === 0) return
  const [head, ...rest] = segs
  let child = children.find((c) => c.name === head)
  if (rest.length === 0) {
    if (child) {
      child.changeType = changeType
      child.path = fullPath
    } else {
      children.push({ name: head, path: fullPath, changeType, children: [] })
    }
    return
  }
  if (!child) {
    // segs.length - rest.length is the correct slice end for the directory
    // path (the original `slice(0, -rest.length)` collapsed to the first
    // segment for every depth — fixed upstream, kept here verbatim).
    const dirPath = segs.slice(0, segs.length - rest.length).join(path.sep)
    child = { name: head, path: dirPath, children: [] }
    children.push(child)
  }
  addToTree(child.children, rest, fullPath, changeType)
}

export function buildTree(filter?: ChangeType): TreeNode[] {
  const root: TreeNode[] = []
  for (const [relPath, changeType] of changes) {
    if (filter && changeType !== filter) continue
    const segs = relPath.split(path.sep).filter(Boolean)
    if (segs.length === 0) continue
    addToTree(root, segs, relPath, changeType)
  }
  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return [...nodes]
      .sort((a, b) => {
        const aIsFile = a.changeType !== undefined
        const bIsFile = b.changeType !== undefined
        if (aIsFile !== bIsFile) return aIsFile ? 1 : -1
        return a.name.localeCompare(b.name)
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
  }
  return sortNodes(root)
}

export function getChangedPaths(filter?: ChangeType): { path: string; changeType: ChangeType }[] {
  const list: { path: string; changeType: ChangeType }[] = []
  for (const [p, t] of changes) {
    if (filter && t !== filter) continue
    list.push({ path: p, changeType: t })
  }
  list.sort((a, b) => a.path.localeCompare(b.path))
  return list
}

export function hasChanges(): boolean {
  return changes.size > 0
}

const INDICATORS: Record<ChangeType, string> = {
  added: "+",
  modified: "~",
  deleted: "-",
}

function renderTree(nodes: TreeNode[], indent: string): string {
  const lines: string[] = []
  for (const node of nodes) {
    const indicator = node.changeType ? ` (${INDICATORS[node.changeType]})` : ""
    const name = node.changeType ? `${node.name}${indicator}` : `${node.name}/`
    lines.push(`${indent}${name}`)
    if (node.children.length > 0) {
      lines.push(renderTree(node.children, `${indent}  `))
    }
  }
  return lines.join("\n")
}

const changedFilesTool: ToolDefinition = tool({
  description:
    "List files changed by agents in this session as a navigable tree. Shows added (+), modified (~), and deleted (-) indicators. Use filter to show only specific change types. Returns paths for git diff.",
  args: {
    filter: tool.schema
      .enum(["all", "added", "modified", "deleted"])
      .optional()
      .describe("Filter by change type (default: all)"),
    format: tool.schema
      .enum(["tree", "json"])
      .optional()
      .describe("Output format: tree for terminal display, json for structured data (default: tree)"),
  },
  async execute(args, context) {
    const filter = args.filter === "all" || !args.filter ? undefined : (args.filter as ChangeType)
    const format = args.format ?? "tree"

    if (!hasChanges()) {
      return JSON.stringify({ changed: false, message: "No files changed in this session" })
    }

    const paths = getChangedPaths(filter)

    if (format === "json") {
      return JSON.stringify(
        {
          changed: true,
          filter: filter ?? "all",
          files: paths.map((p) => ({ path: p.path, changeType: p.changeType })),
          diffCommands: paths
            .filter((p) => p.changeType !== "added")
            .map((p) => `git diff ${p.path}`),
        },
        null,
        2
      )
    }

    const tree = buildTree(filter)
    const treeStr = renderTree(tree, "")
    const diffHint = paths
      .filter((p) => p.changeType !== "added")
      .slice(0, 5)
      .map((p) => `  git diff ${p.path}`)
      .join("\n")

    let output = `Changed files (${paths.length}):\n\n${treeStr}`
    if (diffHint) {
      output += `\n\nTo view diff for a file:\n${diffHint}`
    }
    return output
  },
})

export default changedFilesTool

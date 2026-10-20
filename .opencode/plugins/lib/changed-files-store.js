"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStore = initStore;
exports.recordChange = recordChange;
exports.getChanges = getChanges;
exports.clearChanges = clearChanges;
exports.buildTree = buildTree;
exports.getChangedPaths = getChangedPaths;
exports.hasChanges = hasChanges;
const path = __importStar(require("path"));
const changes = new Map();
let worktreeRoot = "";
function initStore(worktree) {
    worktreeRoot = worktree || process.cwd();
}
function toRelative(p) {
    if (!p)
        return "";
    const normalized = path.normalize(p);
    if (path.isAbsolute(normalized) && worktreeRoot) {
        const rel = path.relative(worktreeRoot, normalized);
        return rel.startsWith("..") ? normalized : rel;
    }
    return normalized;
}
function recordChange(filePath, type) {
    const rel = toRelative(filePath);
    if (!rel)
        return;
    changes.set(rel, type);
}
function getChanges() {
    return new Map(changes);
}
function clearChanges() {
    changes.clear();
}
function addToTree(children, segs, fullPath, changeType) {
    if (segs.length === 0)
        return;
    const [head, ...rest] = segs;
    let child = children.find((c) => c.name === head);
    if (rest.length === 0) {
        if (child) {
            child.changeType = changeType;
            child.path = fullPath;
        }
        else {
            children.push({ name: head, path: fullPath, changeType, children: [] });
        }
        return;
    }
    if (!child) {
        // Fix: segs.length - rest.length gives the correct slice end for the
        // directory path. The original `segs.slice(0, -rest.length)` was a bug —
        // for segs of length N, rest.length = N-1, so -rest.length = 1-N, and
        // slice(0, 1-N) always returned just [segs[0]] (the first segment only).
        const dirPath = segs.slice(0, segs.length - rest.length).join(path.sep);
        child = { name: head, path: dirPath, children: [] };
        children.push(child);
    }
    addToTree(child.children, rest, fullPath, changeType);
}
function buildTree(filter) {
    const root = [];
    for (const [relPath, changeType] of changes) {
        if (filter && changeType !== filter)
            continue;
        const segs = relPath.split(path.sep).filter(Boolean);
        if (segs.length === 0)
            continue;
        addToTree(root, segs, relPath, changeType);
    }
    function sortNodes(nodes) {
        return [...nodes].sort((a, b) => {
            const aIsFile = a.changeType !== undefined;
            const bIsFile = b.changeType !== undefined;
            if (aIsFile !== bIsFile)
                return aIsFile ? 1 : -1;
            return a.name.localeCompare(b.name);
        }).map((n) => ({ ...n, children: sortNodes(n.children) }));
    }
    return sortNodes(root);
}
function getChangedPaths(filter) {
    const list = [];
    for (const [p, t] of changes) {
        if (filter && t !== filter)
            continue;
        list.push({ path: p, changeType: t });
    }
    list.sort((a, b) => a.path.localeCompare(b.path));
    return list;
}
function hasChanges() {
    return changes.size > 0;
}
//# sourceMappingURL=changed-files-store.js.map
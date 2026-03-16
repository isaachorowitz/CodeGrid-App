import { memo, useState, useCallback, useEffect, useRef } from "react";
import { listDirectory, type FileEntry } from "../lib/ipc";
import { useAppStore } from "../stores/appStore";

// File extension to color mapping for visual hints
const EXT_COLORS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#f7df1e",
  json: "#cb8742",
  md: "#519aba",
  css: "#563d7c",
  scss: "#c6538c",
  html: "#e34c26",
  rs: "#dea584",
  toml: "#9c4221",
  yaml: "#cb171e",
  yml: "#cb171e",
  py: "#3572a5",
  go: "#00add8",
  sh: "#89e051",
  zsh: "#89e051",
  bash: "#89e051",
  svg: "#ffb13b",
  png: "#a074c4",
  jpg: "#a074c4",
  gif: "#a074c4",
  lock: "#555555",
  env: "#ecd53f",
  gitignore: "#f14e32",
  dockerfile: "#384d54",
};

function getFileColor(name: string): string {
  // Special file names
  const lower = name.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile."))
    return EXT_COLORS.dockerfile || "#888888";
  if (lower === ".gitignore") return EXT_COLORS.gitignore || "#888888";
  if (lower === ".env" || lower.startsWith(".env."))
    return EXT_COLORS.env || "#888888";

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "#888888";
}

// Git status indicator colors
const GIT_STATUS_COLORS: Record<string, string> = {
  M: "#ffab00",
  A: "#00c853",
  D: "#ff3d00",
  U: "#d500f9",
  "?": "#555555",
};

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  filter: string;
  gitChanges: Map<string, string>;
  onFileClick: (path: string) => void;
  selectedPath: string | null;
}

const FileTreeNode = memo(function FileTreeNode({
  entry,
  depth,
  filter,
  gitChanges,
  onFileClick,
  selectedPath,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [children, setChildren] = useState<FileEntry[] | null>(
    entry.children ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isSelected = selectedPath === entry.path;

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!entry.is_dir) {
        onFileClick(entry.path);
        return;
      }

      if (!expanded && children === null) {
        // Lazy load children
        setLoading(true);
        try {
          const result = await listDirectory(entry.path, 1);
          setChildren(result);
        } catch {
          setChildren([]);
        }
        setLoading(false);
      }
      setExpanded(!expanded);
    },
    [expanded, children, entry.path, entry.is_dir, onFileClick],
  );

  // Filter logic
  const matchesFilter =
    !filter ||
    entry.name.toLowerCase().includes(filter.toLowerCase());

  // For directories, also check if any children match
  const hasMatchingChildren = entry.is_dir && filter && children
    ? children.some((c) =>
        c.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : false;

  if (filter && !matchesFilter && !hasMatchingChildren && !entry.is_dir) {
    return null;
  }

  // Auto-expand directories when filtering
  const shouldShowExpanded =
    entry.is_dir && (expanded || (!!filter && hasMatchingChildren));

  // Git status for this file
  const gitStatus = gitChanges.get(entry.name) ?? gitChanges.get(entry.path);

  return (
    <div>
      <div
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "1px 0",
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: "8px",
          cursor: "pointer",
          background: isSelected
            ? "#1e1e1e"
            : hovered
              ? "#1a1a1a"
              : "transparent",
          borderLeft: isSelected
            ? "2px solid #ff8c00"
            : "2px solid transparent",
          minHeight: "20px",
          userSelect: "none",
        }}
      >
        {/* Expand/collapse icon for dirs */}
        {entry.is_dir ? (
          <span
            style={{
              width: "14px",
              flexShrink: 0,
              color: "#ff8c00",
              fontSize: "9px",
              textAlign: "center",
              display: "inline-block",
            }}
          >
            {loading ? "..." : shouldShowExpanded ? "\u25BC" : "\u25B6"}
          </span>
        ) : (
          <span style={{ width: "14px", flexShrink: 0 }} />
        )}

        {/* File/dir name */}
        <span
          style={{
            color: entry.is_dir ? "#e0e0e0" : getFileColor(entry.name),
            fontSize: "11px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            fontWeight: entry.is_dir ? "bold" : "normal",
          }}
        >
          {entry.name}
        </span>

        {/* Git status indicator */}
        {gitStatus && (
          <span
            style={{
              color: GIT_STATUS_COLORS[gitStatus] ?? "#888888",
              fontSize: "9px",
              fontWeight: "bold",
              flexShrink: 0,
              marginLeft: "4px",
            }}
          >
            {gitStatus}
          </span>
        )}
      </div>

      {/* Children */}
      {entry.is_dir && shouldShowExpanded && children && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              filter={filter}
              gitChanges={gitChanges}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
            />
          ))}
          {children.length === 0 && (
            <div
              style={{
                paddingLeft: `${(depth + 1) * 14 + 22}px`,
                color: "#444444",
                fontSize: "10px",
                fontStyle: "italic",
                padding: "2px 0",
              }}
            >
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
});

interface FileTreeProps {
  rootPath: string;
  gitChanges?: Map<string, string>;
}

export const FileTree = memo(function FileTree({
  rootPath,
  gitChanges: externalGitChanges,
}: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);

  const gitChanges = externalGitChanges ?? new Map<string, string>();

  const loadTree = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listDirectory(rootPath, 2);
      setEntries(result);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [rootPath]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const setCodeViewerOpen = useAppStore((s) => s.setCodeViewerOpen);

  const handleFileClick = useCallback((path: string) => {
    setSelectedPath((prev) => (prev === path ? null : path));
    setShowPath(true);
    // Auto-hide path after 3 seconds
    setTimeout(() => setShowPath(false), 3000);
    // Open CodeViewer for the selected file, passing workingDir so DIFF mode works
    setCodeViewerOpen(true, path, { workingDir: rootPath });
  }, [setCodeViewerOpen, rootPath]);

  const handleRefresh = useCallback(() => {
    loadTree();
  }, [loadTree]);

  if (loading && entries.length === 0) {
    return (
      <div
        style={{
          padding: "8px 12px",
          color: "#555555",
          fontSize: "10px",
          fontStyle: "italic",
        }}
      >
        Loading file tree...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "8px 12px",
          color: "#ff3d00",
          fontSize: "10px",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Search filter */}
      <div
        style={{
          padding: "4px 8px",
          display: "flex",
          gap: "4px",
          alignItems: "center",
        }}
      >
        <input
          ref={filterRef}
          type="text"
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            padding: "3px 6px",
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#ff8c00";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#2a2a2a";
          }}
        />
        <button
          onClick={handleRefresh}
          title="Refresh"
          style={{
            background: "none",
            border: "1px solid #2a2a2a",
            color: "#555555",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            cursor: "pointer",
            padding: "2px 5px",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ff8c00";
            e.currentTarget.style.borderColor = "#ff8c00";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#555555";
            e.currentTarget.style.borderColor = "#2a2a2a";
          }}
        >
          {"\u21BB"}
        </button>
      </div>

      {/* Tree entries */}
      <div style={{ overflow: "auto", flex: 1 }}>
        {entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            filter={filter}
            gitChanges={gitChanges}
            onFileClick={handleFileClick}
            selectedPath={selectedPath}
          />
        ))}
        {entries.length === 0 && !loading && (
          <div
            style={{
              padding: "8px 12px",
              color: "#555555",
              fontSize: "10px",
              textAlign: "center",
            }}
          >
            No files found.
          </div>
        )}
      </div>

      {/* Selected file path display */}
      {selectedPath && showPath && (
        <div
          style={{
            padding: "3px 8px",
            borderTop: "1px solid #2a2a2a",
            background: "#0a0a0a",
            color: "#555555",
            fontSize: "9px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            direction: "rtl",
            textAlign: "left",
          }}
          title={selectedPath}
        >
          <span style={{ unicodeBidi: "plaintext" }}>{selectedPath}</span>
        </div>
      )}
    </div>
  );
});

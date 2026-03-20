import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createFolder, listDirectory, renameFile, deleteFile, copyFile, moveFile, type FileEntry } from "../lib/ipc";
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

interface ContextMenuProps {
  x: number;
  y: number;
  entry: FileEntry;
  rootPath: string;
  onClose: () => void;
  onRefresh: () => void;
}

const ContextMenu = memo(function ContextMenu({ x, y, entry, rootPath, onClose, onRefresh }: ContextMenuProps) {
  const [action, setAction] = useState<"rename" | "move" | "copy" | "delete" | null>(null);
  const [inputValue, setInputValue] = useState(entry.name);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-context-menu]")) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    if (action === "rename") {
      setInputValue(entry.name);
      setTimeout(() => {
        inputRef.current?.focus();
        // Select name without extension
        const dotIdx = entry.name.lastIndexOf(".");
        inputRef.current?.setSelectionRange(0, dotIdx > 0 && !entry.is_dir ? dotIdx : entry.name.length);
      }, 50);
    } else if (action === "move" || action === "copy") {
      const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
      setInputValue(parent);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [action, entry]);

  const handleRename = async () => {
    if (!inputValue.trim() || inputValue === entry.name) { onClose(); return; }
    setLoading(true);
    setError(null);
    try {
      await renameFile(entry.path, inputValue.trim());
      onRefresh();
      onClose();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteFile(entry.path);
      onRefresh();
      onClose();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const handleMove = async () => {
    if (!inputValue.trim()) { onClose(); return; }
    setLoading(true);
    setError(null);
    try {
      await moveFile(entry.path, inputValue.trim());
      onRefresh();
      onClose();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const handleCopy = async () => {
    if (!inputValue.trim()) { onClose(); return; }
    setLoading(true);
    setError(null);
    try {
      await copyFile(entry.path, inputValue.trim());
      onRefresh();
      onClose();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const handleDuplicate = async () => {
    setLoading(true);
    setError(null);
    try {
      const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
      await copyFile(entry.path, parent);
      onRefresh();
      onClose();
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace";

  const menuItemStyle = (hovered: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    fontSize: "11px",
    color: hovered ? "#ff8c00" : "#e0e0e0",
    background: hovered ? "#1e1e1e" : "transparent",
    cursor: "pointer",
    fontFamily: MONO,
    border: "none",
    width: "100%",
    textAlign: "left",
    display: "block",
  });

  if (action === "rename") {
    return (
      <div data-context-menu style={{ position: "fixed", left: x, top: y, zIndex: 9999, background: "#1a1a1a", border: "1px solid #ff8c00", padding: "8px", minWidth: "200px" }}>
        <div style={{ fontSize: "9px", color: "#ff8c00", marginBottom: "4px", fontFamily: MONO, letterSpacing: "1px" }}>RENAME</div>
        <input ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") onClose(); }}
          style={{ width: "100%", boxSizing: "border-box", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", padding: "4px 6px", fontFamily: MONO, outline: "none" }}
        />
        {error && <div style={{ color: "#ff3d00", fontSize: "9px", marginTop: "4px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "4px", marginTop: "6px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: MONO }}>Cancel</button>
          <button onClick={handleRename} disabled={loading} style={{ background: "#ff8c00", border: "none", color: "#0a0a0a", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: MONO, fontWeight: "bold" }}>
            {loading ? "..." : "Rename"}
          </button>
        </div>
      </div>
    );
  }

  if (action === "delete") {
    return (
      <div data-context-menu style={{ position: "fixed", left: x, top: y, zIndex: 9999, background: "#1a1a1a", border: "1px solid #ff3d00", padding: "8px", minWidth: "200px" }}>
        <div style={{ fontSize: "9px", color: "#ff3d00", marginBottom: "4px", fontFamily: MONO, letterSpacing: "1px" }}>DELETE</div>
        <div style={{ color: "#e0e0e0", fontSize: "11px", fontFamily: MONO, marginBottom: "8px" }}>
          Delete <span style={{ color: "#ff8c00" }}>{entry.name}</span>?{entry.is_dir ? " (and all contents)" : ""}
        </div>
        {error && <div style={{ color: "#ff3d00", fontSize: "9px", marginBottom: "4px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: MONO }}>Cancel</button>
          <button onClick={handleDelete} disabled={loading} style={{ background: "#ff3d00", border: "none", color: "#fff", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: MONO, fontWeight: "bold" }}>
            {loading ? "..." : "Delete"}
          </button>
        </div>
      </div>
    );
  }

  if (action === "move" || action === "copy") {
    const isMove = action === "move";
    return (
      <div data-context-menu style={{ position: "fixed", left: x, top: y, zIndex: 9999, background: "#1a1a1a", border: "1px solid #ff8c00", padding: "8px", minWidth: "250px" }}>
        <div style={{ fontSize: "9px", color: "#ff8c00", marginBottom: "4px", fontFamily: MONO, letterSpacing: "1px" }}>{isMove ? "MOVE TO" : "COPY TO"}</div>
        <input ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") isMove ? handleMove() : handleCopy(); if (e.key === "Escape") onClose(); }}
          placeholder="Destination directory..."
          style={{ width: "100%", boxSizing: "border-box", background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#e0e0e0", fontSize: "11px", padding: "4px 6px", fontFamily: MONO, outline: "none" }}
        />
        {error && <div style={{ color: "#ff3d00", fontSize: "9px", marginTop: "4px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "4px", marginTop: "6px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: MONO }}>Cancel</button>
          <button onClick={isMove ? handleMove : handleCopy} disabled={loading} style={{ background: "#ff8c00", border: "none", color: "#0a0a0a", fontSize: "9px", padding: "2px 8px", cursor: "pointer", fontFamily: MONO, fontWeight: "bold" }}>
            {loading ? "..." : isMove ? "Move" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  // Default: show menu items
  return (
    <div data-context-menu style={{ position: "fixed", left: x, top: y, zIndex: 9999, background: "#1a1a1a", border: "1px solid #2a2a2a", minWidth: "140px", padding: "4px 0" }}>
      {[
        { label: "Rename", action: "rename" as const },
        { label: "Delete", action: "delete" as const },
        { label: "Move to...", action: "move" as const },
        { label: "Copy to...", action: "copy" as const },
      ].map((item) => {
        const [hovered, setHovered] = useState(false);
        return (
          <div
            key={item.label}
            onClick={() => setAction(item.action)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={menuItemStyle(hovered)}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
});

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  filter: string;
  gitChanges: Map<string, string>;
  onFileClick: (path: string) => void;
  selectedPath: string | null;
  onContextMenu: (entry: FileEntry, x: number, y: number) => void;
}

const FileTreeNode = memo(function FileTreeNode({
  entry,
  depth,
  filter,
  gitChanges,
  onFileClick,
  selectedPath,
  onContextMenu,
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
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(entry, e.clientX, e.clientY);
        }}
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
          boxShadow: isSelected ? "inset 2px 0 0 #ff8c00" : "none",
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
            fontSize: "12px",
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
              onContextMenu={onContextMenu}
            />
          ))}
          {children.length === 0 && (
            <div
              style={{
                paddingLeft: `${(depth + 1) * 14 + 22}px`,
                paddingTop: "2px",
                paddingBottom: "2px",
                color: "#444444",
                fontSize: "10px",
                fontStyle: "italic",
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
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const showPathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emptyMap = useMemo(() => new Map<string, string>(), []);
  const gitChanges = externalGitChanges ?? emptyMap;

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

  // Clean up the show-path timer on unmount to avoid state updates after unmount
  useEffect(() => {
    return () => {
      if (showPathTimerRef.current) {
        clearTimeout(showPathTimerRef.current);
      }
    };
  }, []);

  const setCodeViewerOpen = useAppStore((s) => s.setCodeViewerOpen);

  const handleFileClick = useCallback((path: string) => {
    setSelectedPath((prev) => (prev === path ? null : path));
    setShowPath(true);
    // Clear any previous timer before starting a new one
    if (showPathTimerRef.current) {
      clearTimeout(showPathTimerRef.current);
    }
    // Auto-hide path after 3 seconds
    showPathTimerRef.current = setTimeout(() => setShowPath(false), 3000);
    // Open CodeViewer for the selected file, passing workingDir so DIFF mode works
    setCodeViewerOpen(true, path, { workingDir: rootPath });
  }, [setCodeViewerOpen, rootPath]);

  const handleRefresh = useCallback(() => {
    loadTree();
  }, [loadTree]);

  const handleCreateFolder = useCallback(async () => {
    if (!rootPath || !newFolderName.trim() || creatingFolder) return;
    setCreatingFolder(true);
    setFolderError(null);
    try {
      await createFolder(rootPath, newFolderName.trim());
      setNewFolderName("");
      await loadTree();
    } catch (e) {
      setFolderError(String(e));
    } finally {
      setCreatingFolder(false);
    }
  }, [rootPath, newFolderName, creatingFolder, loadTree]);

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
            fontSize: "11px",
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
            fontSize: "11px",
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
      <div style={{ padding: "0 8px 4px 8px", display: "flex", gap: "4px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="New folder name..."
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          style={{
            flex: 1,
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            padding: "3px 6px",
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#4a9eff";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#2a2a2a";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateFolder();
          }}
        />
        <button
          onClick={handleCreateFolder}
          disabled={!newFolderName.trim() || creatingFolder}
          title="Create folder"
          style={{
            background: newFolderName.trim() && !creatingFolder ? "#1e1e1e" : "#111111",
            border: "1px solid #2a2a2a",
            color: newFolderName.trim() && !creatingFolder ? "#4a9eff" : "#444444",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            cursor: newFolderName.trim() && !creatingFolder ? "pointer" : "default",
            padding: "2px 6px",
            lineHeight: 1,
          }}
        >
          {creatingFolder ? "..." : "+DIR"}
        </button>
      </div>
      {folderError && (
        <div style={{ padding: "0 8px 4px 8px", color: "#ff3d00", fontSize: "9px" }}>
          {folderError}
        </div>
      )}

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
            onContextMenu={(entry: FileEntry, x: number, y: number) => setContextMenu({ x, y, entry })}
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
            direction: "ltr",
            textAlign: "left",
          }}
          title={selectedPath}
        >
          <span style={{ unicodeBidi: "plaintext" }}>{selectedPath}</span>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          rootPath={rootPath}
          onClose={() => setContextMenu(null)}
          onRefresh={loadTree}
        />
      )}
    </div>
  );
});

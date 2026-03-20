import { memo, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "../stores/appStore";
import { readFileContents, gitDiffFile, writeFileContents, gitStageHunk } from "../lib/ipc";

// ─── VS Code Dark+ Inspired Color Scheme ───
const COLORS = {
  keyword: "#569cd6",
  string: "#ce9178",
  comment: "#6a9955",
  number: "#b5cea8",
  type: "#4ec9b0",
  function: "#dcdcaa",
  variable: "#9cdcfe",
  jsx: "#4ec9b0",
  operator: "#d4d4d4",
  bracket: "#ffd700",
  decorator: "#dcdcaa",
  regex: "#d16969",
  objectKey: "#9cdcfe",
  importPath: "#ce9178",
  default: "#d4d4d4",
};

// Keywords for syntax coloring
const KEYWORDS = new Set([
  "const", "let", "var", "function", "import", "export", "return", "if", "else",
  "for", "while", "class", "def", "fn", "pub", "use", "mod", "struct", "impl",
  "async", "await", "new", "this", "self", "super", "type", "interface", "enum",
  "match", "switch", "case", "break", "continue", "try", "catch", "throw",
  "from", "as", "default", "extends", "implements", "static", "readonly",
  "typeof", "instanceof", "in", "of", "do", "finally", "yield", "void",
  "delete", "with", "debugger",
]);

const BUILTIN_VALUES = new Set([
  "true", "false", "null", "undefined", "None", "True", "False",
  "NaN", "Infinity", "console", "window", "document", "process",
  "require", "module", "exports", "global", "globalThis",
]);

const TYPE_KEYWORDS = new Set([
  "string", "number", "boolean", "object", "any", "void", "never",
  "unknown", "bigint", "symbol", "Array", "Promise", "Map", "Set",
  "Record", "Partial", "Required", "Readonly", "Pick", "Omit",
  "Exclude", "Extract", "ReturnType", "React", "JSX",
]);

interface Token {
  text: string;
  color: string;
}

// Multi-line tokenizer state
interface TokenizerState {
  inBlockComment: boolean;
  inTemplateLiteral: boolean;
}

function tokenizeLine(line: string, state: TokenizerState): { tokens: Token[]; state: TokenizerState } {
  const tokens: Token[] = [];
  let i = 0;
  const newState = { ...state };

  // Continue block comment from previous line
  if (newState.inBlockComment) {
    const endIdx = line.indexOf("*/");
    if (endIdx === -1) {
      tokens.push({ text: line, color: COLORS.comment });
      return { tokens, state: newState };
    }
    tokens.push({ text: line.slice(0, endIdx + 2), color: COLORS.comment });
    newState.inBlockComment = false;
    i = endIdx + 2;
  }

  // Continue template literal from previous line
  if (newState.inTemplateLiteral) {
    const endIdx = line.indexOf("`", i);
    if (endIdx === -1) {
      tokens.push({ text: line.slice(i), color: COLORS.string });
      return { tokens, state: newState };
    }
    tokens.push({ text: line.slice(i, endIdx + 1), color: COLORS.string });
    newState.inTemplateLiteral = false;
    i = endIdx + 1;
  }

  while (i < line.length) {
    // Block comments: /* ... */
    if (line[i] === "/" && line[i + 1] === "*") {
      const endIdx = line.indexOf("*/", i + 2);
      if (endIdx === -1) {
        tokens.push({ text: line.slice(i), color: COLORS.comment });
        newState.inBlockComment = true;
        return { tokens, state: newState };
      }
      tokens.push({ text: line.slice(i, endIdx + 2), color: COLORS.comment });
      i = endIdx + 2;
      continue;
    }

    // Line comments: // or # (but not #[ or #! which are Rust attributes, or #include)
    if (line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ text: line.slice(i), color: COLORS.comment });
      return { tokens, state: newState };
    }
    if (line[i] === "#" && (i === 0 || /\s/.test(line[i - 1] || "")) &&
        line[i + 1] !== "[" && line[i + 1] !== "!" && !/^#\s*include\b/.test(line.slice(i))) {
      tokens.push({ text: line.slice(i), color: COLORS.comment });
      return { tokens, state: newState };
    }

    // Decorators: @something
    if (line[i] === "@" && /[a-zA-Z_]/.test(line[i + 1] || "")) {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9_.]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), color: COLORS.decorator });
      i = j;
      continue;
    }

    // Template literals (backticks)
    if (line[i] === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== "`") {
        if (line[j] === "\\") j++;
        j++;
      }
      if (j >= line.length) {
        // Unterminated - continues next line
        tokens.push({ text: line.slice(i), color: COLORS.string });
        newState.inTemplateLiteral = true;
        return { tokens, state: newState };
      }
      j++; // include closing backtick
      tokens.push({ text: line.slice(i, j), color: COLORS.string });
      i = j;
      continue;
    }

    // Strings: double or single quotes
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      j++; // include closing quote
      // Check if this is an import/export path (after "from" or inside import)
      const prevText = tokens.map(t => t.text).join("");
      const isImportPath = /(?:from|import|require)\s*\(?$/.test(prevText.trimEnd());
      tokens.push({ text: line.slice(i, j), color: isImportPath ? COLORS.importPath : COLORS.string });
      i = j;
      continue;
    }

    // Regex literals (simple heuristic: /.../ not preceded by identifier)
    if (line[i] === "/" && i > 0) {
      const prevChar = line[i - 1];
      if (/[=(:,;!&|?+\-~^%<>\[{]/.test(prevChar) || (i >= 2 && line.slice(i - 2, i) === "=>")) {
        let j = i + 1;
        let escaped = false;
        let inCharClass = false;
        while (j < line.length) {
          if (escaped) { escaped = false; j++; continue; }
          if (line[j] === "\\") { escaped = true; j++; continue; }
          if (line[j] === "[") inCharClass = true;
          if (line[j] === "]") inCharClass = false;
          if (line[j] === "/" && !inCharClass) break;
          j++;
        }
        if (j < line.length) {
          j++; // closing /
          // optional flags
          while (j < line.length && /[gimsuy]/.test(line[j])) j++;
          tokens.push({ text: line.slice(i, j), color: COLORS.regex });
          i = j;
          continue;
        }
      }
    }

    // JSX tags: <Component or </Component or <div etc
    if (line[i] === "<" && /[a-zA-Z/]/.test(line[i + 1] || "")) {
      const selfOrClose = line[i + 1] === "/";
      const start = selfOrClose ? i + 2 : i + 1;
      let j = start;
      while (j < line.length && /[a-zA-Z0-9._]/.test(line[j])) j++;
      const tagName = line.slice(start, j);
      if (tagName.length > 0) {
        // Check if it looks like a JSX tag (PascalCase or known HTML)
        const isComponent = /^[A-Z]/.test(tagName);
        const isHtml = /^[a-z][a-z0-9]*$/.test(tagName);
        if (isComponent || isHtml) {
          tokens.push({ text: line.slice(i, selfOrClose ? i + 2 : i + 1), color: COLORS.bracket });
          tokens.push({ text: tagName, color: isComponent ? COLORS.jsx : COLORS.variable });
          i = j;
          continue;
        }
      }
    }

    // Self-closing JSX: />
    if (line[i] === "/" && line[i + 1] === ">") {
      tokens.push({ text: "/>", color: COLORS.bracket });
      i += 2;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i]) && (i === 0 || /[\s,;:=+\-*/(<>[{!&|^~%]/.test(line[i - 1] || ""))) {
      let j = i;
      // hex
      if (line[i] === "0" && (line[i + 1] === "x" || line[i + 1] === "X")) {
        j += 2;
        while (j < line.length && /[0-9a-fA-F_]/.test(line[j])) j++;
      } else {
        while (j < line.length && /[\d._eE]/.test(line[j])) j++;
      }
      tokens.push({ text: line.slice(i, j), color: COLORS.number });
      i = j;
      continue;
    }

    // Multi-char operators
    const twoChar = line.slice(i, i + 3);
    const threeCharOps = ["===", "!==", "...", ">>>" , "<<=", ">>="];
    if (threeCharOps.includes(twoChar)) {
      tokens.push({ text: twoChar, color: COLORS.operator });
      i += 3;
      continue;
    }
    const twoCharSlice = line.slice(i, i + 2);
    const twoCharOps = ["=>", "==", "!=", ">=", "<=", "&&", "||", "??", "++", "--", "+=", "-=", "*=", "/=", "**", "<<", ">>", "?."];
    if (twoCharOps.includes(twoCharSlice)) {
      tokens.push({ text: twoCharSlice, color: COLORS.operator });
      i += 2;
      continue;
    }

    // Single-char operators
    if ("=+-*/%!<>&|^~?".includes(line[i])) {
      tokens.push({ text: line[i], color: COLORS.operator });
      i++;
      continue;
    }

    // Brackets and parens
    if ("()[]{}".includes(line[i])) {
      tokens.push({ text: line[i], color: COLORS.bracket });
      i++;
      continue;
    }

    // Closing JSX >
    if (line[i] === ">") {
      tokens.push({ text: ">", color: COLORS.bracket });
      i++;
      continue;
    }

    // Words (identifiers / keywords)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);

      // Type annotations: ": Type" or "< Type >"
      const prevText = tokens.map(t => t.text).join("");
      const isAfterColon = /:\s*$/.test(prevText);
      const isAfterAngle = /<\s*$/.test(prevText) || /,\s*$/.test(prevText);

      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, color: COLORS.keyword });
      } else if (BUILTIN_VALUES.has(word)) {
        tokens.push({ text: word, color: COLORS.keyword });
      } else if (TYPE_KEYWORDS.has(word) || (isAfterColon && /^[A-Z]/.test(word)) || (isAfterAngle && /^[A-Z]/.test(word))) {
        tokens.push({ text: word, color: COLORS.type });
      } else if (/^[A-Z][a-zA-Z0-9]*$/.test(word) && !isAfterColon) {
        // PascalCase = type/class
        tokens.push({ text: word, color: COLORS.type });
      } else if (line[j] === "(") {
        // Function call
        tokens.push({ text: word, color: COLORS.function });
      } else {
        // Check if it's an object key (word followed by colon, not ::)
        let k = j;
        while (k < line.length && line[k] === " ") k++;
        if (line[k] === ":" && line[k + 1] !== ":") {
          tokens.push({ text: word, color: COLORS.objectKey });
        } else {
          tokens.push({ text: word, color: COLORS.variable });
        }
      }
      i = j;
      continue;
    }

    // Colon (for type annotations, etc.)
    if (line[i] === ":") {
      tokens.push({ text: ":", color: COLORS.operator });
      i++;
      continue;
    }

    // Semicolons, commas, dots
    if (";,.".includes(line[i])) {
      tokens.push({ text: line[i], color: COLORS.default });
      i++;
      continue;
    }

    // Whitespace and everything else
    tokens.push({ text: line[i], color: COLORS.default });
    i++;
  }

  return { tokens, state: newState };
}

// ─── Language Detection ───
const EXT_LANGUAGE: Record<string, string> = {
  ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX",
  json: "JSON", md: "Markdown", css: "CSS", scss: "SCSS",
  html: "HTML", rs: "Rust", toml: "TOML", yaml: "YAML", yml: "YAML",
  py: "Python", go: "Go", sh: "Shell", zsh: "Shell", bash: "Shell",
  rb: "Ruby", java: "Java", kt: "Kotlin", swift: "Swift",
  c: "C", cpp: "C++", h: "C Header", hpp: "C++ Header",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL",
  xml: "XML", svg: "SVG", vue: "Vue", svelte: "Svelte",
  lua: "Lua", zig: "Zig", asm: "Assembly", makefile: "Makefile",
  dockerfile: "Dockerfile", lock: "Lock", gitignore: "Git Ignore",
  env: "Environment",
};

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "Dockerfile";
  if (lower === "makefile") return "Makefile";
  if (lower === ".gitignore") return "Git Ignore";
  if (lower === ".env" || lower.startsWith(".env.")) return "Environment";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANGUAGE[ext] ?? (ext.toUpperCase() || "Plain Text");
}

// ─── Diff Parser (same as DiffViewer) ───
interface DiffLine {
  type: "add" | "del" | "context" | "hunk-header";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

function parseDiff(raw: string): DiffHunk[] {
  const lines = raw.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("diff ") || line.startsWith("index ")) continue;

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        currentHunk.lines.push({
          type: "hunk-header", content: match[3]?.trim() || "",
          oldLine: null, newLine: null,
        });
      }
      continue;
    }

    if (!currentHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
        currentHunk = { header: "@@ new file @@", lines: [] };
        hunks.push(currentHunk);
        oldLine = 0;
        newLine = 1;
      } else continue;
    }

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: line.slice(1), oldLine: null, newLine: newLine++ });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "del", content: line.slice(1), oldLine: oldLine++, newLine: null });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({ type: "context", content: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
    } else if (line === "\\ No newline at end of file") {
      // skip
    } else if (line.length > 0) {
      currentHunk.lines.push({ type: "context", content: line, oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return hunks;
}

// ─── Minimap Component ───
function Minimap({ content, scrollTop, clientHeight, scrollHeight, onSeek }: {
  content: string; scrollTop: number; clientHeight: number; scrollHeight: number;
  onSeek: (ratio: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<ImageData | null>(null);
  const MINIMAP_WIDTH = 60;
  // Derive minimap height from the visible area so it never overflows its container.
  // Cap between 80px and 400px for usability.
  const MINIMAP_HEIGHT = Math.max(80, Math.min(clientHeight > 0 ? clientHeight - 24 : 300, 400));

  // Pre-render the code structure (only when content or height changes)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    const lines = content.split("\n");
    const lineHeight = Math.max(1, MINIMAP_HEIGHT / Math.max(lines.length, 1));

    // Draw lines as tiny colored bars
    lines.forEach((line, idx) => {
      const y = idx * lineHeight;
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;
      const x = Math.min(indent * 0.5, 20);
      const w = Math.min(trimmed.length * 0.4, MINIMAP_WIDTH - x - 2);

      if (trimmed.length === 0) return;

      // Color based on content
      if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
        ctx.fillStyle = "#6a995540";
      } else if (trimmed.startsWith("import") || trimmed.startsWith("export")) {
        ctx.fillStyle = "#569cd640";
      } else if (trimmed.startsWith("function") || trimmed.startsWith("const") || trimmed.startsWith("class")) {
        ctx.fillStyle = "#dcdcaa30";
      } else {
        ctx.fillStyle = "#d4d4d420";
      }

      ctx.fillRect(x + 2, y, Math.max(w, 2), Math.max(lineHeight - 0.5, 0.5));
    });

    // Cache the rendered code structure
    bgImageRef.current = ctx.getImageData(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
  }, [content, MINIMAP_HEIGHT]);

  // Overlay the viewport indicator (runs on scroll without re-rendering lines)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImageRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Restore cached background
    ctx.putImageData(bgImageRef.current, 0, 0);

    // Viewport indicator
    if (scrollHeight > 0) {
      const viewTop = (scrollTop / scrollHeight) * MINIMAP_HEIGHT;
      const viewH = Math.max((clientHeight / scrollHeight) * MINIMAP_HEIGHT, 10);
      ctx.fillStyle = "rgba(255, 140, 0, 0.15)";
      ctx.fillRect(0, viewTop, MINIMAP_WIDTH, viewH);
      ctx.strokeStyle = "rgba(255, 140, 0, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, viewTop, MINIMAP_WIDTH, viewH);
    }
  }, [content, scrollTop, clientHeight, scrollHeight, MINIMAP_HEIGHT]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    onSeek(ratio);
  };

  return (
    <canvas
      ref={canvasRef}
      width={MINIMAP_WIDTH}
      height={MINIMAP_HEIGHT}
      onClick={handleClick}
      style={{
        position: "absolute",
        top: "8px",
        right: "8px",
        cursor: "pointer",
        opacity: 0.7,
        border: "1px solid #2a2a2a",
      }}
    />
  );
}


export const CodeViewer = memo(function CodeViewer() {
  const {
    codeViewerOpen, codeViewerFile, codeViewerDiffMode, codeViewerWorkingDir,
    setCodeViewerOpen,
  } = useAppStore();

  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"code" | "diff">("code");
  const [diffContent, setDiffContent] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [wrapLines, setWrapLines] = useState(false);
  const [panelHeight, setPanelHeight] = useState(Math.floor(window.innerHeight * 0.7));
  const [isResizing, setIsResizing] = useState(false);
  const [scrollState, setScrollState] = useState({ top: 0, clientH: 0, scrollH: 0 });
  const [editorLocked, setEditorLocked] = useState(true);
  const [editBuffer, setEditBuffer] = useState("");
  const [saving, setSaving] = useState(false);
  const [stagingHunk, setStagingHunk] = useState<string | null>(null);
  const [stageSuccess, setStageSuccess] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Sync viewMode with diffMode from store.
  // Include codeViewerOpen so that re-opening the same file resets the mode.
  useEffect(() => {
    if (codeViewerOpen) {
      setViewMode(codeViewerDiffMode ? "diff" : "code");
    }
  }, [codeViewerDiffMode, codeViewerFile, codeViewerOpen]);

  const fetchContent = useCallback(async () => {
    if (!codeViewerFile) return;
    setLoading(true);
    setError(null);
    try {
      const result = await readFileContents(codeViewerFile);
      setContent(result);
      setEditBuffer(result);
    } catch (e) {
      setError(String(e));
      setContent("");
      setEditBuffer("");
    }
    setLoading(false);
  }, [codeViewerFile]);

  const fetchDiff = useCallback(async () => {
    if (!codeViewerFile || !codeViewerWorkingDir) {
      setDiffError("No working directory available for diff");
      return;
    }
    setDiffLoading(true);
    setDiffError(null);
    try {
      // Extract relative path from full path
      let relativePath = codeViewerFile;
      if (codeViewerFile.startsWith(codeViewerWorkingDir)) {
        relativePath = codeViewerFile.slice(codeViewerWorkingDir.length);
        if (relativePath.startsWith("/")) relativePath = relativePath.slice(1);
      }
      // Try unstaged first, then staged
      let result = await gitDiffFile(codeViewerWorkingDir, relativePath, false);
      if (!result.trim()) {
        result = await gitDiffFile(codeViewerWorkingDir, relativePath, true);
      }
      setDiffContent(result);
    } catch (e) {
      setDiffError(String(e));
      setDiffContent("");
    }
    setDiffLoading(false);
  }, [codeViewerFile, codeViewerWorkingDir]);

  const handleStageHunk = useCallback(async (hunkHeader: string, filePath: string) => {
    if (!codeViewerWorkingDir || stagingHunk) return;
    setStagingHunk(hunkHeader);
    setStageSuccess(null);
    try {
      let relativePath = filePath || codeViewerFile || "";
      if (codeViewerWorkingDir && relativePath.startsWith(codeViewerWorkingDir)) {
        relativePath = relativePath.slice(codeViewerWorkingDir.length);
        if (relativePath.startsWith("/")) relativePath = relativePath.slice(1);
      }
      await gitStageHunk(codeViewerWorkingDir, relativePath, hunkHeader);
      setStageSuccess(hunkHeader);
      setTimeout(() => {
        fetchDiff();
        setStageSuccess(null);
      }, 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setStagingHunk(null);
    }
  }, [codeViewerWorkingDir, codeViewerFile, stagingHunk, fetchDiff]);

  useEffect(() => {
    if (codeViewerOpen && codeViewerFile) {
      fetchContent();
      setEditorLocked(true);
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
  }, [codeViewerOpen, codeViewerFile, fetchContent]);

  // Fetch diff when switching to diff mode
  useEffect(() => {
    if (viewMode === "diff" && codeViewerOpen && codeViewerFile) {
      fetchDiff();
    }
  }, [viewMode, codeViewerOpen, codeViewerFile, fetchDiff]);

  // Track scroll position for minimap
  const handleScroll = useCallback(() => {
    if (contentRef.current) {
      setScrollState({
        top: contentRef.current.scrollTop,
        clientH: contentRef.current.clientHeight,
        scrollH: contentRef.current.scrollHeight,
      });
    }
  }, []);

  // ESC to close
  useEffect(() => {
    if (!codeViewerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setCodeViewerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [codeViewerOpen, setCodeViewerOpen]);

  const hasPendingChanges = viewMode === "code" && editBuffer !== content;

  const handleApply = useCallback(async () => {
    if (!codeViewerFile || editorLocked || !hasPendingChanges || saving) return;
    setSaving(true);
    try {
      await writeFileContents(codeViewerFile, editBuffer);
      setContent(editBuffer);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [codeViewerFile, editorLocked, hasPendingChanges, saving, editBuffer]);

  useEffect(() => {
    if (!codeViewerOpen || viewMode !== "code" || editorLocked) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleApply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [codeViewerOpen, viewMode, editorLocked, handleApply]);

  // Resize handling (vertical, drag top edge)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startY: e.clientY, startHeight: panelHeight };

    const handleMove = (me: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - me.clientY;
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.95, resizeRef.current.startHeight + delta));
      setPanelHeight(newHeight);
    };

    const handleUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [panelHeight]);

  // Tokenize all lines with multi-line state tracking
  const tokenizedLines = useMemo(() => {
    if (viewMode === "diff") return [];
    const lines = content.split("\n");
    let state: TokenizerState = { inBlockComment: false, inTemplateLiteral: false };
    return lines.map((line) => {
      const result = tokenizeLine(line, state);
      state = result.state;
      return result.tokens;
    });
  }, [content, viewMode]);

  // Parse diff
  const diffHunks = useMemo(() => {
    if (viewMode !== "diff") return [];
    return parseDiff(diffContent);
  }, [diffContent, viewMode]);

  if (!codeViewerOpen || !codeViewerFile) return null;

  const lines = content.split("\n");
  const lineNumWidth = Math.max(String(lines.length).length * 8 + 16, 40);
  const fileName = codeViewerFile.split("/").pop() ?? codeViewerFile;
  const shortPath = codeViewerFile.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
  const language = detectLanguage(fileName);
  const hasDiffCapability = !!codeViewerWorkingDir;

  const diffLineNumWidth = 48;
  const diffAdditions = diffHunks.reduce((a, h) => a + h.lines.filter(l => l.type === "add").length, 0);
  const diffDeletions = diffHunks.reduce((a, h) => a + h.lines.filter(l => l.type === "del").length, 0);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: `min(${panelHeight}px, 95vh)`,
        zIndex: 900,
        background: "#141414",
        borderTop: "1px solid #ff8c00",
        fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
        animation: "slideInBottom 0.15s ease-out",
      }}
    >
      {/* Inline animation keyframes */}
      <style>{`
        @keyframes slideInBottom {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Resize handle on top edge */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          top: -3,
          left: 0,
          right: 0,
          height: "6px",
          cursor: "row-resize",
          zIndex: 10,
          background: isResizing ? "rgba(255, 140, 0, 0.3)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!isResizing) e.currentTarget.style.background = "rgba(255, 140, 0, 0.15)"; }}
        onMouseLeave={(e) => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
      />

      {/* Header */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
          background: "#0f0f0f",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* CODE | DIFF toggle */}
            <button
              onClick={() => setViewMode("code")}
              style={{
                background: viewMode === "code" ? "#1e1e1e" : "transparent",
                border: viewMode === "code" ? "1px solid #ff8c00" : "1px solid #2a2a2a",
                color: viewMode === "code" ? "#ff8c00" : "#555555",
                fontSize: "10px",
                fontWeight: "bold",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                letterSpacing: "1px",
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              CODE
            </button>
            {hasDiffCapability && (
              <button
                onClick={() => setViewMode("diff")}
                style={{
                  background: viewMode === "diff" ? "#1e1e1e" : "transparent",
                  border: viewMode === "diff" ? "1px solid #ff8c00" : "1px solid #2a2a2a",
                  color: viewMode === "diff" ? "#ff8c00" : "#555555",
                  fontSize: "10px",
                  fontWeight: "bold",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                  letterSpacing: "1px",
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                DIFF
              </button>
            )}
            <span style={{ color: "#555555", fontSize: "11px" }}>|</span>
            <span
              style={{
                color: "#e0e0e0",
                fontSize: "11px",
                fontWeight: "bold",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fileName}
            </span>
            {/* Language indicator */}
            <span
              style={{
                color: "#888888",
                fontSize: "9px",
                background: "#1e1e1e",
                border: "1px solid #2a2a2a",
                padding: "1px 6px",
                letterSpacing: "0.5px",
                flexShrink: 0,
              }}
            >
              {language}
            </span>
          </div>
          <div
            style={{
              color: "#555555",
              fontSize: "9px",
              marginTop: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={codeViewerFile}
          >
            {shortPath}
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 }}>
          {/* Wrap toggle */}
          {viewMode === "code" && (
            <button
              onClick={() => setWrapLines(!wrapLines)}
              title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}
              style={{
                background: wrapLines ? "#1e1e1e" : "transparent",
                border: wrapLines ? "1px solid #ff8c00" : "1px solid #2a2a2a",
                color: wrapLines ? "#ff8c00" : "#555555",
                fontSize: "9px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "2px 6px",
                cursor: "pointer",
              }}
            >
              WRAP
            </button>
          )}
          {viewMode === "code" && (
            <button
              onClick={() => setEditorLocked((v) => !v)}
              title={editorLocked ? "Unlock editor for manual edits" : "Lock editor (read-only)"}
              style={{
                background: editorLocked ? "transparent" : "#1e1e1e",
                border: editorLocked ? "1px solid #2a2a2a" : "1px solid #ff8c00",
                color: editorLocked ? "#555555" : "#ff8c00",
                fontSize: "9px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "2px 6px",
                cursor: "pointer",
              }}
            >
              {editorLocked ? "UNLOCK" : "LOCK"}
            </button>
          )}
          {viewMode === "code" && !editorLocked && (
            <button
              onClick={handleApply}
              disabled={!hasPendingChanges || saving}
              style={{
                background: hasPendingChanges ? "#ff8c00" : "#1e1e1e",
                border: "1px solid #2a2a2a",
                color: hasPendingChanges ? "#0a0a0a" : "#555555",
                fontSize: "9px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                padding: "2px 6px",
                cursor: hasPendingChanges ? "pointer" : "default",
                fontWeight: "bold",
              }}
            >
              {saving ? "APPLYING..." : "APPLY"}
            </button>
          )}
          <button
            onClick={() => setCodeViewerOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#555555",
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              padding: "0 4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8c00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
          >
            x
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        style={{ flex: 1, overflow: "auto", position: "relative" }}
        onScroll={handleScroll}
      >
        {/* ─── CODE VIEW ─── */}
        {viewMode === "code" && (
          <>
            {loading && (
              <div style={{ padding: "24px", textAlign: "center", color: "#ffab00", fontSize: "11px" }}>
                Loading file...
              </div>
            )}
            {error && (
              <div style={{ padding: "24px", textAlign: "center", color: "#ff3d00", fontSize: "11px" }}>
                {error}
              </div>
            )}
            {!loading && !error && (
              !editorLocked ? (
                <div style={{ padding: "10px 12px" }}>
                  <textarea
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    spellCheck={false}
                    style={{
                      width: "100%",
                      minHeight: "100%",
                      height: "calc(100vh - 180px)",
                      resize: "vertical",
                      boxSizing: "border-box",
                      background: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      color: "#e0e0e0",
                      padding: "12px",
                          fontSize: "15px",
                      lineHeight: 1.6,
                      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
                      outline: "none",
                    }}
                  />
                </div>
              ) : (
                <div style={{ minWidth: wrapLines ? undefined : "fit-content", paddingRight: "68px" }}>
                  {lines.map((_line, idx) => {
                    const tokens = tokenizedLines[idx] ?? [];
                    const isHovered = hoveredLine === idx;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          background: isHovered ? "#1e1e1e" : "transparent",
                          fontSize: "15px",
                          lineHeight: "1.6",
                          minHeight: "22px",
                        }}
                        onMouseEnter={() => setHoveredLine(idx)}
                        onMouseLeave={() => setHoveredLine(null)}
                      >
                        {/* Line number */}
                        <span
                          style={{
                            width: `${lineNumWidth}px`,
                            minWidth: `${lineNumWidth}px`,
                            textAlign: "right",
                            paddingRight: "12px",
                            color: isHovered ? "#888888" : "#444444",
                            fontSize: "11px",
                            lineHeight: "1.6",
                            fontWeight: 400,
                            userSelect: "none",
                            borderRight: "1px solid #2a2a2a",
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>
                        {/* Code content */}
                        <span
                          style={{
                            flex: 1,
                            whiteSpace: wrapLines ? "pre-wrap" : "pre",
                            wordBreak: wrapLines ? "break-all" : undefined,
                            paddingLeft: "12px",
                            paddingRight: "16px",
                            overflow: wrapLines ? undefined : "hidden",
                            fontWeight: 400,
                          }}
                        >
                          {tokens.map((token, ti) => (
                            <span key={ti} style={{ color: token.color }}>
                              {token.text}
                            </span>
                          ))}
                          {tokens.length === 0 && "\u200B"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )
            )}
            {/* Minimap */}
            {!loading && !error && content.length > 0 && editorLocked && (
              <Minimap
                content={content}
                scrollTop={scrollState.top}
                clientHeight={scrollState.clientH}
                scrollHeight={scrollState.scrollH}
                onSeek={(ratio) => {
                  if (contentRef.current) {
                    contentRef.current.scrollTop = ratio * contentRef.current.scrollHeight;
                  }
                }}
              />
            )}
          </>
        )}

        {/* ─── DIFF VIEW ─── */}
        {viewMode === "diff" && (
          <>
            {diffLoading && (
              <div style={{ padding: "24px", textAlign: "center", color: "#ffab00", fontSize: "11px" }}>
                Loading diff...
              </div>
            )}
            {diffError && (
              <div style={{ padding: "24px", textAlign: "center", color: "#ff3d00", fontSize: "11px" }}>
                {diffError}
              </div>
            )}
            {!diffLoading && !diffError && diffHunks.length === 0 && (
              <div style={{ padding: "24px", textAlign: "center", color: "#555555", fontSize: "11px" }}>
                No changes to display for this file
              </div>
            )}
            {!diffLoading && !diffError && diffHunks.map((hunk, hi) => (
              <div key={hi}>
                {/* Hunk header */}
                <div
                  style={{
                    padding: "4px 16px",
                    background: "#1a1a2e",
                    color: "#4a9eff",
                    fontSize: "10px",
                    borderTop: hi > 0 ? "1px solid #2a2a2a" : "none",
                    borderBottom: "1px solid #2a2a2a",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{hunk.header}</span>
                  <button
                    onClick={() => handleStageHunk(hunk.header, codeViewerFile ?? "")}
                    disabled={stagingHunk !== null}
                    style={{
                      background: stageSuccess === hunk.header ? "#00c853" : "#1e1e1e",
                      border: "1px solid #4a9eff66",
                      color: stageSuccess === hunk.header ? "#fff" : "#4a9eff",
                      fontSize: "8px",
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
                      padding: "2px 8px",
                      cursor: stagingHunk ? "default" : "pointer",
                      fontWeight: "bold",
                      letterSpacing: "0.5px",
                      flexShrink: 0,
                      marginLeft: "8px",
                    }}
                  >
                    {stagingHunk === hunk.header ? "STAGING..." : stageSuccess === hunk.header ? "STAGED" : "STAGE HUNK"}
                  </button>
                </div>
                {/* Lines */}
                {hunk.lines.filter(l => l.type !== "hunk-header").map((line, li) => {
                  let bg = "transparent";
                  let color = "#e0e0e0";
                  let prefix = " ";
                  if (line.type === "add") { bg = "#0d3b0d"; color = "#a6e3a1"; prefix = "+"; }
                  else if (line.type === "del") { bg = "#3b0d0d"; color = "#f38ba8"; prefix = "-"; }

                  return (
                    <div
                      key={`${hi}-${li}`}
                      style={{
                        display: "flex",
                        background: bg,
                        fontSize: "13px",
                        lineHeight: "1.5",
                        minHeight: "20px",
                      }}
                    >
                      <span style={{
                        width: `${diffLineNumWidth}px`, minWidth: `${diffLineNumWidth}px`,
                        textAlign: "right", paddingRight: "8px", color: "#555555",
                        fontSize: "11px", lineHeight: "1.5", userSelect: "none",
                        borderRight: "1px solid #2a2a2a",
                      }}>
                        {line.oldLine ?? ""}
                      </span>
                      <span style={{
                        width: `${diffLineNumWidth}px`, minWidth: `${diffLineNumWidth}px`,
                        textAlign: "right", paddingRight: "8px", color: "#555555",
                        fontSize: "11px", lineHeight: "1.5", userSelect: "none",
                        borderRight: "1px solid #2a2a2a",
                      }}>
                        {line.newLine ?? ""}
                      </span>
                      <span style={{
                        width: "20px", minWidth: "20px", textAlign: "center",
                        color: line.type === "add" ? "#00c853" : line.type === "del" ? "#ff3d00" : "#555555",
                        fontWeight: "bold", userSelect: "none",
                      }}>
                        {prefix}
                      </span>
                      <span style={{
                        flex: 1, color, whiteSpace: "pre", overflow: "hidden",
                        paddingRight: "16px", fontWeight: 400,
                      }}>
                        {line.content}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      {viewMode === "code" && !loading && !error && content && (
        <div
          style={{
            padding: "6px 16px",
            borderTop: "1px solid #2a2a2a",
            display: "flex",
            gap: "16px",
            fontSize: "10px",
            flexShrink: 0,
            background: "#0f0f0f",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "#555555" }}>
            {lines.length} lines
          </span>
          <span style={{ color: "#555555" }}>
            {content.length.toLocaleString()} chars
          </span>
          <span style={{ color: "#888888" }}>
            {language}
          </span>
          <span style={{ color: "#555555", marginLeft: "auto" }}>
            ESC to close
          </span>
        </div>
      )}
      {viewMode === "diff" && !diffLoading && !diffError && diffHunks.length > 0 && (
        <div
          style={{
            padding: "6px 16px",
            borderTop: "1px solid #2a2a2a",
            display: "flex",
            gap: "16px",
            fontSize: "10px",
            flexShrink: 0,
            background: "#0f0f0f",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "#00c853" }}>
            +{diffAdditions} additions
          </span>
          <span style={{ color: "#ff3d00" }}>
            -{diffDeletions} deletions
          </span>
          <span style={{ color: "#555555", marginLeft: "auto" }}>
            ESC to close
          </span>
        </div>
      )}
    </div>
  );
});

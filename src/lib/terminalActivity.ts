/**
 * Terminal activity detection.
 *
 * Parses PTY output to determine what process is running in a terminal session.
 * Uses two strategies:
 *   1. OSC escape sequences (title sequences emitted by shells/programs)
 *   2. Content pattern matching (keywords in the terminal output)
 */

// Matches OSC 0, 1, or 2 title-setting sequences:
//   \x1b]0;title\x07   or   \x1b]0;title\x1b\\
//   \x1b]1;title\x07   or   \x1b]1;title\x1b\\
//   \x1b]2;title\x07   or   \x1b]2;title\x1b\\
const OSC_TITLE_RE = /\x1b\](?:0|1|2);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g;

/** Activity patterns: ordered by priority (first match wins). */
const ACTIVITY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bclaude\b/i, label: "Claude" },
  { pattern: /\bgit\s+(?:push|pull|commit|merge|rebase|log|diff|status|clone|fetch|checkout|branch|stash)\b/i, label: "Git" },
  { pattern: /\bnpm\b|\bnpx\b|\byarn\b|\bpnpm\b|\bbun\b/i, label: "Node" },
  { pattern: /\bnode\b/i, label: "Node" },
  { pattern: /\bpython[23]?\b|\bpip[23]?\b|\bconda\b|\bpytest\b/i, label: "Python" },
  { pattern: /\bcargo\b|\brustc\b|\brustup\b/i, label: "Rust" },
  { pattern: /\bgo\s+(?:build|run|test|mod|get|install|vet|fmt)\b/i, label: "Go" },
  { pattern: /\bjava\b|\bjavac\b|\bmaven\b|\bmvn\b|\bgradle\b/i, label: "Java" },
  { pattern: /\bdocker\b|\bdocker-compose\b|\bpodman\b/i, label: "Docker" },
  { pattern: /\bkubectl\b|\bhelm\b/i, label: "K8s" },
  { pattern: /\bssh\b/i, label: "SSH" },
  { pattern: /\bvim\b|\bnvim\b|\bneovim\b/i, label: "Vim" },
  { pattern: /\bemacs\b/i, label: "Emacs" },
  { pattern: /\bmake\b|\bcmake\b/i, label: "Make" },
  { pattern: /\bsudo\b/i, label: "sudo" },
  { pattern: /\btop\b|\bhtop\b|\bbtop\b/i, label: "Monitor" },
];

/** Shell name patterns for fallback detection from OSC titles. */
const SHELL_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bzsh\b/i, label: "zsh" },
  { pattern: /\bbash\b/i, label: "bash" },
  { pattern: /\bfish\b/i, label: "fish" },
  { pattern: /\bsh\b/i, label: "sh" },
];

/**
 * Extracts the latest OSC title from raw PTY output bytes.
 * Returns null if no title sequence was found.
 */
export function extractOscTitle(text: string): string | null {
  let lastTitle: string | null = null;
  let match: RegExpExecArray | null;
  // Reset lastIndex before iterating
  OSC_TITLE_RE.lastIndex = 0;
  while ((match = OSC_TITLE_RE.exec(text)) !== null) {
    if (match[1]) {
      lastTitle = match[1];
    }
  }
  return lastTitle;
}

/**
 * Detect activity name from raw PTY output text.
 *
 * Strategy:
 *  1. Extract OSC title sequence and match against activity + shell patterns
 *  2. Match the raw text content against activity patterns
 *  3. Fall back to null (caller should keep the previous activity name)
 */
export function detectActivity(text: string): string | null {
  // 1. Check OSC title
  const oscTitle = extractOscTitle(text);
  if (oscTitle) {
    // Check activity patterns against the title
    for (const { pattern, label } of ACTIVITY_PATTERNS) {
      if (pattern.test(oscTitle)) {
        return label;
      }
    }
    // Check shell patterns in title
    for (const { pattern, label } of SHELL_PATTERNS) {
      if (pattern.test(oscTitle)) {
        return label;
      }
    }
  }

  // 2. Check content patterns (only look at the last ~500 chars to avoid
  //    matching stale output from scrollback)
  const tail = text.length > 500 ? text.slice(-500) : text;

  for (const { pattern, label } of ACTIVITY_PATTERNS) {
    if (pattern.test(tail)) {
      return label;
    }
  }

  return null;
}

/**
 * Detect if terminal output indicates explicit user attention is required.
 * Returns a concise reason string if detected, otherwise null.
 */
export function detectAttentionNeeded(text: string): string | null {
  const tail = text.length > 800 ? text.slice(-800) : text;

  if (/\b(?:waiting for|awaiting)\s+(?:your|user)\s+(?:input|approval|response)\b/i.test(tail)) {
    return "Waiting for your input";
  }
  if (/\b(?:approve|approval|permission)\b.*\b(?:required|needed|request|requested)?\b/i.test(tail)) {
    return "Approval requested";
  }
  if (/\b(?:yes\/no|y\/n|y\/N)\b/i.test(tail)) {
    return "Confirmation required";
  }
  if (/\bpress\s+(?:enter|return)\s+to\s+continue\b/i.test(tail)) {
    return "Press Enter to continue";
  }
  if (/\b(?:proceed|continue|apply|run)\b.{0,40}\?\s*$/im.test(tail)) {
    return "Action confirmation needed";
  }

  return null;
}

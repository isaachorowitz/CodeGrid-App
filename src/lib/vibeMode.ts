// vibeMode.ts — Friendly terminology mapping for Vibe Mode

const VIBE_LABELS: Record<string, string> = {
  "STAGED": "STAGED",
  "UNSTAGED": "CHANGED",
  "UNTRACKED": "NEW",
  "SOURCE CONTROL": "GIT",
  "COMMIT": "SAVE",
  "PUSH": "PUSH",
  "PULL": "PULL",
  "FETCH": "FETCH",
  "STASH": "STASH",
  "POP": "POP",
  "MERGE": "MERGE",
  "BRANCH": "BRANCH",
  "CLONE": "CLONE",
  "CLONE & OPEN": "CLONE+",
  "DEAD": "DONE",
  "IDLE": "READY",
  "WAITING": "WAIT",
  "RUNNING": "RUN",
  "ERROR": "ERROR",
  "Terminal Shell": "SHELL",
  "MCP": "MCP",
  "BCAST": "ALL",
  "Broadcast Mode": "To all",
  "Session": "Chat",
  "NEW SESSION": "NEW",
  "Resume previous Claude session": "Resume",
  "FULL GIT": "GIT",
};

const VIBE_DESCRIPTIONS: Record<string, { technical: string; friendly: string }> = {
  no_remote: {
    technical: "No remote. Add: git remote add origin <url>",
    friendly: "No remote — add one in Git setup.",
  },
  stage_file: {
    technical: "Stage file",
    friendly: "Include in save",
  },
  unstage_file: {
    technical: "Unstage file",
    friendly: "Remove from save",
  },
  worktree: {
    technical: "Automatically create git worktrees for new sessions in the same repo",
    friendly: "Create separate workspaces when working on the same project",
  },
};

export function vibeLabel(technicalTerm: string, vibeMode: boolean): string {
  if (!vibeMode) return technicalTerm;
  return VIBE_LABELS[technicalTerm] ?? technicalTerm;
}

export function vibeDescription(key: string, vibeMode: boolean): string {
  const entry = VIBE_DESCRIPTIONS[key];
  if (!entry) return key;
  return vibeMode ? entry.friendly : entry.technical;
}

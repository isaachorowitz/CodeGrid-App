// vibeMode.ts — Friendly terminology mapping for Vibe Mode

const VIBE_LABELS: Record<string, string> = {
  "STAGED": "READY TO SAVE",
  "UNSTAGED": "CHANGED",
  "UNTRACKED": "NEW FILES",
  "SOURCE CONTROL": "CHANGES",
  "COMMIT": "SAVE",
  "PUSH": "PUBLISH",
  "PULL": "SYNC",
  "FETCH": "CHECK FOR UPDATES",
  "STASH": "SET ASIDE",
  "POP": "BRING BACK",
  "MERGE": "COMBINE",
  "BRANCH": "VERSION",
  "CLONE": "GET PROJECT",
  "CLONE & OPEN": "GET & OPEN",
  "DEAD": "FINISHED",
  "IDLE": "READY",
  "WAITING": "THINKING",
  "RUNNING": "WORKING",
  "ERROR": "NEEDS ATTENTION",
  "Terminal Shell": "Command Line",
  "MCP": "PLUGINS",
  "BCAST": "TYPE TO ALL",
  "Broadcast Mode": "Type to All",
  "Session": "Chat",
  "NEW SESSION": "NEW CHAT",
  "Resume previous Claude session": "Continue where I left off",
  "FULL GIT": "ALL CHANGES",
};

const VIBE_DESCRIPTIONS: Record<string, { technical: string; friendly: string }> = {
  no_remote: {
    technical: "No remote configured. Add one with: git remote add origin <url>",
    friendly: "Not connected to GitHub yet. Click here to set it up.",
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

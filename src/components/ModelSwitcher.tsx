import { memo, useCallback } from "react";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { sendToSession } from "../lib/ipc";

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#d500f9",
  "claude-sonnet-4-6": "#ff8c00",
  "claude-haiku-4-5": "#00e5ff",
};

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-4-6": "OPUS",
  "claude-sonnet-4-6": "SONNET",
  "claude-haiku-4-5": "HAIKU",
};

interface ModelSwitcherProps {
  sessionId?: string; // If provided, switch for specific session; otherwise switch default
  compact?: boolean;
}

export const ModelSwitcher = memo(function ModelSwitcher({
  sessionId,
  compact = false,
}: ModelSwitcherProps) {
  const models = useAppStore((s) => s.models);
  const defaultModel = useAppStore((s) => s.defaultModel);
  const setDefaultModel = useAppStore((s) => s.setDefaultModel);
  const sessions = useSessionStore((s) => s.sessions);
  const setSessionModel = useSessionStore((s) => s.setSessionModel);
  const addToast = useToastStore((s) => s.addToast);

  const currentModel = sessionId
    ? sessions.find((s) => s.id === sessionId)?.model ?? defaultModel
    : defaultModel;

  const handleSwitch = useCallback(
    async (modelId: string) => {
      const modelName = MODEL_SHORT[modelId] ?? modelId;
      if (sessionId) {
        setSessionModel(sessionId, modelId);
        // Send /model command to the active Claude session
        try {
          await sendToSession(sessionId, `/model ${modelId}`);
        } catch {
          // Session may not be a Claude session
        }
        addToast(`Switched to ${modelName}`, "success", 2000);
      } else {
        setDefaultModel(modelId);
        addToast(`Default model set to ${modelName}`, "success", 2000);
      }
    },
    [sessionId, setSessionModel, setDefaultModel, addToast],
  );

  if (models.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div style={{ display: "flex", gap: "1px" }}>
        {models.map((m) => {
          const isActive = m.id === currentModel;
          const color = MODEL_COLORS[m.id] ?? "#888888";
          return (
            <button
              key={m.id}
              onClick={() => handleSwitch(m.id)}
              title={`${m.name} — ${m.description}`}
              style={{
                background: isActive ? `${color}22` : "transparent",
                border: `1px solid ${isActive ? color : "#2a2a2a"}`,
                color: isActive ? color : "#555555",
                fontSize: "9px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                padding: "1px 4px",
                fontWeight: isActive ? "bold" : "normal",
                letterSpacing: "0.5px",
                lineHeight: "14px",
              }}
            >
              {MODEL_SHORT[m.id] ?? m.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
      <span
        style={{
          fontSize: "9px",
          color: "#555555",
          fontFamily: "'SF Mono', monospace",
          marginRight: "2px",
          letterSpacing: "0.5px",
        }}
      >
        MODEL
      </span>
      {models.map((m) => {
        const isActive = m.id === currentModel;
        const color = MODEL_COLORS[m.id] ?? "#888888";
        return (
          <button
            key={m.id}
            onClick={() => handleSwitch(m.id)}
            title={`${m.name}\n${m.description}\nSpeed: ${m.speed}`}
            style={{
              background: isActive ? `${color}22` : "#1e1e1e",
              border: `1px solid ${isActive ? color : "#2a2a2a"}`,
              color: isActive ? color : "#666666",
              fontSize: "10px",
              fontFamily: "'SF Mono', monospace",
              cursor: "pointer",
              padding: "2px 8px",
              fontWeight: isActive ? "bold" : "normal",
              letterSpacing: "0.5px",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.color = color;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = "#2a2a2a";
                e.currentTarget.style.color = "#666666";
              }
            }}
          >
            {MODEL_SHORT[m.id] ?? m.name}
          </button>
        );
      })}
    </div>
  );
});

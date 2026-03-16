import { memo } from "react";
import { useToastStore } from "../stores/toastStore";

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  success: { bg: "#00c85322", border: "#00c853", text: "#00c853" },
  error: { bg: "#ff3d0022", border: "#ff3d00", text: "#ff3d00" },
  info: { bg: "#4a9eff22", border: "#4a9eff", text: "#4a9eff" },
  warning: { bg: "#ffab0022", border: "#ffab00", text: "#ffab00" },
};

export const ToastContainer = memo(function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        maxWidth: "400px",
      }}
    >
      {toasts.map((toast) => {
        const colors = TYPE_COLORS[toast.type] ?? TYPE_COLORS.info;
        return (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.text,
              padding: "8px 12px",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', monospace",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontWeight: "bold", fontSize: "12px" }}>
              {toast.type === "success" ? "OK" : toast.type === "error" ? "ERR" : toast.type === "warning" ? "WARN" : "INFO"}
            </span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <span style={{ color: "#555555", fontSize: "9px" }}>x</span>
          </div>
        );
      })}
    </div>
  );
});

import { memo, useState, useCallback, useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useToastStore } from "../stores/toastStore";
import {
  checkGitSetup,
  setGitConfig,
  runGhAuthLogin,
  getGhInstallInstructions,
  type GitSetupStatus,
} from "../lib/ipc";

type WizardStep = "status" | "identity" | "gh-auth" | "done";

const FONT = "'SF Mono', 'Menlo', monospace";

function CheckItem({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
      <span
        style={{
          width: "22px",
          height: "22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: ok ? "#00c85322" : "#ff3d0022",
          color: ok ? "#00c853" : "#ff3d00",
          fontSize: "14px",
          fontWeight: "bold",
          fontFamily: FONT,
          flexShrink: 0,
        }}
      >
        {ok ? "\u2713" : "\u2717"}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ color: ok ? "#e0e0e0" : "#ff8c00", fontSize: "12px", fontFamily: FONT }}>
          {label}
        </div>
        {detail && (
          <div style={{ color: "#888888", fontSize: "10px", fontFamily: FONT, marginTop: "2px" }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function WizardButton({
  label,
  onClick,
  color = "#ff8c00",
  disabled = false,
  secondary = false,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: secondary ? "transparent" : disabled ? "#333333" : hovered ? `${color}dd` : color,
        border: secondary ? `1px solid ${color}` : "none",
        color: secondary ? color : disabled ? "#666666" : "#0a0a0a",
        fontSize: "12px",
        fontFamily: FONT,
        fontWeight: "bold",
        letterSpacing: "1px",
        padding: "10px 24px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

export const GitSetupWizard = memo(function GitSetupWizard() {
  const { gitSetupWizardOpen, setGitSetupWizardOpen } = useAppStore();
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState<WizardStep>("status");
  const [status, setStatus] = useState<GitSetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identity form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // GH auth
  const [ghInstructions, setGhInstructions] = useState<string | null>(null);
  const [authRunning, setAuthRunning] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await checkGitSetup();
      setStatus(s);
      // Pre-fill identity if available
      if (s.git_user_name) setName(s.git_user_name);
      if (s.git_user_email) setEmail(s.git_user_email);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gitSetupWizardOpen) {
      setStep("status");
      refresh();
    }
  }, [gitSetupWizardOpen, refresh]);

  const allGood = status
    ? status.git_installed &&
      !!status.git_user_name &&
      !!status.git_user_email &&
      status.gh_installed &&
      status.gh_authenticated
    : false;

  const handleSaveIdentity = useCallback(async () => {
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await setGitConfig(name.trim(), email.trim());
      addToast("Git identity saved", "success");
      await refresh();
      setStep("status");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [name, email, addToast, refresh]);

  const handleGhAuth = useCallback(async () => {
    setAuthRunning(true);
    setError(null);
    try {
      await runGhAuthLogin();
      addToast("GitHub authentication successful", "success");
      await refresh();
      setStep("status");
    } catch (e) {
      // Expected: gh auth login needs interactive terminal
      setError(String(e));
    } finally {
      setAuthRunning(false);
    }
  }, [addToast, refresh]);

  const loadGhInstructions = useCallback(async () => {
    try {
      const instructions = await getGhInstallInstructions();
      setGhInstructions(instructions);
    } catch {
      setGhInstructions("brew install gh");
    }
  }, []);

  const handleNext = useCallback(() => {
    if (!status) return;
    if (!status.git_installed) {
      setError("Git must be installed first. Install via: xcode-select --install");
      return;
    }
    if (!status.git_user_name || !status.git_user_email) {
      setStep("identity");
      return;
    }
    if (!status.gh_authenticated) {
      loadGhInstructions();
      setStep("gh-auth");
      return;
    }
    setStep("done");
  }, [status, loadGhInstructions]);

  if (!gitSetupWizardOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    fontFamily: FONT,
  };

  const modalStyle: React.CSSProperties = {
    background: "#141414",
    border: "1px solid #2a2a2a",
    width: "520px",
    maxHeight: "80vh",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyle: React.CSSProperties = {
    padding: "16px 20px",
    borderBottom: "1px solid #2a2a2a",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const bodyStyle: React.CSSProperties = {
    padding: "20px",
    flex: 1,
  };

  const footerStyle: React.CSSProperties = {
    padding: "16px 20px",
    borderTop: "1px solid #2a2a2a",
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  };

  return (
    <div style={overlayStyle} onClick={() => setGitSetupWizardOpen(false)}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ color: "#ff8c00", fontSize: "14px", fontWeight: "bold", letterSpacing: "1px" }}>
              GIT SETUP WIZARD
            </div>
            <div style={{ color: "#555555", fontSize: "10px", marginTop: "2px" }}>
              {step === "status" && "Check your development environment"}
              {step === "identity" && "Step 2: Configure your Git identity"}
              {step === "gh-auth" && "Step 3: Authenticate with GitHub"}
              {step === "done" && "All set!"}
            </div>
          </div>
          <button
            onClick={() => setGitSetupWizardOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#555555",
              fontSize: "16px",
              cursor: "pointer",
              fontFamily: FONT,
              padding: "4px 8px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3d00")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
          >
            x
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Error banner */}
          {error && (
            <div
              style={{
                background: "#ff3d0022",
                border: "1px solid #ff3d00",
                padding: "10px 14px",
                marginBottom: "16px",
                color: "#ff8c00",
                fontSize: "11px",
                fontFamily: FONT,
                wordBreak: "break-word",
              }}
            >
              {error}
            </div>
          )}

          {/* Step: Status */}
          {step === "status" && (
            <div>
              {loading && !status ? (
                <div style={{ color: "#888888", fontSize: "12px", padding: "20px 0", textAlign: "center" }}>
                  Checking environment...
                </div>
              ) : status ? (
                <div>
                  <CheckItem
                    ok={status.git_installed}
                    label="Git installed"
                    detail={status.git_installed ? undefined : "Run: xcode-select --install"}
                  />
                  <CheckItem
                    ok={!!status.git_user_name && !!status.git_user_email}
                    label="Git identity configured"
                    detail={
                      status.git_user_name && status.git_user_email
                        ? `${status.git_user_name} <${status.git_user_email}>`
                        : "Name and email not set"
                    }
                  />
                  <CheckItem
                    ok={status.gh_installed}
                    label="GitHub CLI (gh) installed"
                    detail={status.gh_installed ? undefined : "Run: brew install gh"}
                  />
                  <CheckItem
                    ok={status.gh_authenticated}
                    label="GitHub authenticated"
                    detail={
                      status.gh_authenticated && status.gh_username
                        ? `Logged in as @${status.gh_username}`
                        : status.gh_installed
                          ? "Not authenticated"
                          : "Install gh first"
                    }
                  />
                  <CheckItem
                    ok={status.ssh_key_exists}
                    label="SSH key exists"
                    detail={
                      status.ssh_key_exists
                        ? "Found in ~/.ssh/"
                        : "Optional - gh uses HTTPS by default"
                    }
                  />

                  {allGood && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "12px",
                        background: "#00c85315",
                        border: "1px solid #00c85344",
                        color: "#00c853",
                        fontSize: "12px",
                        fontFamily: FONT,
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      Everything looks great! You're ready to code.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Step: Identity */}
          {step === "identity" && (
            <div>
              <div style={{ color: "#888888", fontSize: "11px", marginBottom: "16px" }}>
                This name and email will appear on your Git commits.
                If you use GitHub, use the email associated with your account.
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ color: "#888888", fontSize: "10px", letterSpacing: "1px", display: "block", marginBottom: "4px" }}>
                  NAME
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  style={{
                    width: "100%",
                    background: "#1e1e1e",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "13px",
                    fontFamily: FONT,
                    padding: "10px 12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ color: "#888888", fontSize: "10px", letterSpacing: "1px", display: "block", marginBottom: "4px" }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: "100%",
                    background: "#1e1e1e",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                    fontSize: "13px",
                    fontFamily: FONT,
                    padding: "10px 12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#ff8c00")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                />
              </div>

              <div style={{ color: "#555555", fontSize: "10px", marginTop: "8px" }}>
                This runs: git config --global user.name &amp; user.email
              </div>
            </div>
          )}

          {/* Step: GH Auth */}
          {step === "gh-auth" && (
            <div>
              {!status?.gh_installed ? (
                <div>
                  <div style={{ color: "#ff8c00", fontSize: "12px", fontWeight: "bold", marginBottom: "12px" }}>
                    GitHub CLI Not Installed
                  </div>
                  <div style={{ color: "#888888", fontSize: "11px", marginBottom: "16px" }}>
                    The GitHub CLI makes it easy to authenticate and work with GitHub.
                    Install it first, then come back to authenticate.
                  </div>
                  <div
                    style={{
                      background: "#1e1e1e",
                      border: "1px solid #2a2a2a",
                      padding: "12px 16px",
                      fontFamily: FONT,
                      fontSize: "13px",
                      color: "#00c853",
                      userSelect: "all",
                      marginBottom: "12px",
                    }}
                  >
                    {ghInstructions ?? "brew install gh"}
                  </div>
                  <div style={{ color: "#555555", fontSize: "10px" }}>
                    After installing, click REFRESH on the status page to continue.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ color: "#ff8c00", fontSize: "12px", fontWeight: "bold", marginBottom: "12px" }}>
                    Authenticate with GitHub
                  </div>
                  <div style={{ color: "#888888", fontSize: "11px", marginBottom: "16px" }}>
                    You can authenticate directly from GridCode, or run the command
                    in a terminal session. The browser-based flow is the easiest.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <WizardButton
                      label={authRunning ? "AUTHENTICATING..." : "AUTHENTICATE WITH GITHUB"}
                      onClick={handleGhAuth}
                      disabled={authRunning}
                      color="#00c853"
                    />

                    <div style={{ color: "#555555", fontSize: "10px", textAlign: "center", padding: "4px 0" }}>
                      or run this in a GridCode terminal session:
                    </div>

                    <div
                      style={{
                        background: "#1e1e1e",
                        border: "1px solid #2a2a2a",
                        padding: "12px 16px",
                        fontFamily: FONT,
                        fontSize: "13px",
                        color: "#4a9eff",
                        userSelect: "all",
                      }}
                    >
                      gh auth login
                    </div>
                  </div>

                  <div style={{ color: "#555555", fontSize: "10px", marginTop: "12px" }}>
                    This opens GitHub in your browser to authorize the CLI.
                    After completing auth, click REFRESH on the status page.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  margin: "0 auto 16px",
                  background: "#00c85322",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                  color: "#00c853",
                }}
              >
                {"\u2713"}
              </div>
              <div style={{ color: "#00c853", fontSize: "16px", fontWeight: "bold", marginBottom: "8px" }}>
                ALL SET!
              </div>
              <div style={{ color: "#888888", fontSize: "12px", marginBottom: "4px" }}>
                {status?.gh_username ? `Logged in as @${status.gh_username}` : "Git is configured"}
              </div>
              <div style={{ color: "#555555", fontSize: "11px" }}>
                {status?.git_user_name} &lt;{status?.git_user_email}&gt;
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          {step === "status" && (
            <>
              <WizardButton label="REFRESH" onClick={refresh} secondary color="#888888" />
              {allGood ? (
                <WizardButton label="ALL GOOD!" onClick={() => setStep("done")} color="#00c853" />
              ) : (
                <WizardButton
                  label="FIX ISSUES"
                  onClick={handleNext}
                  disabled={loading || !status}
                />
              )}
            </>
          )}
          {step === "identity" && (
            <>
              <WizardButton label="BACK" onClick={() => setStep("status")} secondary color="#888888" />
              <WizardButton
                label={loading ? "SAVING..." : "SAVE"}
                onClick={handleSaveIdentity}
                disabled={loading || !name.trim() || !email.trim()}
              />
            </>
          )}
          {step === "gh-auth" && (
            <>
              <WizardButton label="BACK" onClick={() => setStep("status")} secondary color="#888888" />
              <WizardButton label="REFRESH STATUS" onClick={() => { refresh(); setStep("status"); }} secondary color="#4a9eff" />
            </>
          )}
          {step === "done" && (
            <WizardButton
              label="START CODING"
              onClick={() => setGitSetupWizardOpen(false)}
              color="#00c853"
            />
          )}
        </div>
      </div>
    </div>
  );
});

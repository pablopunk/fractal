import { useEffect, useState } from "react";
import { Monitor, Moon, Palette, Radio, Sun } from "lucide-react";
import type { BoardLayout, GlassSettings, TerminalThemeName, ThemeMode } from "~/lib/client/persistence.js";
import { terminalThemePreview } from "~/lib/client/terminal-themes.js";
import { KeepAwakeToggle } from "./KeepAwakeToggle.js";
import Portal from "./Portal.js";
import RemoteAccessSettings from "./RemoteAccessSettings.js";

const THEME_OPTIONS: ThemeMode[] = ["system", "dark", "light"];
const BOARD_LAYOUT_OPTIONS: BoardLayout[] = ["auto", "rows", "compact"];
const TERMINAL_THEME_OPTIONS = [
  { id: "fractal" as TerminalThemeName, label: "Fractal" },
  { id: "catppuccin" as TerminalThemeName, label: "Catppuccin" },
  { id: "tokyo-night" as TerminalThemeName, label: "Tokyo Night" },
  { id: "solarized" as TerminalThemeName, label: "Solarized" },
];

type Tab = "remote" | "appearance";

type ElectronGlobals = typeof window & {
  electron?: {
    getConfig?: () => Promise<{ mode: string; remoteUrl: string }>;
    setMode?: (mode: string, remoteUrl: string) => Promise<{ mode: string }>;
  };
};

function ThemeIcon(props: { theme: ThemeMode }) {
  if (props.theme === "light") return <Sun size={12} />;
  if (props.theme === "dark") return <Moon size={12} />;
  return <Monitor size={12} />;
}

export default function AppSettingsModal(props: {
  onClose: () => void;
  theme: ThemeMode;
  terminalThemeName: TerminalThemeName;
  boardLayout: BoardLayout;
  onThemeChange: (theme: ThemeMode) => void;
  glass: GlassSettings;
  onGlassChange: (settings: GlassSettings) => void;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
  onBoardLayoutChange: (layout: BoardLayout) => void;
}) {
  const [tab, setTab] = useState<Tab>("remote");

  return (
    <Portal>
      <div className="modal-overlay" onClick={props.onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="app-settings-tabs">
            <button
              className={`app-settings-tab ${tab === "remote" ? "active" : ""}`}
              onClick={() => setTab("remote")}
            >
              <Radio size={14} />
              Remote
            </button>
            <button
              className={`app-settings-tab ${tab === "appearance" ? "active" : ""}`}
              onClick={() => setTab("appearance")}
            >
              <Palette size={14} />
              Appearance
            </button>
          </div>

          {tab === "remote" && (
            <div className="project-settings-body">
              <ModeDisplay />
              <RemoteAccessSettings />
              <KeepAwakeToggle />
            </div>
          )}

          {tab === "appearance" && (
            <div className="project-settings-body">
              <div className="project-settings-section">
                <div className="theme-popup-label">App theme</div>
                <div className="theme-segmented" role="radiogroup" aria-label="App theme">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={props.theme === option ? "active" : ""}
                      onClick={() => props.onThemeChange(option)}
                    >
                      <ThemeIcon theme={option} />
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="project-settings-section">
                <div className="theme-popup-label">Board layout</div>
                <div className="theme-segmented" role="radiogroup" aria-label="Board layout">
                  {BOARD_LAYOUT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={props.boardLayout === option ? "active" : ""}
                      onClick={() => props.onBoardLayoutChange(option)}
                    >
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="project-settings-section">
                <div className="theme-popup-label">Glass</div>
                <label className="theme-check-row">
                  <input
                    type="checkbox"
                    checked={props.glass.enabled}
                    onChange={(e) =>
                      props.onGlassChange({ ...props.glass, enabled: e.currentTarget.checked })
                    }
                  />
                  <span>Opacity + blur</span>
                </label>
                <label className="theme-range-row">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min="0.45"
                    max="1"
                    step="0.01"
                    value={props.glass.opacity}
                    onChange={(e) =>
                      props.onGlassChange({ ...props.glass, opacity: Number(e.currentTarget.value) })
                    }
                  />
                </label>
                <label className="theme-range-row">
                  <span>Blur</span>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={props.glass.blur}
                    onChange={(e) =>
                      props.onGlassChange({ ...props.glass, blur: Number(e.currentTarget.value) })
                    }
                  />
                </label>
              </div>
              <div className="project-settings-section">
                <div className="theme-popup-label">Terminal theme</div>
                <div className="model-picker-items theme-picker-items">
                  {TERMINAL_THEME_OPTIONS.map((option) => {
                    const preview = terminalThemePreview(props.theme, option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`picker-item theme-picker-item ${props.terminalThemeName === option.id ? "active" : ""}`}
                        style={
                          {
                            "--theme-preview-bg": preview.background,
                            "--theme-preview-fg": preview.foreground,
                            "--theme-preview-accent": preview.accent,
                          } as React.CSSProperties
                        }
                        onClick={() => props.onTerminalThemeChange(option.id)}
                      >
                        <span className="theme-swatch" />
                        <span className="picker-name">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <footer className="project-settings-footer">
            <button className="btn primary sm" onClick={props.onClose}>
              Done
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

function ModeDisplay() {
  const [mode, setMode] = useState<"host" | "remote" | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [switching, setSwitching] = useState(false);
  const [remoteInput, setRemoteInput] = useState("");
  const [error, setError] = useState("");
  const electron = (window as ElectronGlobals).electron;

  useEffect(() => {
    if (!electron?.getConfig) return;
    void electron.getConfig().then((cfg) => {
      setMode(cfg.mode === "remote" ? "remote" : "host");
      setRemoteUrl(cfg.remoteUrl || "");
    });
  }, []);

  function doSwitch(newMode: "host" | "remote", url = "") {
    if (!electron?.setMode) return;
    setSwitching(true);
    setError("");
    void electron.setMode(newMode, url).catch((e) => {
      console.error("[fractal] setMode failed", e);
      setError("Failed to switch mode");
      setSwitching(false);
    });
  }

  function handleSwitchToRemote() {
    const trimmed = remoteInput.trim();
    if (!trimmed || !/^https:\/\//.test(trimmed)) {
      setError("Enter a valid HTTPS URL");
      return;
    }
    const url = new URL(trimmed); url.pathname = ""; url.hash = ""; url.search = ""; doSwitch("remote", url.toString().replace(/\/$/, ""));
  }

  if (!electron?.setMode) return null;

  if (mode === "remote") {
    return (
      <div className="remote-access-section">
        <label className="project-settings-label">Mode</label>
        <p className="project-settings-hint">Connected to {remoteUrl || "remote host"}</p>
        <button className="btn ghost sm" onClick={() => doSwitch("host")} disabled={switching}>
          {switching ? "Switching…" : "Switch to Host Mode"}
        </button>
        {error && <p className="project-settings-hint" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="remote-access-section">
      <label className="project-settings-label">Mode</label>
      <p className="project-settings-hint">Running as host. All data and agents run on this machine.</p>
      <div className="project-settings-row">
        <input
          className="input"
          placeholder="https://m4pro.pangolin-frog.ts.net"
          value={remoteInput}
          onChange={(e) => { setRemoteInput(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleSwitchToRemote()}
          disabled={switching}
        />
        <button className="btn primary sm" onClick={handleSwitchToRemote} disabled={switching || !remoteInput.trim()}>
          {switching ? "…" : "Switch"}
        </button>
      </div>
      {error && <p className="project-settings-hint" style={{ color: "var(--danger)", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

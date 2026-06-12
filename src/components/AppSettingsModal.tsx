import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { AgentPreset, PiModel } from "~/lib/client/types.js";
import type { BoardLayout, GlassSettings, TerminalThemeName, ThemeMode } from "~/lib/client/persistence.js";
import { terminalThemePreview } from "~/lib/client/terminal-themes.js";
import { KeepAwakeToggle } from "./KeepAwakeToggle.js";
import Portal from "./Portal.js";
import RemoteAccessSettings from "./RemoteAccessSettings.js";
import { PresetSettings } from "./BoardParts.js";

const THEME_OPTIONS: ThemeMode[] = ["system", "dark", "light"];
const BOARD_LAYOUT_OPTIONS: BoardLayout[] = ["auto", "rows", "compact"];
const TERMINAL_THEME_OPTIONS = [
  { id: "fractal" as TerminalThemeName, label: "Fractal" },
  { id: "catppuccin" as TerminalThemeName, label: "Catppuccin" },
  { id: "tokyo-night" as TerminalThemeName, label: "Tokyo Night" },
  { id: "solarized" as TerminalThemeName, label: "Solarized" },
];

type Tab = "remote" | "presets" | "appearance";

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
  presets: AgentPreset[];
  defaultPresetId: string;
  helperPresetId: string;
  models: PiModel[];
  claudeModels: PiModel[];
  opencodeModels: PiModel[];
  onSetDefault: (id: string) => void;
  onSetHelper: (id: string) => void;
  onPresetsChange: (presets: AgentPreset[]) => void;
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
  const [presetSettingsOpen, setPresetSettingsOpen] = useState(false);

  return (
    <Portal>
      <div className="modal-overlay" onClick={props.onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="app-settings-tabs">
            <button
              className={`app-settings-tab ${tab === "remote" ? "active" : ""}`}
              onClick={() => setTab("remote")}
            >
              Remote
            </button>
            <button
              className={`app-settings-tab ${tab === "presets" ? "active" : ""}`}
              onClick={() => setTab("presets")}
            >
              Presets
            </button>
            <button
              className={`app-settings-tab ${tab === "appearance" ? "active" : ""}`}
              onClick={() => setTab("appearance")}
            >
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

          {tab === "presets" && (
            <div className="project-settings-body">
              <div className="project-settings-section">
                <label className="project-settings-label">Agent presets</label>
                <p className="project-settings-hint">
                  Configure default and helper presets for new prompts.
                </p>
                <PresetSettings
                  presets={props.presets}
                  defaultPresetId={props.defaultPresetId}
                  helperPresetId={props.helperPresetId}
                  onSetDefault={props.onSetDefault}
                  onSetHelper={props.onSetHelper}
                  piModels={props.models}
                  claudeModels={props.claudeModels}
                  opencodeModels={props.opencodeModels}
                  onChange={props.onPresetsChange}
                  open={presetSettingsOpen}
                  onOpenChange={setPresetSettingsOpen}
                />
                <div style={{ marginTop: 12 }}>
                  <button className="btn ghost sm" onClick={() => setPresetSettingsOpen(true)}>
                    + Create preset
                  </button>
                </div>
              </div>
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
  const hasElectron = Boolean((window as ElectronGlobals).electron?.setMode);

  useEffect(() => {
    const electron = (window as ElectronGlobals).electron;
    if (!electron?.getConfig) return;
    void electron.getConfig().then((cfg) => {
      setMode(cfg.mode === "remote" ? "remote" : "host");
      setRemoteUrl(cfg.remoteUrl || "");
    });
  }, []);

  if (!hasElectron) return null;

  function switchToRemote() {
    const url = window.prompt("Enter the HTTPS URL of your Fractal host:", "https://");
    if (!url || !/^https:\/\//.test(url.trim())) return;
    if (!window.confirm("This will restart Fractal in remote mode. Continue?")) return;
    void (window as ElectronGlobals).electron?.setMode?.("remote", url.trim());
  }

  function switchToHost() {
    if (!window.confirm("This will restart Fractal in host mode. Continue?")) return;
    void (window as ElectronGlobals).electron?.setMode?.("host", "");
  }

  if (mode === "remote") {
    return (
      <div className="remote-access-section">
        <label className="project-settings-label">Mode</label>
        <p className="project-settings-hint">Connected to {remoteUrl || "remote host"}</p>
        <button className="btn ghost sm" onClick={switchToHost}>
          Switch to Host Mode
        </button>
      </div>
    );
  }

  return (
    <div className="remote-access-section">
      <label className="project-settings-label">Mode</label>
      <p className="project-settings-hint">
        Running as host. All data and agents run on this machine.
      </p>
      <button className="btn ghost sm" onClick={switchToRemote}>
        Switch to Remote Mode
      </button>
    </div>
  );
}

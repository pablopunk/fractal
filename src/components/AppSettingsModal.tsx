import { Bot, Monitor, Moon, Palette, Radio, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type FractalAgentProvider, modelLabel, providerLabel } from "~/lib/agent-providers.js";
import type {
  BoardLayout,
  GlassSettings,
  TerminalThemeName,
  ThemeMode,
} from "~/lib/client/persistence.js";
import { terminalThemePreview } from "~/lib/client/terminal-themes.js";
import type { PiModel } from "~/lib/client/types.js";
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

type Tab = "remote" | "appearance" | "fractal-agent";

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
  piModels?: PiModel[];
  fractalAgentProvider?: FractalAgentProvider | "";
  fractalAgentModel?: string;
  onFractalAgentProviderChange?: (provider: FractalAgentProvider | "") => void;
  onFractalAgentModelChange?: (model: string) => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? "remote");

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
            <button
              className={`app-settings-tab ${tab === "fractal-agent" ? "active" : ""}`}
              onClick={() => setTab("fractal-agent")}
            >
              <Bot size={14} />
              Fractal Agent
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
                    className="fractal-checkbox"
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
                      props.onGlassChange({
                        ...props.glass,
                        opacity: Number(e.currentTarget.value),
                      })
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

          {tab === "fractal-agent" && (
            <div className="project-settings-body">
              <FractalAgentFields
                provider={props.fractalAgentProvider ?? ""}
                model={props.fractalAgentModel ?? ""}
                piModels={props.piModels ?? []}
                onProviderChange={props.onFractalAgentProviderChange ?? (() => {})}
                onModelChange={props.onFractalAgentModelChange ?? (() => {})}
              />
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
    doSwitch("remote", trimmed.replace(/\/$/, ""));
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
        {error && (
          <p className="project-settings-hint" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="remote-access-section">
      <label className="project-settings-label">Mode</label>
      <p className="project-settings-hint">
        Running as host. All data and agents run on this machine.
      </p>
      <div className="project-settings-row">
        <input
          className="input"
          placeholder="https://m4pro.pangolin-frog.ts.net"
          value={remoteInput}
          onChange={(e) => {
            setRemoteInput(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSwitchToRemote()}
          disabled={switching}
        />
        <button
          className="btn primary sm"
          onClick={handleSwitchToRemote}
          disabled={switching || !remoteInput.trim()}
        >
          {switching ? "…" : "Switch"}
        </button>
      </div>
      {error && (
        <p className="project-settings-hint" style={{ color: "var(--danger)", marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function FractalAgentFields({
  provider,
  model,
  piModels,
  onProviderChange,
  onModelChange,
}: {
  provider: FractalAgentProvider | "";
  model: string;
  piModels: PiModel[];
  onProviderChange: (provider: FractalAgentProvider | "") => void;
  onModelChange: (model: string) => void;
}) {
  const availableProviders = useMemo(() => {
    const ids = new Set(piModels.map((m) => m.provider as FractalAgentProvider));
    return Array.from(ids).sort();
  }, [piModels]);

  const availableModels = useMemo(
    () =>
      piModels
        .filter((m) => !provider || m.provider === provider)
        .map((m) => ({
          provider: m.provider as FractalAgentProvider,
          id: m.model,
          value: `${m.provider}/${m.model}`,
          label: modelLabel(m.provider as FractalAgentProvider, m.model),
        })),
    [piModels, provider],
  );

  const selectedModelValue = provider && model ? `${provider}/${model}` : "";
  const hasPiModels = piModels.length > 0;

  useEffect(() => {
    if (provider && !availableProviders.includes(provider)) {
      onProviderChange("");
      onModelChange("");
      return;
    }
    if (model && !availableModels.some((availableModel) => availableModel.id === model)) {
      onModelChange("");
    }
  }, [provider, model, availableProviders, availableModels, onProviderChange, onModelChange]);

  const handleProviderChange = (value: string) => {
    const nextProvider = value === "" ? "" : (value as FractalAgentProvider);
    onProviderChange(nextProvider);
    if (
      nextProvider &&
      model &&
      !piModels.some((m) => m.provider === nextProvider && m.model === model)
    ) {
      onModelChange("");
    }
  };

  const handleModelChange = (value: string) => {
    if (!value) {
      onModelChange("");
      return;
    }
    const found = availableModels.find((m) => m.value === value);
    if (!found) return;
    onProviderChange(found.provider);
    onModelChange(found.id);
  };

  return (
    <>
      <div className="project-settings-section">
        <label className="project-settings-label">Local Pi required</label>
        <p className="project-settings-hint">
          Fractal Agent uses your local Pi installation and Pi auth only. Run Pi locally, log in
          there, then choose one of the authenticated Pi models.
        </p>
      </div>

      <div className="project-settings-section">
        <label className="project-settings-label">Fractal Agent Provider</label>
        <p className="project-settings-hint">Providers come from your local Pi model registry.</p>
        <select
          className="input"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          disabled={!hasPiModels}
          style={{ marginTop: 4, opacity: hasPiModels ? 1 : 0.5 }}
        >
          <option value="">{hasPiModels ? "Any provider" : "No local Pi models found"}</option>
          {availableProviders.map((id) => (
            <option key={id} value={id}>
              {providerLabel(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="project-settings-section">
        <label className="project-settings-label">Fractal Agent Model</label>
        <p className="project-settings-hint">
          {hasPiModels
            ? "Select a model from your local Pi model list."
            : "Install and log into Pi, then reopen settings after Pi has authenticated models."}
        </p>
        <select
          className="input"
          value={selectedModelValue}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!hasPiModels}
          style={{ marginTop: 4, opacity: hasPiModels ? 1 : 0.5 }}
        >
          <option value="">{hasPiModels ? "Select a model..." : "No local Pi models found"}</option>
          {availableModels.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} — {providerLabel(m.provider)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

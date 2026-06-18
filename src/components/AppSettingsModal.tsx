import { Bot, Monitor, Moon, Palette, Radio, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  FRACTAL_AGENT_MODELS,
  FRACTAL_AGENT_PROVIDERS,
  type FractalAgentProvider,
  providerLabel,
} from "~/lib/agent-providers.js";
import type {
  BoardLayout,
  GlassSettings,
  TerminalThemeName,
  ThemeMode,
} from "~/lib/client/persistence.js";
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
  apiKeys?: Record<string, string>;
  onApiKeysChange?: (keys: Record<string, string>) => void;
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
              <AddProviderFields
                apiKeys={props.apiKeys ?? {}}
                onChange={props.onApiKeysChange ?? (() => {})}
              />
              <FractalAgentFields
                provider={props.fractalAgentProvider ?? ""}
                model={props.fractalAgentModel ?? ""}
                apiKeys={props.apiKeys ?? {}}
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
    const url = new URL(trimmed);
    const hashToken = new URLSearchParams(url.hash.slice(1)).get("token");
    url.hash = "";
    if (hashToken) url.searchParams.set("token", hashToken);
    doSwitch("remote", url.toString().replace(/\/$/, ""));
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

function AddProviderFields({
  apiKeys,
  onChange,
}: {
  apiKeys: Record<string, string>;
  onChange: (keys: Record<string, string>) => void;
}) {
  const [providerToAdd, setProviderToAdd] = useState<FractalAgentProvider | "">("");
  const configuredProviders = FRACTAL_AGENT_PROVIDERS.filter((provider) =>
    apiKeys[provider.id]?.trim(),
  );
  const availableProviders = FRACTAL_AGENT_PROVIDERS.filter(
    (provider) => !apiKeys[provider.id]?.trim() || provider.id === providerToAdd,
  );
  const selectedProvider = FRACTAL_AGENT_PROVIDERS.find(
    (provider) => provider.id === providerToAdd,
  );

  function updateProviderKey(providerId: FractalAgentProvider, value: string) {
    const trimmed = value.trim();
    const next = { ...apiKeys };
    if (trimmed) next[providerId] = trimmed;
    else delete next[providerId];
    onChange(next);
  }

  return (
    <>
      <div className="project-settings-section">
        <label className="project-settings-label">Add provider</label>
        <p className="project-settings-hint">
          Connect only the providers you want the Fractal Agent to use.
        </p>
        <select
          className="input"
          value={providerToAdd}
          onChange={(e) => setProviderToAdd(e.target.value as FractalAgentProvider | "")}
          disabled={availableProviders.length === 0}
          style={{ marginTop: 4, opacity: availableProviders.length === 0 ? 0.5 : 1 }}
        >
          <option value="">
            {availableProviders.length === 0 ? "All providers connected" : "Select provider..."}
          </option>
          {availableProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
              {apiKeys[provider.id]?.trim() ? " (connected)" : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedProvider && (
        <div className="project-settings-section">
          <label className="project-settings-label">{selectedProvider.keyLabel}</label>
          <p className="project-settings-hint">{selectedProvider.keyHint}</p>
          <input
            type="password"
            className="input"
            placeholder={selectedProvider.keyPlaceholder}
            value={apiKeys[selectedProvider.id] ?? ""}
            onChange={(e) => updateProviderKey(selectedProvider.id, e.target.value)}
            style={{ marginTop: 4 }}
          />
        </div>
      )}

      <div className="project-settings-section">
        <label className="project-settings-label">Connected providers</label>
        {configuredProviders.length === 0 ? (
          <p className="project-settings-hint">No providers connected yet.</p>
        ) : (
          <div className="model-picker-items" style={{ marginTop: 6 }}>
            {configuredProviders.map((provider) => (
              <div key={provider.id} className="picker-item">
                <span className="picker-name">{provider.label}</span>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => updateProviderKey(provider.id, "")}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FractalAgentFields({
  provider,
  model,
  apiKeys,
  onProviderChange,
  onModelChange,
}: {
  provider: FractalAgentProvider | "";
  model: string;
  apiKeys: Record<string, string>;
  onProviderChange: (provider: FractalAgentProvider | "") => void;
  onModelChange: (model: string) => void;
}) {
  const configuredProviders = useMemo(
    () => FRACTAL_AGENT_PROVIDERS.filter((p) => apiKeys[p.id]?.trim()),
    [apiKeys],
  );

  const availableModels = useMemo(() => {
    const models: Array<{ provider: FractalAgentProvider; id: string; label: string }> = [];
    for (const p of configuredProviders) {
      for (const m of FRACTAL_AGENT_MODELS[p.id]) {
        models.push({ provider: p.id, id: m.id, label: m.label });
      }
    }
    return models;
  }, [configuredProviders]);

  const hasProviders = configuredProviders.length > 0;

  useEffect(() => {
    if (provider && !apiKeys[provider]?.trim()) {
      onProviderChange("");
      onModelChange("");
      return;
    }
    if (model && !availableModels.some((availableModel) => availableModel.id === model)) {
      onModelChange("");
    }
  }, [apiKeys, provider, model, availableModels, onProviderChange, onModelChange]);

  const handleProviderChange = (value: string) => {
    const newProv = value === "" ? "" : (value as FractalAgentProvider);
    onProviderChange(newProv);
    if (newProv && model) {
      const valid = FRACTAL_AGENT_MODELS[newProv]?.some((m) => m.id === model);
      if (!valid) onModelChange("");
    }
  };

  const handleModelChange = (value: string) => {
    onModelChange(value);
    if (value) {
      const found = availableModels.find((m) => m.id === value);
      if (found && found.provider !== provider) {
        onProviderChange(found.provider);
      }
    }
  };

  return (
    <>
      <div className="project-settings-section">
        <label className="project-settings-label">Fractal Agent Provider</label>
        <p className="project-settings-hint">Choose which AI provider the Fractal Agent uses.</p>
        <select
          className="input"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          style={{ marginTop: 4 }}
        >
          <option value="">
            {hasProviders ? "Select a provider..." : "No providers configured"}
          </option>
          {configuredProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="project-settings-section">
        <label className="project-settings-label">Fractal Agent Model</label>
        <p className="project-settings-hint">
          {hasProviders
            ? "Select which model the Fractal Agent uses."
            : "Configure an API key below to choose a model."}
        </p>
        <select
          className="input"
          value={hasProviders ? model : ""}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!hasProviders}
          style={{ marginTop: 4, opacity: hasProviders ? 1 : 0.5 }}
        >
          <option value="">{hasProviders ? "Select a model..." : "No providers configured"}</option>
          {availableModels.map((m) => (
            <option key={`${m.provider}/${m.id}`} value={m.id}>
              {m.label} — {providerLabel(m.provider)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

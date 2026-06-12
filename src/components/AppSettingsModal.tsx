import { useEffect, useState } from "react";
import { KeepAwakeToggle } from "./KeepAwakeToggle.js";
import Portal from "./Portal.js";
import RemoteAccessSettings from "./RemoteAccessSettings.js";

type ElectronGlobals = typeof window & {
  electron?: {
    getConfig?: () => Promise<{ mode: string; remoteUrl: string }>;
    setMode?: (mode: string, remoteUrl: string) => Promise<{ mode: string }>;
  };
};

function ModePicker() {
  const [mode, setMode] = useState<"host" | "remote" | null>(null);
  const [remoteUrlInput, setRemoteUrlInput] = useState("");
  const hasElectron = Boolean((window as ElectronGlobals).electron?.setMode);

  useEffect(() => {
    const electron = (window as ElectronGlobals).electron;
    if (!electron?.getConfig) return;
    void electron.getConfig().then((cfg) => setMode(cfg.mode === "remote" ? "remote" : "host"));
  }, []);

  if (!hasElectron) return null;

  function switchToRemote() {
    const electron = (window as ElectronGlobals).electron;
    if (!electron?.setMode) return;
    const url = remoteUrlInput.trim() || "";
    void electron.setMode("remote", url).then(() => setMode("remote"));
  }

  function switchToHost() {
    const electron = (window as ElectronGlobals).electron;
    if (!electron?.setMode) return;
    void electron.setMode("host", "").then(() => setMode("host"));
  }

  if (mode === "remote") {
    return (
      <div className="remote-access-section">
        <label className="project-settings-label">Mode</label>
        <p className="project-settings-hint">
          Currently in remote mode. The app restarts when switching.
        </p>
        <button className="btn ghost sm" onClick={switchToHost}>
          Switch to Host Mode
        </button>
      </div>
    );
  }

  return (
    <div className="remote-access-section">
      <label className="project-settings-label">Mode</label>
      <p className="project-settings-hint">Connect to a Fractal host on your Tailscale network.</p>
      <div className="project-settings-row">
        <input
          className="input"
          placeholder="https://laptop.tail1234.ts.net"
          value={remoteUrlInput}
          onChange={(e) => setRemoteUrlInput(e.target.value)}
        />
        <button className="btn ghost sm" onClick={switchToRemote}>
          Switch
        </button>
      </div>
    </div>
  );
}

export default function AppSettingsModal(props: { onClose: () => void }) {
  return (
    <Portal>
      <div className="modal-overlay" onClick={props.onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <header className="preset-modal-header">
            <h2>Settings</h2>
            <button className="btn ghost sm" onClick={props.onClose}>
              Close
            </button>
          </header>
          <div className="project-settings-body">
            <ModePicker />
            <RemoteAccessSettings />
            <KeepAwakeToggle />
          </div>
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

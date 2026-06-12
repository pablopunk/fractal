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
            <ModeDisplay />
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

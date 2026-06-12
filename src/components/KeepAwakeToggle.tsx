import { useEffect, useState } from "react";

type ElectronGlobals = typeof window & {
  electron?: {
    setKeepAwake?: (enabled: boolean) => Promise<{ keepAwakeEnabled: boolean }>;
    getConfig?: () => Promise<{ keepAwakeEnabled: boolean }>;
  };
};

export function KeepAwakeToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasElectron = Boolean((window as ElectronGlobals).electron?.setKeepAwake);

  useEffect(() => {
    const electron = (window as ElectronGlobals).electron;
    if (!electron?.getConfig) {
      setLoading(false);
      return;
    }
    void electron
      .getConfig()
      .then((cfg) => setEnabled(cfg.keepAwakeEnabled))
      .finally(() => setLoading(false));
  }, []);

  async function toggle() {
    const electron = (window as ElectronGlobals).electron;
    const next = !enabled;
    if (electron?.setKeepAwake) {
      const cfg = await electron.setKeepAwake(next);
      setEnabled(cfg.keepAwakeEnabled);
    }
  }

  if (!hasElectron) return null;
  if (loading) return <div className="remote-access-loading">Loading…</div>;

  return (
    <div className="remote-access-section">
      <label className="project-settings-label">Power</label>
      <p className="project-settings-hint">
        Prevent your Mac from sleeping while Fractal is running.
      </p>
      <label className="project-settings-toggle">
        <input type="checkbox" checked={enabled} onChange={toggle} />
        <span>Keep Mac awake</span>
      </label>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api } from "~/lib/client/api.js";

type TailscaleStatus = {
  installed: boolean;
  hostname: string | null;
  dnsName: string | null;
  tailnetName: string | null;
  online: boolean;
  error?: string;
};

export default function RemoteAccessSettings() {
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [tailscale, setTailscale] = useState<TailscaleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    const data = await api<{ settings: { remoteAccessEnabled: boolean; remoteAccessToken: string } }>("/api/settings");
    setEnabled(data.settings.remoteAccessEnabled);
    setToken(data.settings.remoteAccessToken);
  }, []);

  const fetchTailscale = useCallback(async () => {
    const data = await api<TailscaleStatus>("/api/tailscale/status");
    setTailscale(data);
  }, []);

  useEffect(() => {
    void Promise.all([fetchSettings(), fetchTailscale()]).finally(() => setLoading(false));
  }, [fetchSettings, fetchTailscale]);

  useEffect(() => {
    if (!enabled || !tailscale?.dnsName || !token) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = `https://${tailscale.dnsName}/connect#token=${encodeURIComponent(token)}`;
      const svg = await QRCode.toString(url, { type: "svg", width: 200, margin: 2 });
      if (!cancelled) setQrSvg(svg);
    })();
    return () => { cancelled = true; };
  }, [enabled, tailscale?.dnsName, token]);

  async function toggleEnabled() {
    const next = !enabled;
    const data = await api<{ settings: { remoteAccessEnabled: boolean; remoteAccessToken: string } }>(
      "/api/settings",
      { method: "PATCH", body: JSON.stringify({ remoteAccessEnabled: next }) },
    );
    setEnabled(data.settings.remoteAccessEnabled);
    setToken(data.settings.remoteAccessToken);
    if (next) fetchTailscale();
  }

  async function regenerateToken() {
    const data = await api<{ token: string }>("/api/settings/remote-token", { method: "POST" });
    setToken(data.token);
  }

  const connectUrl = tailscale?.dnsName && token
    ? `https://${tailscale.dnsName}/connect#token=${encodeURIComponent(token)}`
    : null;

  async function copyUrl() {
    if (!connectUrl) return;
    try {
      await navigator.clipboard.writeText(connectUrl);
    } catch {
      const input = document.createElement("input");
      input.value = connectUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
  }

  if (loading) return <div className="remote-access-loading">Loading settings…</div>;

  return (
    <div className="remote-access-section">
      <label className="project-settings-label">Remote Access</label>
      <p className="project-settings-hint">
        Access Fractal from another device on your Tailscale network.
      </p>

      <label className="project-settings-toggle">
        <input type="checkbox" checked={enabled} onChange={toggleEnabled} />
        <span>Enable remote access</span>
      </label>

      {enabled && (
        <div className="remote-access-details">
          {tailscale && !tailscale.installed && (
            <div className="remote-access-warning">
              Tailscale is not installed.{" "}
              <a href="https://tailscale.com/download" target="_blank" rel="noopener noreferrer">
                Install Tailscale
              </a>{" "}
              to enable remote access.
            </div>
          )}

          {tailscale?.installed && !tailscale.online && (
            <div className="remote-access-warning">
              Tailscale is installed but not connected. Open the Tailscale app and sign in.
            </div>
          )}

          {tailscale?.dnsName && (
            <>
              <div className="remote-access-url-row">
                <input className="input" value={connectUrl ?? ""} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button className="btn ghost sm" onClick={copyUrl}>
                  Copy
                </button>
              </div>

              {qrSvg && (
                <div className="remote-access-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              )}

              <div className="remote-access-token-row">
                <span className="remote-access-token">{token.slice(0, 16)}…</span>
                <button className="btn ghost sm" onClick={regenerateToken}>
                  Regenerate
                </button>
              </div>
            </>
          )}

          {tailscale?.installed && !tailscale.dnsName && !tailscale.error && (
            <div className="remote-access-info">
              Detecting Tailscale device info…
            </div>
          )}

          {tailscale?.error && (
            <div className="remote-access-error">
              Error: {tailscale.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

function useReconnectBanner() {
  const [unreachable, setUnreachable] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(1);
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
        if (cancelled) return;
        if (res.ok) {
          setUnreachable(false);
          setRetrySeconds(1);
          retryDelayRef.current = 1000;
          timer = setTimeout(check, 15000);
          return;
        }
      } catch {}
      if (cancelled) return;
      setUnreachable(true);
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
      setRetrySeconds(Math.round(retryDelayRef.current / 1000));
      timer = setTimeout(check, retryDelayRef.current);
    }

    timer = setTimeout(check, 5000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { unreachable, retrySeconds };
}

export default function ReconnectBanner() {
  const { unreachable, retrySeconds } = useReconnectBanner();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!unreachable) setDismissed(false);
  }, [unreachable]);

  if (!unreachable || dismissed) return null;

  return (
    <div className="reconnect-banner">
      <span className="reconnect-banner-text">
        <span className="reconnect-spinner" />
        Reconnecting to Fractal{retrySeconds > 1 ? ` (retrying in ${retrySeconds}s)` : ""}
      </span>
      <button
        className="reconnect-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

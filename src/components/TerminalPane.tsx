import { useEffect, useRef } from "react";
import { Columns2, Rows2, X, Terminal as TerminalIcon } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { Terminal as XTermTerminal } from "@xterm/xterm";

type TerminalTab = {
  id: string;
  session: string;
  title: string;
};

type ElectronGlobals = typeof window & {
  electron?: {
    terminalPort?: number | null;
    getPathForFile?: (file: File) => string;
  };
};

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

function shellQuote(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function getImagePaths(dt: DataTransfer): string[] {
  const electron = (window as ElectronGlobals).electron;
  const fromFiles = Array.from(dt.files)
    .filter((file) => file.type.startsWith("image/") || IMAGE_RE.test(file.name))
    .map((file) => electron?.getPathForFile?.(file) ?? "")
    .filter(Boolean);

  if (fromFiles.length > 0) return fromFiles;

  return dt.getData("text/uri-list")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.startsWith("file://"))
    .map((uri) => {
      try {
        return decodeURIComponent(new URL(uri).pathname);
      } catch {
        return "";
      }
    })
    .filter((path) => path && IMAGE_RE.test(path));
}

function imagePathsAsTerminalPaste(paths: string[]): string {
  return paths.map(shellQuote).join(" ");
}

export default function TerminalPane(props: {
  tabs: TerminalTab[];
  activeId: string | null;
  position: "right" | "bottom";
  size: number;
  onResize: (size: number) => void;
  onTogglePosition: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const active = props.tabs.find((tab) => tab.id === props.activeId) ?? props.tabs[0];
  const dragging = useRef(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      if (props.position === "right") {
        props.onResize(Math.min(Math.max(window.innerWidth - e.clientX, 320), Math.floor(window.innerWidth * 0.72)));
      } else {
        props.onResize(Math.min(Math.max(window.innerHeight - e.clientY, 180), Math.floor(window.innerHeight * 0.72)));
      }
    }
    function onUp() { dragging.current = false; }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [props]);

  if (!active) return null;

  return (
    <aside className={`terminal-pane terminal-pane-${props.position}`} style={props.position === "right" ? { width: props.size } : { height: props.size }}>
      <div
        className={`terminal-resizer terminal-resizer-${props.position}`}
        onPointerDown={(e) => {
          e.preventDefault();
          dragging.current = true;
        }}
      />
      <div className="terminal-tabs">
        {props.tabs.map((tab) => (
          <button key={tab.id} className={`terminal-tab ${tab.id === active.id ? "active" : ""}`} onClick={() => props.onSelect(tab.id)} title={tab.session}>
            <TerminalIcon size={13} />
            <span>{tab.title}</span>
            <span
              className="terminal-tab-close"
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); props.onClose(tab.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); props.onClose(tab.id); } }}
              aria-label={`Close ${tab.title}`}
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button className="terminal-pane-toggle" onClick={props.onTogglePosition} title={props.position === "right" ? "Move terminal to bottom" : "Move terminal to right"} aria-label="Toggle terminal position">
          {props.position === "right" ? <Rows2 size={14} /> : <Columns2 size={14} />}
        </button>
      </div>
      <TerminalView key={active.id} tab={active} onClose={props.onClose} />
    </aside>
  );
}

function TerminalView({ tab, onClose }: { tab: TerminalTab; onClose: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const port = (window as ElectronGlobals).electron?.terminalPort;
    const host = hostRef.current;
    if (!host) return;

    let term: XTermTerminal;
    let fit: import("@xterm/addon-fit").FitAddon;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let input: { dispose: () => void } | null = null;
    let disposed = false;
    const sendData = (data: string) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "data", data }));
    };
    const pasteImagePaths = (dt: DataTransfer | null) => {
      if (!dt) return false;
      const paths = getImagePaths(dt);
      if (paths.length === 0) return false;
      sendData(imagePathsAsTerminalPaste(paths));
      return true;
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!pasteImagePaths(event.clipboardData)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDragOver = (event: DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).some((type) => type === "Files" || type === "text/uri-list")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      if (!pasteImagePaths(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      term?.focus();
    };

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !hostRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontFamily: '"JetBrainsMono Nerd Font Mono", "JetBrainsMono Nerd Font", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        fontWeight: "400",
        letterSpacing: 0,
        lineHeight: 1,
        theme: { background: "#0b0b0d", foreground: "#ededf0", cursor: "#ff6a3d" },
        allowProposedApi: false,
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      host.addEventListener("paste", onPaste);
      host.addEventListener("dragover", onDragOver);
      host.addEventListener("drop", onDrop);
      fit.fit();

      if (!port) {
        term.writeln("Terminal server is only available in the Electron app.");
        return;
      }

      ws = new WebSocket(`ws://127.0.0.1:${port}/terminal?session=${encodeURIComponent(tab.session)}`);
      const sendResize = () => {
        fit.fit();
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };
      resizeObserver = new ResizeObserver(sendResize);
      resizeObserver.observe(host);

      ws.addEventListener("open", sendResize);
      ws.addEventListener("message", (event) => {
        const msg = JSON.parse(String(event.data)) as { type: string; data?: string; message?: string };
        if (msg.type === "data" && msg.data) term.write(msg.data);
        if (msg.type === "error") term.writeln(`\r\n${msg.message ?? "Terminal error"}`);
      });
      ws.addEventListener("close", () => {
        if (disposed) return;
        onCloseRef.current(tab.id);
      });

      input = term.onData(sendData);
    })();

    return () => {
      disposed = true;
      input?.dispose();
      resizeObserver?.disconnect();
      host.removeEventListener("paste", onPaste);
      host.removeEventListener("dragover", onDragOver);
      host.removeEventListener("drop", onDrop);
      ws?.close();
      term?.dispose();
    };
  }, [tab.id, tab.session]);

  return <div ref={hostRef} className="terminal-host" />;
}

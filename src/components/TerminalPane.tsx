import { useEffect, useRef } from "react";
import { Columns2, Rows2, X, Terminal as TerminalIcon } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { ITheme, Terminal as XTermTerminal } from "@xterm/xterm";
import Tooltip from "./Tooltip.js";
import { getImagePaths, handleOsc52, imagePathsAsTerminalPaste, writeClipboard } from "~/lib/client/terminal-utils.js";
import type { ThemeMode } from "~/lib/client/persistence.js";

type TerminalTab = {
  id: string;
  session: string;
  title: string;
  cwd?: string;
};

type ElectronGlobals = typeof window & {
  electron?: {
    terminalPort?: number | null;
    getPathForFile?: (file: File) => string;
  };
};

function isLightTheme(theme: ThemeMode): boolean {
  if (theme === "light") return true;
  if (theme === "dark") return false;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
}

function terminalTheme(theme: ThemeMode): ITheme {
  if (!isLightTheme(theme)) return { background: "#0b0b0d", foreground: "#ededf0", cursor: "#ff6a3d" };
  return {
    background: "#fafafa",
    foreground: "#15151a",
    cursor: "#ea580c",
    selectionBackground: "#d4d4d8",
    black: "#24242b",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#e4e4e7",
    brightBlack: "#71717a",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#fafafa",
  };
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
  focusKey: number;
  theme: ThemeMode;
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
          <Tooltip key={tab.id} content={tab.session}>
            <button className={`terminal-tab ${tab.id === active.id ? "active" : ""}`} onClick={() => props.onSelect(tab.id)}>
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
          </Tooltip>
        ))}
        <Tooltip content={props.position === "right" ? "Move terminal to bottom" : "Move terminal to right"}>
          <button className="terminal-pane-toggle" onClick={props.onTogglePosition} aria-label="Toggle terminal position">
            {props.position === "right" ? <Rows2 size={14} /> : <Columns2 size={14} />}
          </button>
        </Tooltip>
      </div>
      <TerminalView key={active.id} tab={active} onClose={props.onClose} focusKey={props.focusKey} theme={props.theme} />
    </aside>
  );
}

function TerminalView({ tab, onClose, focusKey, theme }: { tab: TerminalTab; onClose: (id: string) => void; focusKey: number; theme: ThemeMode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    termRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const applyTheme = () => {
      if (termRef.current) termRef.current.options.theme = terminalTheme(theme);
    };
    applyTheme();
    if (theme !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    media?.addEventListener("change", applyTheme);
    return () => media?.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const port = (window as ElectronGlobals).electron?.terminalPort;
    const host = hostRef.current;
    if (!host) return;

    let term: XTermTerminal;
    let fit: import("@xterm/addon-fit").FitAddon;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let input: { dispose: () => void } | null = null;
    let osc52: { dispose: () => void } | null = null;
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
    const onShiftMouseDown = (event: MouseEvent) => {
      // xterm.js forces selection with Shift on Linux/Windows, but with Option on macOS.
      // Re-dispatch Shift+drag as Option+drag so this app matches other terminals.
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.button !== 0 || event.defaultPrevented) return;
      if ((event as MouseEvent & { __fractalShiftSelection?: boolean }).__fractalShiftSelection) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const clone = new MouseEvent(event.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: event.detail,
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        relatedTarget: event.relatedTarget,
        altKey: true,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      }) as MouseEvent & { __fractalShiftSelection?: boolean };
      clone.__fractalShiftSelection = true;
      event.target?.dispatchEvent(clone);
    };

    void (async () => {
      const terminalFontFamily = '"Fractal JetBrainsMono Nerd Font Mono", "JetBrainsMono Nerd Font Mono", "JetBrainsMono Nerd Font", "JetBrains Mono", Menlo, Monaco, Consolas, monospace';
      const [{ Terminal }, { FitAddon }, webglMod] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-webgl").catch(() => null),
        document.fonts?.load?.(`400 14px ${terminalFontFamily}`) ?? Promise.resolve(),
        document.fonts?.load?.(`700 14px ${terminalFontFamily}`) ?? Promise.resolve(),
      ]);
      if (disposed || !hostRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontFamily: terminalFontFamily,
        fontSize: 14,
        fontWeight: "400",
        fontWeightBold: "700",
        letterSpacing: 0,
        lineHeight: 1,
        theme: terminalTheme(theme),
        allowProposedApi: false,
        macOptionClickForcesSelection: true,
        rightClickSelectsWord: true,
      });
      termRef.current = term;
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
          event.preventDefault();
          onCloseRef.current(tab.id);
          return false;
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && term.hasSelection()) {
          event.preventDefault();
          void writeClipboard(term.getSelection());
          term.clearSelection();
          return false;
        }

        if (event.key === "Enter" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          sendData("\x1b[13;2u");
          return false;
        }
        return true;
      });
      osc52 = term.parser.registerOscHandler(52, handleOsc52);
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try {
        const WebglAddon = webglMod?.WebglAddon;
        if (WebglAddon) term.loadAddon(new WebglAddon());
      } catch (err) {
        console.warn("[fractal-terminal] webgl renderer unavailable, falling back to DOM", err);
      }
      term.focus();
      host.addEventListener("paste", onPaste);
      host.addEventListener("dragover", onDragOver);
      host.addEventListener("drop", onDrop);
      host.addEventListener("mousedown", onShiftMouseDown, { capture: true });
      fit.fit();

      if (!port) {
        term.writeln("Terminal server is only available in the Electron app.");
        return;
      }

      const params = new URLSearchParams({ session: tab.session });
      if (tab.cwd) params.set("cwd", tab.cwd);
      ws = new WebSocket(`ws://127.0.0.1:${port}/terminal?${params.toString()}`);
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
      ws.addEventListener("close", (event) => {
        if (disposed) return;
        if (event.code === 1000 && event.reason.startsWith("terminal exited")) {
          onCloseRef.current(tab.id);
          return;
        }
        term.writeln(`\r\nTerminal disconnected${event.reason ? `: ${event.reason}` : ""}`);
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
      host.removeEventListener("mousedown", onShiftMouseDown, { capture: true });
      ws?.close();
      termRef.current = null;
      osc52?.dispose();
      term?.dispose();
    };
  }, [tab.id, tab.session, tab.cwd]);

  return <div ref={hostRef} className="terminal-host" />;
}

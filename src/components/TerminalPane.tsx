import { useEffect, useRef, useState } from "react";
import { Columns2, Rows2, X, Terminal as TerminalIcon } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import Tooltip from "./Tooltip.js";
import { filePathsAsTerminalPaste, getFilePaths, handleOsc52, writeClipboard } from "~/lib/client/terminal-utils.js";
import type { ThemeMode } from "~/lib/client/persistence.js";
import { terminalTheme, type TerminalThemeName } from "~/lib/client/terminal-themes.js";

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
    openExternal?: (url: string) => Promise<boolean>;
  };
};

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;
const BOARD_ICON_RAIL_MIN_WIDTH = 56;
const BOARD_STACK_MIN_HEIGHT = 96;

function trimUrl(url: string): string {
  return url.replace(/[),.;:!?\]}]+$/g, "");
}

function terminalLinkAt(term: XTermTerminal, host: HTMLElement, event: MouseEvent): string | null {
  const screen = host.querySelector<HTMLElement>(".xterm-screen");
  const rect = screen?.getBoundingClientRect();
  if (!rect) return null;

  const col = Math.floor(((event.clientX - rect.left) / rect.width) * term.cols);
  const viewportRow = Math.floor(((event.clientY - rect.top) / rect.height) * term.rows);
  if (col < 0 || viewportRow < 0 || col >= term.cols || viewportRow >= term.rows) return null;

  const bufferRow = term.buffer.active.baseY + viewportRow;
  const line = term.buffer.active.getLine(bufferRow)?.translateToString(true) ?? "";
  for (const match of line.matchAll(URL_RE)) {
    const url = trimUrl(match[0]);
    const start = match.index ?? 0;
    if (col >= start && col <= start + url.length) return url;
  }
  return null;
}

export default function TerminalPane(props: {
  tabs: TerminalTab[];
  activeId: string | null;
  position: "right" | "bottom";
  size: number;
  snug?: boolean;
  onResize: (size: number) => void;
  onTogglePosition: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  focusKey: number;
  theme: ThemeMode;
  terminalThemeName: TerminalThemeName;
  glassEnabled: boolean;
}) {
  const active = props.tabs.find((tab) => tab.id === props.activeId) ?? props.tabs[0];
  const dragging = useRef(false);
  const paneRef = useRef<HTMLElement | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      const workspaceRect = paneRef.current?.parentElement?.getBoundingClientRect();
      if (props.position === "right") {
        const right = workspaceRect?.right ?? window.innerWidth;
        const width = workspaceRect?.width ?? window.innerWidth;
        props.onResize(Math.min(Math.max(right - e.clientX, 320), Math.max(320, width - BOARD_ICON_RAIL_MIN_WIDTH)));
      } else {
        const bottom = workspaceRect?.bottom ?? window.innerHeight;
        const height = workspaceRect?.height ?? window.innerHeight;
        props.onResize(Math.min(Math.max(bottom - e.clientY, 180), Math.max(180, height - BOARD_STACK_MIN_HEIGHT)));
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
    <aside ref={paneRef} className={`terminal-pane terminal-pane-${props.position}`} style={props.snug ? undefined : props.position === "right" ? { width: props.size } : { height: props.size }}>
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
            <button
              className={`terminal-tab ${tab.id === active.id ? "active" : ""} ${draggingTabId === tab.id ? "dragging" : ""} ${dragOverTabId === tab.id && draggingTabId && draggingTabId !== tab.id ? "drag-over" : ""}`}
              onClick={() => props.onSelect(tab.id)}
              draggable
              onDragStart={(e) => {
                setDraggingTabId(tab.id);
                e.dataTransfer.effectAllowed = "move";
                try { e.dataTransfer.setData("text/plain", tab.id); } catch {}
              }}
              onDragEnter={(e) => { e.preventDefault(); if (draggingTabId && draggingTabId !== tab.id) setDragOverTabId(tab.id); }}
              onDragOver={(e) => { if (draggingTabId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverTabId((id) => id === tab.id ? null : id); }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingTabId && draggingTabId !== tab.id) props.onReorder(draggingTabId, tab.id);
                setDraggingTabId(null);
                setDragOverTabId(null);
              }}
              onDragEnd={() => { setDraggingTabId(null); setDragOverTabId(null); }}
            >
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
      <TerminalView key={active.id} tab={active} onClose={props.onClose} focusKey={props.focusKey} theme={props.theme} terminalThemeName={props.terminalThemeName} glassEnabled={props.glassEnabled} />
    </aside>
  );
}

function TerminalView({ tab, onClose, focusKey, theme, terminalThemeName, glassEnabled }: { tab: TerminalTab; onClose: (id: string) => void; focusKey: number; theme: ThemeMode; terminalThemeName: TerminalThemeName; glassEnabled: boolean }) {
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
      if (termRef.current) termRef.current.options.theme = terminalTheme(theme, terminalThemeName, glassEnabled);
    };
    applyTheme();
    if (theme !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    media?.addEventListener("change", applyTheme);
    return () => media?.removeEventListener("change", applyTheme);
  }, [theme, terminalThemeName, glassEnabled]);

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
    const pasteFilePaths = (dt: DataTransfer | null) => {
      if (!dt) return false;
      const paths = getFilePaths(dt);
      if (paths.length === 0) return false;
      sendData(filePathsAsTerminalPaste(paths));
      return true;
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!pasteFilePaths(event.clipboardData)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDragOver = (event: DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).some((type) => type === "Files" || type === "text/uri-list")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      if (!pasteFilePaths(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      term?.focus();
    };
    const onLinkMouseDown = (event: MouseEvent) => {
      if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey || event.button !== 0 || !term) return;
      const url = terminalLinkAt(term, host, event);
      if (!url) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void (window as ElectronGlobals).electron?.openExternal?.(url);
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
        theme: terminalTheme(theme, terminalThemeName, glassEnabled),
        allowProposedApi: false,
        allowTransparency: true,
        macOptionClickForcesSelection: true,
        rightClickSelectsWord: true,
      });
      termRef.current = term;
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;

        if (event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "w") {
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
        const WebglAddon = glassEnabled ? null : webglMod?.WebglAddon;
        if (WebglAddon) term.loadAddon(new WebglAddon());
      } catch (err) {
        console.warn("[fractal-terminal] webgl renderer unavailable, falling back to DOM", err);
      }
      term.focus();
      host.addEventListener("paste", onPaste);
      host.addEventListener("dragover", onDragOver);
      host.addEventListener("drop", onDrop);
      host.addEventListener("mousedown", onLinkMouseDown, { capture: true });
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
      host.removeEventListener("mousedown", onLinkMouseDown, { capture: true });
      host.removeEventListener("mousedown", onShiftMouseDown, { capture: true });
      ws?.close();
      termRef.current = null;
      osc52?.dispose();
      term?.dispose();
    };
  }, [tab.id, tab.session, tab.cwd, glassEnabled]);

  return <div ref={hostRef} className="terminal-host" />;
}

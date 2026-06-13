import { Plus } from "lucide-react";
import type { TerminalThemeName, ThemeMode } from "~/lib/client/persistence.js";
import type { DecoratedTerminalTab } from "~/lib/client/types.js";
import TerminalPane from "./TerminalPane.js";

export default function AgentView(props: {
  tabs: DecoratedTerminalTab[];
  activeId: string | null;
  terminalPosition: "right" | "bottom";
  terminalWidth: number;
  terminalHeight: number;
  onResizeWidth: (width: number) => void;
  onResizeHeight: (height: number) => void;
  onTogglePosition: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  focusKey: number;
  theme: ThemeMode;
  terminalThemeName: TerminalThemeName;
  glassEnabled: boolean;
  onOpenTerminal: () => void;
  isOpening?: boolean;
}) {
  return (
    <div className="agent-view">
      <div className="topbar agent-topbar">
        <h1 className="topbar-title-row">
          <span className="topbar-title-icon agent-dot" />
          Fractal Agent
        </h1>
        <div className="topbar-spacer" />
        <button
          type="button"
          className="btn sm"
          onClick={props.onOpenTerminal}
          disabled={props.isOpening}
        >
          {props.isOpening ? (
            <span className="btn-spinner" aria-hidden="true" />
          ) : (
            <Plus size={14} />
          )}
          <span>{props.isOpening ? "Opening…" : "New tab"}</span>
        </button>
      </div>
      <div
        className={`workspace workspace-${props.tabs.length > 0 ? props.terminalPosition : "right"}`}
      >
        <TerminalPane
          tabs={props.tabs}
          activeId={props.activeId}
          position={props.terminalPosition}
          size={props.terminalPosition === "right" ? props.terminalWidth : props.terminalHeight}
          snug={false}
          onResize={props.terminalPosition === "right" ? props.onResizeWidth : props.onResizeHeight}
          onTogglePosition={props.onTogglePosition}
          onSelect={props.onSelect}
          onClose={props.onClose}
          onReorder={props.onReorder}
          focusKey={props.focusKey}
          theme={props.theme}
          terminalThemeName={props.terminalThemeName}
          glassEnabled={props.glassEnabled}
        />
      </div>
    </div>
  );
}

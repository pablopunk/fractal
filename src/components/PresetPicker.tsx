import fuzzysort from "fuzzysort";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Portal from "./Portal";
import PresetIcon from "./PresetIcon";

type Preset = {
  id: string;
  name: string;
  binary: string;
  kind: "pi" | "claude" | "opencode" | "custom";
};

type Props = {
  presets: Preset[];
  value: string;
  onChange: (value: string) => void;
  onCreate?: () => void;
  allowClear?: boolean;
};

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;

export default function PresetPicker({ presets, value, onChange, onCreate, allowClear }: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = presets.find((p) => p.id === value);
  const filtered = input.trim()
    ? fuzzysort.go(input.trim(), presets, { key: "name", limit: 50 }).map((r) => r.obj)
    : presets;

  useEffect(() => {
    setHighlight(0);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    if (left + POPUP_WIDTH > window.innerWidth - margin)
      left = window.innerWidth - POPUP_WIDTH - margin;

    const availableBelow = window.innerHeight - rect.bottom - margin - 6;
    const availableAbove = rect.top - margin - 6;
    const maxHeight = Math.min(
      POPUP_MAX_HEIGHT,
      Math.max(160, Math.max(availableBelow, availableAbove)),
    );

    if (availableBelow >= POPUP_MAX_HEIGHT || availableBelow >= availableAbove) {
      setPos({ top: rect.bottom + 6, left, width: POPUP_WIDTH, maxHeight });
    } else {
      setPos({ bottom: window.innerHeight - rect.top + 6, left, width: POPUP_WIDTH, maxHeight });
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(id: string) {
    onChange(id);
    setInput("");
    setOpen(false);
  }

  function create() {
    if (!onCreate) return;
    onCreate();
    setInput("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const offset = (allowClear ? 1 : 0) + (onCreate ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1 + offset, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allowClear && highlight === 0) commit("");
      else if (onCreate && highlight === (allowClear ? 1 : 0)) create();
      else if (filtered[highlight - offset]) commit(filtered[highlight - offset].id);
    }
  }

  return (
    <>
      <div
        ref={triggerRef}
        className="model-picker-trigger preset-picker-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {selected && <PresetIcon preset={selected} size={14} />}
        <span className="model-picker-value">{selected?.name ?? "Select preset"}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {open && pos && (
        <Portal>
          <div ref={popupRef} className="model-picker-popup" style={pos}>
            <div className="model-picker-search">
              <input
                ref={inputRef}
                className="model-picker-input"
                placeholder="Search presets…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={false}
              />
            </div>
            <div className="model-picker-items">
              {allowClear && (
                <div
                  className={`picker-item ${highlight === 0 ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit("");
                  }}
                  onMouseEnter={() => setHighlight(0)}
                >
                  <span className="picker-name" style={{ fontStyle: "italic" }}>
                    Use global default
                  </span>
                </div>
              )}
              {onCreate && (
                <div
                  className={`picker-item ${highlight === (allowClear ? 1 : 0) ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    create();
                  }}
                  onMouseEnter={() => setHighlight(allowClear ? 1 : 0)}
                >
                  <span className="picker-name">+ Create preset</span>
                </div>
              )}
              {filtered.map((preset, i) => {
                const offset = (allowClear ? 1 : 0) + (onCreate ? 1 : 0);
                return (
                  <div
                    key={preset.id}
                    className={`picker-item ${i + offset === highlight ? "active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(preset.id);
                    }}
                    onMouseEnter={() => setHighlight(i + offset)}
                  >
                    <PresetIcon preset={preset} size={14} />
                    <span className="picker-name">{preset.name}</span>
                    <span className="picker-path">{preset.binary}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import fuzzysort from "fuzzysort";

type Preset = { id: string; name: string; binary: string };

type Props = {
  presets: Preset[];
  value: string;
  onChange: (value: string) => void;
  onCreate?: () => void;
};

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;

export default function PresetPicker({ presets, value, onChange, onCreate }: Props) {
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

  useEffect(() => { setHighlight(0); }, [input]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    if (left + POPUP_WIDTH > window.innerWidth - margin) left = window.innerWidth - POPUP_WIDTH - margin;

    const availableBelow = window.innerHeight - rect.bottom - margin - 6;
    const availableAbove = rect.top - margin - 6;
    const maxHeight = Math.min(POPUP_MAX_HEIGHT, Math.max(160, Math.max(availableBelow, availableAbove)));

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
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
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
    const offset = onCreate ? 1 : 0;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(filtered.length - 1 + offset, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (onCreate && highlight === 0) create();
      else if (filtered[highlight - offset]) commit(filtered[highlight - offset].id);
    }
  }

  return (
    <>
      <div ref={triggerRef} className="model-picker-trigger preset-picker-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="model-picker-value">{selected?.name ?? "Select preset"}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && pos && (
        <div ref={popupRef} className="model-picker-popup" style={pos}>
          <div className="model-picker-search">
            <input ref={inputRef} className="model-picker-input" placeholder="Search presets…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} spellCheck={false} />
          </div>
          <div className="model-picker-items">
            {onCreate && (
              <div className={`picker-item ${highlight === 0 ? "active" : ""}`} onMouseDown={(e) => { e.preventDefault(); create(); }} onMouseEnter={() => setHighlight(0)}>
                <span className="picker-name">+ Create preset</span>
              </div>
            )}
            {filtered.map((preset, i) => (
              <div key={preset.id} className={`picker-item ${i + (onCreate ? 1 : 0) === highlight ? "active" : ""}`} onMouseDown={(e) => { e.preventDefault(); commit(preset.id); }} onMouseEnter={() => setHighlight(i + (onCreate ? 1 : 0))}>
                <span className="picker-name">{preset.name}</span>
                <span className="picker-path">{preset.binary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

import fuzzysort from "fuzzysort";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Portal from "./Portal";

type PiModel = { id: string; provider: string; model: string };

type Props = {
  models: PiModel[];
  value: string;
  onChange: (value: string) => void;
  defaultLabel?: string;
  searchPlaceholder?: string;
};

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;

export default function ModelPicker({
  models,
  value,
  onChange,
  defaultLabel = "default",
  searchPlaceholder = "Search models…",
}: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = input.trim()
    ? fuzzysort.go(input.trim(), models, { key: "id", limit: 50 }).map((r) => r.obj)
    : models;

  useEffect(() => {
    setHighlight(0);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    let left = rect.right - POPUP_WIDTH;
    if (left < margin) left = margin;
    if (left + POPUP_WIDTH > window.innerWidth - margin)
      left = window.innerWidth - POPUP_WIDTH - margin;
    let top = rect.bottom + 6;
    if (top + POPUP_MAX_HEIGHT > window.innerHeight - margin) top = rect.top - POPUP_MAX_HEIGHT - 6;
    setPos({ top, left });
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

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight === 0) commit("");
      else if (filtered[highlight - 1]) commit(filtered[highlight - 1].id);
    }
  }

  return (
    <>
      <div ref={triggerRef} className="model-picker-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="model-picker-value">{value || defaultLabel}</span>
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
          <div
            ref={popupRef}
            className="model-picker-popup"
            style={{
              top: pos.top,
              left: pos.left,
              width: POPUP_WIDTH,
              maxHeight: POPUP_MAX_HEIGHT,
            }}
          >
            <div className="model-picker-search">
              <input
                ref={inputRef}
                className="model-picker-input"
                placeholder={searchPlaceholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={false}
              />
            </div>
            <div className="model-picker-items">
              <div
                className={`picker-item ${highlight === 0 ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit("");
                }}
                onMouseEnter={() => setHighlight(0)}
              >
                <span className="picker-name">{defaultLabel}</span>
              </div>
              {filtered.map((m, i) => (
                <div
                  key={m.id}
                  className={`picker-item ${i + 1 === highlight ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(m.id);
                  }}
                  onMouseEnter={() => setHighlight(i + 1)}
                >
                  <span className="picker-name">{m.model}</span>
                  <span className="picker-path">{m.provider}</span>
                </div>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

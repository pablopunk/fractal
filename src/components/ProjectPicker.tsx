import { useEffect, useMemo, useRef, useState } from "react";
import fuzzysort from "fuzzysort";

type Suggestion = { name: string; absolute: string; root: string };
type Item = {
  absolute: string;
  name: string;
  parent: string; // tildeified parent for display
  group: "recent" | "folders" | "manual";
};

type Project = { id: string; name: string; path: string };

export type ProjectPickerProps = {
  recentProjects: Project[];
  onSelect: (absolutePath: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  openUpward?: boolean;
};

/**
 * Combobox-style project picker. Suggestions are loaded from a fixed set of
 * roots configured on the server (default: ~/src and ~/src/maze) and fuzzy
 * filtered by the input. Already-added projects appear on top.
 *
 * Free-form paths are also supported, so repos outside the suggestion roots
 * (e.g. ~/.pi) can still be added directly.
 */
export default function ProjectPicker(props: ProjectPickerProps) {
  const [input, setInput] = useState("");
  const [home, setHome] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (props.autoFocus) inputRef.current?.focus();
  }, [props.autoFocus]);

  useEffect(() => {
    fetch("/api/fs/suggestions")
      .then((r) => r.json())
      .then((d: { home: string; entries: Suggestion[] }) => {
        setHome(d.home ?? "");
        setSuggestions(d.entries ?? []);
      })
      .catch(() => setSuggestions([]));
  }, []);

  const items: Item[] = useMemo(() => {
    const q = input.trim();
    const recent: Item[] = props.recentProjects.map((p) => ({
      absolute: p.path,
      name: p.name || basename(p.path),
      parent: tildeify(parentOf(p.path), home),
      group: "recent",
    }));
    const folders: Item[] = suggestions.map((s) => ({
      absolute: s.absolute,
      name: s.name,
      parent: tildeify(s.root, home),
      group: "folders",
    }));
    const recentFiltered = q
      ? fuzzysort.go(q, recent, { keys: ["name", "absolute"], limit: 5 }).map((r) => r.obj)
      : recent.slice(0, 5);
    const folderFiltered = q
      ? fuzzysort.go(q, folders, { keys: ["name", "absolute"], limit: 50 }).map((r) => r.obj)
      : folders.slice(0, 50);

    const out = [...recentFiltered, ...folderFiltered];
    if (q) {
      const normalized = normalizeInputPath(q, home);
      const alreadyListed = out.some((item) => item.absolute === normalized);
      if (!alreadyListed) {
        out.unshift({
          absolute: normalized,
          name: basename(normalized),
          parent: `Add ${tildeify(parentOf(normalized), home)}`,
          group: "manual",
        });
      }
    }
    return out;
  }, [suggestions, input, props.recentProjects, home]);

  useEffect(() => {
    setHighlight((h) => Math.min(Math.max(0, h), Math.max(items.length - 1, 0)));
  }, [items.length]);

  function commit(absolute: string) {
    props.onSelect(absolute);
    setInput("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[highlight];
      if (item) commit(item.absolute);
      else if (input.trim()) commit(normalizeInputPath(input, home));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // group rendering with running index for highlight
  const recent = items.filter((i) => i.group === "recent");
  const folders = items.filter((i) => i.group === "folders");
  const groups: { id: Item["group"]; title: string; items: Item[] }[] = [];
  const manual = items.filter((i) => i.group === "manual");
  if (manual.length) groups.push({ id: "manual", title: "Add by path", items: manual });
  if (recent.length) groups.push({ id: "recent", title: "Recent", items: recent });
  if (folders.length) groups.push({ id: "folders", title: "Projects", items: folders });

  let runningIndex = 0;

  return (
    <div className={`picker ${props.openUpward ? "up" : ""}`}>
      <input
        ref={inputRef}
        className="input"
        placeholder={props.placeholder ?? "search projects…"}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {open && items.length > 0 && (
        <div className="picker-list" role="listbox">
          {groups.map((g) => (
            <div key={g.id} className="picker-group">
              <div className="picker-group-title">{g.title}</div>
              {g.items.map((item) => {
                const idx = runningIndex++;
                const active = idx === highlight;
                return (
                  <div
                    key={item.group + ":" + item.absolute}
                    className={`picker-item ${active ? "active" : ""}`}
                    role="option"
                    aria-selected={active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(item.absolute);
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <span className="picker-name">{item.name}</span>
                    <span className="picker-path">{item.parent}/</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function tildeify(abs: string, home: string): string {
  if (!home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  if (i <= 0) return "/";
  return p.slice(0, i);
}

function normalizeInputPath(input: string, home: string): string {
  const v = input.trim();
  if (!v) return v;
  if (v === "~") return home || v;
  if (v.startsWith("~/") && home) return home + v.slice(1);
  if (v.startsWith("/")) return v;
  if (home) return home + "/" + v;
  return v;
}

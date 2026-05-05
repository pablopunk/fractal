import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ProjectPicker from "./ProjectPicker.js";

type Column = "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE";

type Project = { id: string; name: string; path: string };
type Prompt = {
  id: string;
  projectId: string;
  text: string;
  column: Column;
  runMode?: "in_place" | "worktree" | null;
  branch?: string | null;
  worktreePath?: string | null;
  tmuxSession?: string | null;
  error?: string | null;
  launchedAt?: number | null;
};

const COLUMNS: { id: Column; title: string }[] = [
  { id: "PROMPTS", title: "Prompts" },
  { id: "RUN_IN_PLACE", title: "Run in place" },
  { id: "RUN_IN_WORKTREE", title: "Run in worktree" },
];

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

function getProjectIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("project");
}

export default function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [home, setHome] = useState<string>("");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showSidebarPicker, setShowSidebarPicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeProjectId) {
      url.searchParams.set("project", activeProjectId);
    } else {
      url.searchParams.delete("project");
    }
    window.history.replaceState({}, "", url.toString());
  }, [activeProjectId]);

  useEffect(() => {
    const platform = (window as typeof window & { electron?: { platform?: string } }).electron?.platform;
    if (platform === "darwin") document.documentElement.classList.add("macos");
  }, []);

  async function refresh() {
    try {
      const data = await api<{ home: string; projects: Project[]; prompts: Prompt[] }>("/api/state");
      setProjects(data.projects);
      setPrompts(data.prompts);
      setHome(data.home ?? "");
      setActiveProjectId((cur) => {
        const urlId = getProjectIdFromUrl();
        if (urlId && data.projects.some((p) => p.id === urlId)) {
          return urlId;
        }
        return cur ?? data.projects[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addProject(path: string) {
    if (!path) return;
    try {
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      setProjects((p) => (p.find((x) => x.id === project.id) ? p : [...p, project]));
      setActiveProjectId(project.id);
      setShowSidebarPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeProject(id: string) {
    if (!confirm("Remove this project from Fractal?")) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== id));
      setPrompts((p) => p.filter((x) => x.projectId !== id));
      if (activeProjectId === id) setActiveProjectId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addPrompt() {
    const text = composer.trim();
    if (!text || !activeProjectId) return;
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/projects/${activeProjectId}/prompts`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setPrompts((p) => [...p, prompt]);
      setComposer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deletePrompt(id: string) {
    try {
      await api(`/api/prompts/${id}`, { method: "DELETE" });
      setPrompts((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function editPrompt(id: string, text: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ text }),
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function launch(id: string, target: Column) {
    if (target === "PROMPTS") return;
    const url = target === "RUN_IN_PLACE" ? `/api/prompts/${id}/run-in-place` : `/api/prompts/${id}/run-in-worktree`;
    const prev = prompts;
    setPrompts((p) => p.map((x) => (x.id === id ? { ...x, column: target } : x)));
    try {
      const { prompt } = await api<{ prompt: Prompt }>(url, { method: "POST" });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      setPrompts(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const [overId, setOverId] = useState<string | null>(null);
  function onDragStart(e: DragStartEvent) { setActiveDragId(String(e.active.id)); }
  function onDragOver(e: { active: { id: string | number }; over: { id: string | number } | null }) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function onDragEnd(e: DragEndEvent) {
    setOverId(null);
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const activePrompt = prompts.find((p) => p.id === activeId);
    if (!activePrompt) return;

    const overId = String(over.id);
    const overPrompt = prompts.find((p) => p.id === overId);

    if (overPrompt) {
      if (activePrompt.column === overPrompt.column) {
        // Reordering within the same column (UI only)
        const colPrompts = projectPrompts.filter((p) => p.column === activePrompt.column);
        const oldIndex = colPrompts.findIndex((p) => p.id === activeId);
        const newIndex = colPrompts.findIndex((p) => p.id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(colPrompts, oldIndex, newIndex);
          setPrompts((prev) => {
            const others = prev.filter((p) => p.column !== activePrompt.column || p.projectId !== activeProjectId);
            return [...others, ...reordered];
          });
        }
        return;
      }
      // Dropped on a card in a different column → treat as drop on that column
      const target = overPrompt.column;
      if (activePrompt.column !== target && activePrompt.column === "PROMPTS") {
        void launch(activeId, target);
      }
      return;
    }

    // Dropped on a column
    const target = overId as Column;
    if (activePrompt.column === target) return;
    if (activePrompt.column !== "PROMPTS") return; // V1: only launch from backlog
    void launch(activeId, target);
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId),
    [prompts, activeProjectId],
  );
  const dragging = activeDragId ? prompts.find((p) => p.id === activeDragId) : null;

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        activeId={activeProjectId}
        onSelect={(id) => setActiveProjectId(id)}
        onRemove={removeProject}
        onAdd={addProject}
        showPicker={showSidebarPicker}
        setShowPicker={setShowSidebarPicker}
        home={home}
      />
      <main className="main">
        {error && (
          <div className="error-banner" onClick={() => setError(null)} role="alert">
            {error} · click to dismiss
          </div>
        )}

        {!activeProject ? (
          <EmptyState projects={projects} onAdd={addProject} />
        ) : (
          <>
            <div className="topbar">
              <div className="topbar-title">
                <h1>{activeProject.name}</h1>
                <span className="path" title={activeProject.path}>{tildeify(activeProject.path, home)}</span>
              </div>
              <div className="topbar-spacer" />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
              <div className="board">
                {COLUMNS.map((col) => (
                  <ColumnView
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    prompts={projectPrompts.filter((p) => p.column === col.id)}
                    onDelete={deletePrompt}
                    onEdit={editPrompt}
                    home={home}
                    activeId={activeDragId}
                    overId={overId}
                    composer={
                      col.id === "PROMPTS" ? (
                        <Composer
                          value={composer}
                          onChange={setComposer}
                          onSubmit={addPrompt}
                        />
                      ) : null
                    }
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {dragging ? <div className="overlay-card">{truncate(dragging.text, 140)}</div> : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </main>
    </div>
  );
}

// ---------- Components ----------

function Sidebar(props: {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (path: string) => void;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
  home: string;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand-dot" />
        <span className="sidebar-brand">Fractal</span>
      </div>
      <div className="sidebar-section">Projects</div>
      <div className="project-list">
        {props.projects.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-faint)" }}>
            No projects yet.
          </div>
        )}
        {props.projects.map((p) => (
          <div
            key={p.id}
            className={`project-item ${p.id === props.activeId ? "active" : ""}`}
            onClick={() => props.onSelect(p.id)}
            title={tildeify(p.path, props.home)}
          >
            <ProjectIcon path={p.path} active={p.id === props.activeId} />
            <span className="name">{p.name}</span>
            <button
              className="remove"
              onClick={(e) => {
                e.stopPropagation();
                props.onRemove(p.id);
              }}
              aria-label="Remove project"
              title="Remove project"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        {props.showPicker ? (
          <div>
            <ProjectPicker
              recentProjects={props.projects}
              onSelect={props.onAdd}
              autoFocus
              openUpward
              placeholder="search projects…"
            />
            <button className="btn ghost block sm" style={{ marginTop: 6 }} onClick={() => props.setShowPicker(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn block" onClick={() => props.setShowPicker(true)}>
            + Add project
          </button>
        )}
      </div>
    </aside>
  );
}

function ProjectIcon({ path, active }: { path: string; active?: boolean }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const src = `/api/project-favicon?cwd=${encodeURIComponent(path)}`;

  return (
    <>
      {status !== "loaded" && (
        <span className={`project-icon-placeholder ${active ? "active" : ""}`} />
      )}
      <img
        src={src}
        alt=""
        className={`project-icon ${active ? "active" : ""} ${status === "loaded" ? "" : "hidden"}`}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </>
  );
}

function EmptyState(props: { projects: Project[]; onAdd: (path: string) => void }) {
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>Add your first project</h1>
        <p>Pick a git repo from <code style={{ fontFamily: "var(--font-mono)" }}>~/src</code> or <code style={{ fontFamily: "var(--font-mono)" }}>~/src/maze</code> to start a board.</p>
        <ProjectPicker
          recentProjects={props.projects}
          onSelect={props.onAdd}
          autoFocus
          placeholder="search projects…"
        />
      </div>
    </div>
  );
}

function ColumnView(props: {
  id: Column;
  title: string;
  prompts: Prompt[];
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  composer: React.ReactNode;
  home: string;
  activeId?: string | null;
  overId?: string | null;
}) {
  const { setNodeRef } = useDroppable({ id: props.id });
  const itemIds = props.prompts.map((p) => p.id);
  const dragIndex = props.activeId ? itemIds.indexOf(props.activeId) : -1;
  const overIndex = props.overId ? itemIds.indexOf(props.overId) : -1;
  const isOverColumn = props.overId === props.id || itemIds.includes(props.overId ?? "");
  const showIndicator = props.activeId && dragIndex === -1 && isOverColumn;
  return (
    <div className={`column ${isOverColumn ? "drop-active" : ""}`}>
      <div className="column-head">
        <span className="column-title">{props.title}</span>
        <span className="count-chip">{props.prompts.length}</span>
      </div>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-body">
          {props.prompts.length === 0 && (
            <div style={{ padding: "10px 4px", fontSize: 12, color: "var(--text-faint)" }}>
              {props.id === "PROMPTS" ? "Add a prompt below." : "Drop a prompt here."}
            </div>
          )}
          {props.prompts.map((p, i) => (
            <div key={p.id}>
              {showIndicator && overIndex === i && <div className="drop-indicator" />}
              <Card prompt={p} onDelete={props.onDelete} onEdit={props.onEdit} home={props.home} />
            </div>
          ))}
          {showIndicator && (overIndex === -1 || overIndex >= itemIds.length) && <div className="drop-indicator" />}
        </div>
      </SortableContext>
      {props.composer}
    </div>
  );
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

function quoteIfNeeded(p: string): string {
  return /\s/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p;
}

function getDroppedImagePaths(dt: DataTransfer): string[] {
  const electron = (window as typeof window & {
    electron?: { getPathForFile?: (file: File) => string };
  }).electron;

  const fromElectron = Array.from(dt.files)
    .filter((file) => file.type.startsWith("image/") || IMAGE_RE.test(file.name))
    .map((file) => electron?.getPathForFile?.(file) ?? "")
    .filter(Boolean);

  if (fromElectron.length > 0) return fromElectron;

  const uriList = dt.getData("text/uri-list");
  if (!uriList) return [];
  return uriList
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

function Composer(props: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);

    const paths = getDroppedImagePaths(e.dataTransfer);
    if (paths.length === 0) return;

    const ta = textareaRef.current;
    const insert = paths.map(quoteIfNeeded).join(" ");
    const start = ta?.selectionStart ?? props.value.length;
    const end = ta?.selectionEnd ?? props.value.length;
    const needsLeadingSpace = start > 0 && !/\s$/.test(props.value.slice(0, start));
    const chunk = (needsLeadingSpace ? " " : "") + insert + " ";
    const next = props.value.slice(0, start) + chunk + props.value.slice(end);
    props.onChange(next);

    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      const pos = start + chunk.length;
      t.focus();
      t.setSelectionRange(pos, pos);
    });
  }

  function onDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }

  return (
    <div
      className={`composer ${dragOver ? "drag-over" : ""}`}
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <textarea
        ref={textareaRef}
        className="input"
        placeholder="Describe a task for pi…"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            props.onSubmit();
          }
        }}
      />
      <div className="composer-actions">
        <span className="hint">{dragOver ? "drop image to insert path" : "⇧↵ for newline · drop image to attach"}</span>
        <div style={{ flex: 1 }} />
        <button className="btn primary sm" onClick={props.onSubmit} disabled={!props.value.trim()}>
          Add prompt
        </button>
      </div>
    </div>
  );
}

function Card({ prompt, onDelete, onEdit, home }: { prompt: Prompt; onDelete: (id: string) => void; onEdit: (id: string, text: string) => void; home: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(prompt.text);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prompt.id, disabled: isEditing });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isLaunched = !!prompt.launchedAt;

  if (isEditing) {
    return (
      <div className="card">
        <textarea
          className="input"
          style={{ minHeight: 64, resize: "none", fontFamily: "var(--font-sans)", fontSize: 13 }}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              onEdit(prompt.id, editText);
              setIsEditing(false);
            }
            if (e.key === "Escape") {
              setIsEditing(false);
              setEditText(prompt.text);
            }
          }}
          autoFocus
        />
        <div className="card-actions" style={{ opacity: 1 }}>
          <span className="hint" style={{ color: "var(--text-faint)", fontSize: 11, fontFamily: "var(--font-mono)" }}>↵ to save · shift+↵ for newline · esc to cancel</span>
          <div style={{ flex: 1 }} />
          <button
            className="btn ghost sm"
            onClick={() => { setIsEditing(false); setEditText(prompt.text); }}
          >
            Cancel
          </button>
          <button
            className="btn primary sm"
            onClick={() => { onEdit(prompt.id, editText); setIsEditing(false); }}
            disabled={!editText.trim()}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`card ${isDragging ? "dragging" : ""}`}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="text">{prompt.text}</div>
      {(prompt.branch || prompt.tmuxSession || prompt.worktreePath || isLaunched) && (
        <div className="card-meta">
          {isLaunched && <span className="tag accent">running</span>}
          {prompt.branch && <span className="tag" title={prompt.branch}>{prompt.branch}</span>}
          {prompt.tmuxSession && <span className="tag" title={`tmux: ${prompt.tmuxSession}`}>tmux: {prompt.tmuxSession}</span>}
          {prompt.worktreePath && <span className="tag" title={prompt.worktreePath}>wt: {trimMid(tildeify(prompt.worktreePath, home), 28)}</span>}
        </div>
      )}
      {prompt.error && <span className="tag error">{prompt.error}</span>}
      <div className="card-actions">
        <button
          className="icon-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setEditText(prompt.text);
            setIsEditing(true);
          }}
          title="Edit prompt"
        >
          edit
        </button>
        {prompt.tmuxSession && (
          <button
            className="icon-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(`tmux attach -t ${prompt.tmuxSession}`);
            }}
            title="Copy tmux attach command"
          >
            copy attach
          </button>
        )}
        <button
          className="icon-btn danger"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(prompt.id);
          }}
          title="Delete prompt"
        >
          delete
        </button>
      </div>
    </div>
  );
}

function trimMid(s: string, n = 28): string {
  return s.length > n ? "…" + s.slice(-n) : s;
}
function tildeify(abs: string, home: string): string {
  if (!abs || !home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// CSS for drop indicator added to global.css
// .drop-indicator { height: 3px; background: var(--accent); border-radius: 2px; margin: 4px 0; }

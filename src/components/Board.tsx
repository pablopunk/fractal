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
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
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
  isArchived?: boolean | null;
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

export default function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showSidebarPicker, setShowSidebarPicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    void refresh();
    // Run health check on mount
    void api("/api/health-check", { method: "POST" }).catch(() => {});
    // Then every 30 seconds
    const interval = setInterval(() => {
      void api("/api/health-check", { method: "POST" }).catch(() => {});
      void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function refresh() {
    try {
      const data = await api<{ projects: Project[]; prompts: Prompt[] }>("/api/state");
      setProjects(data.projects);
      setPrompts(data.prompts);
      setActiveProjectId((cur) => cur ?? data.projects[0]?.id ?? null);
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

  async function archivePrompt(id: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, { method: "POST" });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function unarchivePrompt(id: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, { method: "DELETE" });
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

  function onDragStart(e: DragStartEvent) { setActiveDragId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const target = over.id as Column;
    const id = String(active.id);
    const prompt = prompts.find((p) => p.id === id);
    if (!prompt || prompt.column === target) return;
    if (prompt.column !== "PROMPTS") return; // V1: only launch from backlog
    void launch(id, target);
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId && !p.isArchived),
    [prompts, activeProjectId],
  );
  const archivedPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId && p.isArchived),
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
                <span className="path">{activeProject.path}</span>
              </div>
              <div className="topbar-spacer" />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div className="board">
                {COLUMNS.map((col) => (
                  <ColumnView
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    prompts={projectPrompts.filter((p) => p.column === col.id)}
                    onDelete={deletePrompt}
                    onArchive={archivePrompt}
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

            {archivedPrompts.length > 0 && (
              <div className="archived-section">
                <button
                  className="archived-toggle"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  {showArchived ? "▼" : "▶"} Archived ({archivedPrompts.length})
                </button>
                {showArchived && (
                  <div className="archived-list">
                    {archivedPrompts.map((p) => (
                      <div key={p.id} className="archived-item">
                        <div className="archived-text">{p.text}</div>
                        <button
                          className="icon-btn sm"
                          onClick={() => unarchivePrompt(p.id)}
                          title="Restore archived prompt"
                        >
                          restore
                        </button>
                        <button
                          className="icon-btn danger sm"
                          onClick={() => deletePrompt(p.id)}
                          title="Delete archived prompt permanently"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            title={p.path}
          >
            <span className="dot" />
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
  onArchive: (id: string) => void;
  composer: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });
  return (
    <div className={`column ${isOver ? "drop-active" : ""}`}>
      <div className="column-head">
        <span className="column-title">{props.title}</span>
        <span className="count-chip">{props.prompts.length}</span>
      </div>
      <div ref={setNodeRef} className="column-body">
        {props.prompts.length === 0 && (
          <div style={{ padding: "10px 4px", fontSize: 12, color: "var(--text-faint)" }}>
            {props.id === "PROMPTS" ? "Add a prompt below." : "Drop a prompt here."}
          </div>
        )}
        {props.prompts.map((p) => (
          <Card key={p.id} prompt={p} onDelete={props.onDelete} onArchive={props.onArchive} />
        ))}
      </div>
      {props.composer}
    </div>
  );
}

function Composer(props: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="composer">
      <textarea
        className="input"
        placeholder="Describe a task for pi…"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") props.onSubmit();
        }}
      />
      <div className="composer-actions">
        <span className="hint">⌘↵ to add</span>
        <div style={{ flex: 1 }} />
        <button className="btn primary sm" onClick={props.onSubmit} disabled={!props.value.trim()}>
          Add prompt
        </button>
      </div>
    </div>
  );
}

function Card({ prompt, onDelete, onArchive }: { prompt: Prompt; onDelete: (id: string) => void; onArchive: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: prompt.id });
  const isLaunched = !!prompt.launchedAt;
  return (
    <div ref={setNodeRef} className={`card ${isDragging ? "dragging" : ""}`} {...attributes} {...listeners}>
      <div className="text">{prompt.text}</div>
      {(prompt.branch || prompt.tmuxSession || prompt.worktreePath || isLaunched) && (
        <div className="card-meta">
          {isLaunched && <span className="tag accent">running</span>}
          {prompt.branch && <span className="tag" title={prompt.branch}>{prompt.branch}</span>}
          {prompt.tmuxSession && <span className="tag" title={`tmux: ${prompt.tmuxSession}`}>tmux: {prompt.tmuxSession}</span>}
          {prompt.worktreePath && <span className="tag" title={prompt.worktreePath}>wt: {trimMid(prompt.worktreePath, 28)}</span>}
        </div>
      )}
      {prompt.error && <span className="tag error">{prompt.error}</span>}
      <div className="card-actions">
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
          className="icon-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onArchive(prompt.id);
          }}
          title="Archive prompt"
        >
          archive
        </button>
        <button
          className="icon-btn danger"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(prompt.id);
          }}
          title="Delete prompt and cleanup resources"
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
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

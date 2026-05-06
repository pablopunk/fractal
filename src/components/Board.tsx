import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
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
import {
  Brain,
  Check,
  ChevronLeft,
  Copy,
  FolderKanban,
  FolderRoot,
  Pencil,
  Play,
  Plus,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import ProjectPicker from "./ProjectPicker.js";
import ModelPicker from "./ModelPicker.js";

type Column = "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE" | "ARCHIVED";

type Project = { id: string; name: string; path: string };
type ModelProfile = "fast" | "smart";
type Prompt = {
  id: string;
  projectId: string;
  text: string;
  modelProfile: ModelProfile;
  column: Column;
  runMode?: "in_place" | "worktree" | null;
  branch?: string | null;
  worktreePath?: string | null;
  tmuxSession?: string | null;
  error?: string | null;
  isArchived?: boolean | null;
  launchedAt?: number | null;
};
type AppSettings = { fastModel: string; smartModel: string };
type PiModel = { id: string; provider: string; model: string };

const COLUMNS: { id: Column; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "PROMPTS", title: "Prompts", icon: FolderRoot },
  { id: "RUN_IN_PLACE", title: "Run in place", icon: Play },
  { id: "RUN_IN_WORKTREE", title: "Run in worktree", icon: FolderKanban },
  { id: "ARCHIVED", title: "DONE", icon: Check },
];

const COLLAPSED_KEY = "fractal:collapsedColumns";
const columnAwareCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function loadCollapsed(): Record<Column, boolean> {
  const def = { PROMPTS: false, RUN_IN_PLACE: false, RUN_IN_WORKTREE: false, ARCHIVED: true } as Record<Column, boolean>;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(COLLAPSED_KEY) : null;
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch { return def; }
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `HTTP ${res.status}`, json);
  return json as T;
}

function getProjectIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("project");
}

export default function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [home, setHome] = useState<string>("");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => getProjectIdFromUrl());
  const [composer, setComposer] = useState("");
  const [composerModelProfile, setComposerModelProfile] = useState<ModelProfile>("smart");
  const [settings, setSettings] = useState<AppSettings>({ fastModel: "", smartModel: "" });
  const [models, setModels] = useState<PiModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showSidebarPicker, setShowSidebarPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<Column, boolean>>(() => loadCollapsed());
  const [pendingDeletePromptId, setPendingDeletePromptId] = useState<string | null>(null);
  const [pendingDeleteChanges, setPendingDeleteChanges] = useState<string[] | null>(null);
  const [archiveBlockedMessage, setArchiveBlockedMessage] = useState<string | null>(null);

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
    const onPopState = () => setActiveProjectId(getProjectIdFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const platform = (window as typeof window & { electron?: { platform?: string } }).electron?.platform;
    if (platform === "darwin") document.documentElement.classList.add("macos");
  }, []);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  function toggleCollapse(id: Column) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  async function refresh() {
    try {
      const data = await api<{ home: string; projects: Project[]; prompts: Prompt[]; settings: AppSettings }>("/api/state");
      setProjects(data.projects);
      setPrompts(data.prompts);
      setSettings(data.settings ?? { fastModel: "", smartModel: "" });
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
        body: JSON.stringify({ text, modelProfile: composerModelProfile }),
      });
      setPrompts((p) => [...p, prompt]);
      setComposer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deletePrompt(id: string, force = false) {
    try {
      const res = await fetch(`/api/prompts/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string; hasUncommitted?: boolean; changes?: string[] };

      if (!res.ok) {
        // If 409 Conflict, show confirmation dialog
        if (res.status === 409 && json.hasUncommitted) {
          setPendingDeletePromptId(id);
          setPendingDeleteChanges(json.changes ?? []);
          return;
        }
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setPrompts((p) => p.filter((x) => x.id !== id));
      setPendingDeletePromptId(null);
      setPendingDeleteChanges(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function editPrompt(id: string, patch: { text?: string; modelProfile?: ModelProfile }) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function archivePrompt(id: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, { method: "POST" });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { detail?: string } | undefined;
        setArchiveBlockedMessage(body?.detail ?? e.message);
        return;
      }
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
      // archived <-> non-archived via card target
      if (overPrompt.isArchived && !activePrompt.isArchived) {
        void archivePrompt(activeId);
        return;
      }
      if (!overPrompt.isArchived && activePrompt.isArchived) {
        void unarchivePrompt(activeId);
        return;
      }
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
    if (target === "ARCHIVED") {
      if (!activePrompt.isArchived) void archivePrompt(activeId);
      return;
    }
    if (activePrompt.isArchived) {
      void unarchivePrompt(activeId);
      return;
    }
    if (activePrompt.column === target) return;
    if (activePrompt.column !== "PROMPTS") return; // V1: only launch from backlog
    void launch(activeId, target);
  }

  async function saveSettings(patch: Partial<AppSettings>) {
    try {
      const { settings: next } = await api<{ settings: AppSettings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void api<{ models: PiModel[] }>("/api/models")
      .then((data) => setModels(data.models ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

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
              <div className="model-tabs">
                <div className="model-tab">
                  <span className="model-tab-label"><Zap size={11} /> Fast</span>
                  <ModelPicker models={models} value={settings.fastModel} onChange={(v) => void saveSettings({ fastModel: v })} />
                </div>
                <div className="model-tab">
                  <span className="model-tab-label"><Brain size={11} /> Smart</span>
                  <ModelPicker models={models} value={settings.smartModel} onChange={(v) => void saveSettings({ smartModel: v })} />
                </div>
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={columnAwareCollisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
              <div className="board">
                {COLUMNS.map((col) => {
                  const colPrompts = col.id === "ARCHIVED"
                    ? archivedPrompts
                    : projectPrompts.filter((p) => p.column === col.id);
                  return (
                    <ColumnView
                      key={col.id}
                      id={col.id}
                      title={col.title}
                      icon={col.icon}
                      prompts={colPrompts}
                      onDelete={deletePrompt}
                      onEdit={editPrompt}
                      onArchive={archivePrompt}
                      onUnarchive={unarchivePrompt}
                      home={home}
                      activeId={activeDragId}
                      overId={overId}
                      collapsed={!!collapsed[col.id]}
                      onToggleCollapse={() => toggleCollapse(col.id)}
                      isArchivedCol={col.id === "ARCHIVED"}
                      composer={
                        col.id === "PROMPTS" ? (
                          <Composer
                            value={composer}
                            onChange={setComposer}
                            onSubmit={addPrompt}
                            modelProfile={composerModelProfile}
                            onModelProfileChange={setComposerModelProfile}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </div>
              <DragOverlay dropAnimation={null}>
                {dragging ? <div className="overlay-card">{truncate(dragging.text, 140)}</div> : null}
              </DragOverlay>
            </DndContext>

            {/* Confirm deletion with uncommitted changes */}
            {pendingDeletePromptId && pendingDeleteChanges && (
              <div className="modal-overlay" onClick={() => { setPendingDeletePromptId(null); setPendingDeleteChanges(null); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h2>Confirm deletion</h2>
                  <p>This worktree has uncommitted changes:</p>
                  <div className="changes-list" style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 4,
                    padding: 8,
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    marginBottom: 16,
                  }}>
                    {pendingDeleteChanges.map((line, i) => (
                      <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</div>
                    ))}
                  </div>
                  <p style={{ color: "var(--text-faint)", fontSize: 12 }}>Are you sure you want to delete this prompt and discard these changes?</p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn ghost" onClick={() => { setPendingDeletePromptId(null); setPendingDeleteChanges(null); }}>Cancel</button>
                    <button className="btn danger" onClick={() => void deletePrompt(pendingDeletePromptId, true)}>Delete & Discard Changes</button>
                  </div>
                </div>
              </div>
            )}

            {archiveBlockedMessage && (
              <div className="modal-overlay" onClick={() => setArchiveBlockedMessage(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h2>Can't mark this worktree as done yet</h2>
                  <p>{archiveBlockedMessage}</p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => setArchiveBlockedMessage(null)}>OK</button>
                  </div>
                </div>
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
            <ProjectIcon name={p.name} path={p.path} active={p.id === props.activeId} />
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
              placeholder="search projects or paste a path…"
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

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function ProjectIcon({ name, path, active }: { name: string; path: string; active?: boolean }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const src = `/api/project-favicon?cwd=${encodeURIComponent(path)}`;
  const fallback = useMemo(() => {
    const label = (name || path.split("/").filter(Boolean).at(-1) || "?").replace(/^[._-]+/, "").charAt(0).toUpperCase() || "?";
    const hue = hashString(path || name) % 360;
    return {
      label,
      style: {
        ["--project-hue" as string]: String(hue),
      } as CSSProperties,
    };
  }, [name, path]);

  return (
    <>
      {status !== "loaded" && (
        <span className={`project-icon-placeholder ${active ? "active" : ""}`} style={fallback.style} aria-hidden="true">
          {fallback.label}
        </span>
      )}
      <img
        src={src}
        alt=""
        className={`project-icon ${status === "loaded" ? "loaded" : ""} ${active ? "active" : ""} ${status === "loaded" ? "" : "hidden"}`}
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
        <p>Pick a git repo from <code style={{ fontFamily: "var(--font-mono)" }}>~/src</code> or <code style={{ fontFamily: "var(--font-mono)" }}>~/src/maze</code>, or paste any repo path like <code style={{ fontFamily: "var(--font-mono)" }}>~/.pi</code>, to start a board.</p>
        <ProjectPicker
          recentProjects={props.projects}
          onSelect={props.onAdd}
          autoFocus
          placeholder="search projects or paste a path…"
        />
      </div>
    </div>
  );
}

function ColumnView(props: {
  id: Column;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  prompts: Prompt[];
  onDelete: (id: string) => void;
  onEdit: (id: string, patch: { text?: string; modelProfile?: ModelProfile }) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  composer: React.ReactNode;
  home: string;
  activeId?: string | null;
  overId?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isArchivedCol?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: props.id });
  const itemIds = props.prompts.map((p) => p.id);
  const dragIndex = props.activeId ? itemIds.indexOf(props.activeId) : -1;
  const overIndex = props.overId ? itemIds.indexOf(props.overId) : -1;
  const isOverColumn = props.overId === props.id || itemIds.includes(props.overId ?? "");
  const showIndicator = props.activeId && dragIndex === -1 && isOverColumn;

  const Icon = props.icon;

  if (props.collapsed) {
    return (
      <div
        className={`column column-collapsed ${isOverColumn ? "drop-active" : ""}`}
        onClick={props.onToggleCollapse}
        title={`Expand ${props.title}`}
      >
        <div ref={setNodeRef} className="column-collapsed-inner">
          <Icon className="column-icon collapsed" />
          <span className="column-collapsed-title">{props.title}</span>
          {props.prompts.length > 0 && (
            <span className="count-chip">{props.prompts.length}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`column ${isOverColumn ? "drop-active" : ""}`}>
      <div className="column-head" style={{ cursor: "pointer" }} onClick={props.onToggleCollapse}>
        <Icon className="column-icon" />
        <span className="column-title">{props.title}</span>
        <span className="count-chip">{props.prompts.length}</span>
        <ChevronLeft className="column-collapse-icon" />
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
              <Card
                prompt={p}
                onDelete={props.onDelete}
                onEdit={props.onEdit}
                onArchive={props.onArchive}
                onUnarchive={props.onUnarchive}
                home={props.home}
                isArchivedCol={props.isArchivedCol}
              />
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

function Composer(props: { value: string; onChange: (v: string) => void; onSubmit: () => void; modelProfile: ModelProfile; onModelProfileChange: (v: ModelProfile) => void }) {
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
        placeholder="Describe a task for pi and/or drop images…"
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
        <div className="profile-toggle">
          <button className={`profile-tab ${props.modelProfile === "fast" ? "active" : ""}`} type="button" onClick={() => props.onModelProfileChange("fast")}><Zap size={11} /> Fast</button>
          <button className={`profile-tab ${props.modelProfile === "smart" ? "active" : ""}`} type="button" onClick={() => props.onModelProfileChange("smart")}><Brain size={11} /> Smart</button>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="btn primary sm composer-submit"
          onClick={props.onSubmit}
          disabled={!props.value.trim()}
          aria-label="Add prompt"
          title="Add prompt"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Card({ prompt, onDelete, onEdit, onArchive, onUnarchive, home, isArchivedCol }: { prompt: Prompt; onDelete: (id: string) => void; onEdit: (id: string, patch: { text?: string; modelProfile?: ModelProfile }) => void; onArchive: (id: string) => void; onUnarchive: (id: string) => void; home: string; isArchivedCol?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(prompt.text);
  const [editModelProfile, setEditModelProfile] = useState<ModelProfile>(prompt.modelProfile ?? "smart");
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
              onEdit(prompt.id, { text: editText, modelProfile: editModelProfile });
              setIsEditing(false);
            }
            if (e.key === "Escape") {
              setIsEditing(false);
              setEditText(prompt.text);
              setEditModelProfile(prompt.modelProfile ?? "smart");
            }
          }}
          autoFocus
        />
        <div className="profile-toggle" style={{ marginTop: 8, marginBottom: 8 }}>
          <button className={`profile-tab ${editModelProfile === "fast" ? "active" : ""}`} type="button" onClick={() => setEditModelProfile("fast")}><Zap size={11} /> Fast</button>
          <button className={`profile-tab ${editModelProfile === "smart" ? "active" : ""}`} type="button" onClick={() => setEditModelProfile("smart")}><Brain size={11} /> Smart</button>
        </div>
        <div className="card-actions" style={{ opacity: 1 }}>
          <div style={{ flex: 1 }} />
          <button
            className="btn ghost sm"
            onClick={() => { setIsEditing(false); setEditText(prompt.text); setEditModelProfile(prompt.modelProfile ?? "smart"); }}
          >
            Cancel
          </button>
          <button
            className="btn primary sm"
            onClick={() => { onEdit(prompt.id, { text: editText, modelProfile: editModelProfile }); setIsEditing(false); }}
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
          className="model-badge"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(prompt.id, { modelProfile: prompt.modelProfile === "fast" ? "smart" : "fast" });
          }}
          title="Toggle model profile"
        >
          {prompt.modelProfile === "fast" ? <><Zap size={11} /> Fast</> : <><Brain size={11} /> Smart</>}
        </button>
        <div className="card-actions-group">
          <button
            className="icon-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setEditText(prompt.text);
              setEditModelProfile(prompt.modelProfile ?? "smart");
              setIsEditing(true);
            }}
            title="Edit prompt"
            aria-label="Edit prompt"
          >
            <Pencil size={14} />
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
              aria-label="Copy tmux attach command"
            >
              <Copy size={14} />
            </button>
          )}
          {isArchivedCol ? (
            <button
              className="icon-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onUnarchive(prompt.id); }}
              title="Move prompt out of DONE"
              aria-label="Move prompt out of DONE"
            >
              <Undo2 size={14} />
            </button>
          ) : (
            <button
              className="icon-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onArchive(prompt.id); }}
              title="Mark prompt as done"
              aria-label="Mark prompt as done"
            >
              <Check size={14} />
            </button>
          )}
          <button
            className="icon-btn danger"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(prompt.id);
            }}
            title="Delete prompt and cleanup resources"
            aria-label="Delete prompt and cleanup resources"
          >
            <Trash2 size={14} />
          </button>
        </div>
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

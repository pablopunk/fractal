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
  Check,
  ChevronLeft,
  Copy,
  FolderKanban,
  FolderRoot,
  Pencil,
  Play,
  SquareTerminal,

  Trash2,
  Undo2,
} from "lucide-react";
import ProjectPicker from "./ProjectPicker.js";
import ModelPicker from "./ModelPicker.js";
import PresetPicker from "./PresetPicker.js";
import TerminalPane from "./TerminalPane.js";
import CommandMenu from "./CommandMenu.js";
import { Toaster, toast } from "sonner";

type Column = "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE" | "ARCHIVED";

type Project = { id: string; name: string; path: string };
type ModelProfile = "fast" | "smart";
type AgentPreset = { id: string; name: string; kind: "pi" | "claude" | "custom"; binary: string; argsTemplate: string; model?: string; promptTemplate?: string };
type Prompt = {
  id: string;
  projectId: string;
  text: string;
  imagePaths: string;
  modelProfile: ModelProfile;
  presetId: string;
  column: Column;
  runMode?: "in_place" | "worktree" | null;
  branch?: string | null;
  worktreePath?: string | null;
  tmuxSession?: string | null;
  error?: string | null;
  isArchived?: boolean | null;
  launchedAt?: number | null;
  isRunning?: boolean;
};
type AppSettings = { fastModel: string; smartModel: string; agentPresets: AgentPreset[]; defaultPresetId: string; lastProjectId: string };
type PiModel = { id: string; provider: string; model: string; agent?: "pi" | "claude" };
type UrlPreview = { url: string; title: string; description: string; image: string; siteName: string; favicon: string };
type TerminalTab = { id: string; promptId: string; session: string; title: string; cwd?: string };

const COLUMNS: { id: Column; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "PROMPTS", title: "Prompts", icon: FolderRoot },
  { id: "RUN_IN_PLACE", title: "Run in place", icon: Play },
  { id: "RUN_IN_WORKTREE", title: "Run in worktree", icon: FolderKanban },
  { id: "ARCHIVED", title: "DONE", icon: Check },
];

const COLLAPSED_KEY = "fractal:collapsedColumns";
const TERMINAL_TABS_KEY = "fractal:terminalTabs";
const TERMINAL_WIDTH_KEY = "fractal:terminalWidth";
const TERMINAL_HEIGHT_KEY = "fractal:terminalHeight";
const TERMINAL_POSITION_KEY = "fractal:terminalPosition";
const SIDEBAR_WIDTH_KEY = "fractal:sidebarWidth";
const SIDEBAR_MIN_WIDTH = 176;
const SIDEBAR_MAX_WIDTH = 260;
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

function loadTerminalTabs(): TerminalTab[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_TABS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadTerminalWidth(): number {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_WIDTH_KEY) : null;
    return raw ? Number(raw) || 520 : 520;
  } catch { return 520; }
}

function loadTerminalHeight(): number {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_HEIGHT_KEY) : null;
    return raw ? Number(raw) || 320 : 320;
  } catch { return 320; }
}

function loadTerminalPosition(): "right" | "bottom" {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_POSITION_KEY) : null;
    return raw === "bottom" ? "bottom" : "right";
  } catch { return "right"; }
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function loadSidebarWidth(): number {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_KEY) : null;
    return raw ? clampSidebarWidth(Number(raw) || 204) : 204;
  } catch { return 204; }
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
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const body = json as { error?: string; message?: string };
    throw new ApiError(res.status, body.error ?? body.message ?? text ?? `${res.status} ${res.statusText}`, json);
  }
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
  const [composerImagePaths, setComposerImagePaths] = useState<string[]>([]);
  const [composerPresetId, setComposerPresetId] = useState("");
  const [settings, setSettings] = useState<AppSettings>({ fastModel: "", smartModel: "", agentPresets: [], defaultPresetId: "pi", lastProjectId: "" });
  const [models, setModels] = useState<PiModel[]>([]);
  const [claudeModels, setClaudeModels] = useState<PiModel[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showSidebarPicker, setShowSidebarPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<Column, boolean>>(() => loadCollapsed());
  const [pendingDeletePromptId, setPendingDeletePromptId] = useState<string | null>(null);
  const [pendingDeleteChanges, setPendingDeleteChanges] = useState<string[] | null>(null);
  const [archiveBlockedMessage, setArchiveBlockedMessage] = useState<string | null>(null);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(() => loadTerminalTabs());
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(() => loadTerminalTabs()[0]?.id ?? null);
  const [terminalWidth, setTerminalWidth] = useState<number>(() => loadTerminalWidth());
  const [terminalHeight, setTerminalHeight] = useState<number>(() => loadTerminalHeight());
  const [terminalPosition, setTerminalPosition] = useState<"right" | "bottom">(() => loadTerminalPosition());
  const [terminalFocusKey, setTerminalFocusKey] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [showProjectShortcuts, setShowProjectShortcuts] = useState(false);
  const openTerminalIds = useMemo(() => new Set(terminalTabs.map((tab) => tab.id)), [terminalTabs]);

  const activateTerminal = (id: string) => {
    setActiveTerminalId(id);
    setTerminalFocusKey((key) => key + 1);
  };

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
      void api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ lastProjectId: activeProjectId }),
      }).catch(() => {});
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

  useEffect(() => {
    try { localStorage.setItem(TERMINAL_TABS_KEY, JSON.stringify(terminalTabs)); } catch {}
  }, [terminalTabs]);

  useEffect(() => {
    try { localStorage.setItem(TERMINAL_WIDTH_KEY, String(terminalWidth)); } catch {}
  }, [terminalWidth]);

  useEffect(() => {
    try { localStorage.setItem(TERMINAL_HEIGHT_KEY, String(terminalHeight)); } catch {}
  }, [terminalHeight]);

  useEffect(() => {
    try { localStorage.setItem(TERMINAL_POSITION_KEY, terminalPosition); } catch {}
  }, [terminalPosition]);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    const updateProjectShortcuts = (event: KeyboardEvent | MouseEvent | FocusEvent) => {
      setShowProjectShortcuts(event instanceof KeyboardEvent ? event.metaKey : false);
    };

    const cycleTerminalTabs = (direction: 1 | -1) => {
      if (terminalTabs.length < 2) return;
      const current = Math.max(terminalTabs.findIndex((tab) => tab.id === activeTerminalId), 0);
      const next = (current + direction + terminalTabs.length) % terminalTabs.length;
      activateTerminal(terminalTabs[next].id);
    };

    const selectProjectByNumber = (index: number) => {
      const project = projects[index];
      if (project) setActiveProjectId(project.id);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.repeat) return;

      if (e.ctrlKey && !e.metaKey && e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cycleTerminalTabs(e.shiftKey ? -1 : 1);
        return;
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (ctrlOrCmd && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        selectProjectByNumber(Number(e.key) - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keydown", updateProjectShortcuts);
    window.addEventListener("keyup", updateProjectShortcuts);
    window.addEventListener("blur", updateProjectShortcuts);
    window.addEventListener("mousemove", updateProjectShortcuts);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keydown", updateProjectShortcuts);
      window.removeEventListener("keyup", updateProjectShortcuts);
      window.removeEventListener("blur", updateProjectShortcuts);
      window.removeEventListener("mousemove", updateProjectShortcuts);
    };
  }, [activeProjectId, activeTerminalId, projects, terminalTabs]);

  function toggleCollapse(id: Column) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  function openTerminal(prompt: Prompt) {
    if (!prompt.tmuxSession) return;
    const existing = terminalTabs.find((tab) => tab.id === prompt.tmuxSession);
    if (existing) {
      activateTerminal(existing.id);
      return;
    }
    const project = projects.find((p) => p.id === prompt.projectId);
    const cwd = prompt.worktreePath ?? project?.path;
    const tab: TerminalTab = {
      id: prompt.tmuxSession,
      promptId: prompt.id,
      session: prompt.tmuxSession,
      title: prompt.tmuxSession.replace(/^fractal-/, ""),
      cwd,
    };
    setTerminalTabs((tabs) => tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]);
    activateTerminal(tab.id);
  }

  function closeTerminal(id: string) {
    setTerminalTabs((tabs) => {
      const next = tabs.filter((tab) => tab.id !== id);
      setActiveTerminalId((active) => active === id ? next.at(-1)?.id ?? null : active);
      return next;
    });
  }

  async function refresh() {
    try {
      const data = await api<{ home: string; projects: Project[]; prompts: Prompt[]; settings: AppSettings }>("/api/state");
      setProjects(data.projects);
      setPrompts(data.prompts);
      const nextSettings = data.settings ?? { fastModel: "", smartModel: "", agentPresets: [], defaultPresetId: "pi", lastProjectId: "" };
      setSettings(nextSettings);
      setComposerPresetId((cur) => {
        if (nextSettings.agentPresets.some((p) => p.id === cur)) return cur;
        if (nextSettings.agentPresets.some((p) => p.id === nextSettings.defaultPresetId)) return nextSettings.defaultPresetId;
        return nextSettings.agentPresets[0]?.id ?? "pi";
      });
      setHome(data.home ?? "");
      setActiveProjectId((cur) => {
        const hasProject = (id: string | null | undefined) => !!id && data.projects.some((p) => p.id === id);
        const urlId = getProjectIdFromUrl();
        if (hasProject(urlId)) return urlId;
        if (hasProject(cur)) return cur;
        if (hasProject(nextSettings.lastProjectId)) return nextSettings.lastProjectId;
        return data.projects[0]?.id ?? null;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function openProjectTerminal(project: Project) {
    try {
      const { session, title } = await api<{ session: string; title: string }>(`/api/projects/${project.id}/terminal`, { method: "POST" });
      const existing = terminalTabs.find((tab) => tab.id === session);
      if (existing) {
        if (!existing.cwd) {
          setTerminalTabs((tabs) => tabs.map((tab) => tab.id === existing.id ? { ...tab, cwd: project.path } : tab));
        }
        activateTerminal(existing.id);
        return;
      }
      const tab: TerminalTab = { id: session, promptId: project.id, session, title, cwd: project.path };
      setTerminalTabs((tabs) => tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]);
      activateTerminal(tab.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeProject(id: string) {
    if (!confirm("Remove this project from Fractal?")) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => {
        const removedIndex = prev.findIndex((x) => x.id === id);
        const next = prev.filter((x) => x.id !== id);
        if (activeProjectId === id) {
          setActiveProjectId(next[removedIndex]?.id ?? next[removedIndex - 1]?.id ?? null);
        }
        return next;
      });
      setPrompts((p) => p.filter((x) => x.projectId !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function addPrompt() {
    const text = composer.trim();
    if ((!text && composerImagePaths.length === 0) || !activeProjectId) return;
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/projects/${activeProjectId}/prompts`, {
        method: "POST",
        body: JSON.stringify({ text, imagePaths: composerImagePaths, presetId: composerPresetId }),
      });
      setPrompts((p) => [...p, prompt]);
      setComposer("");
      setComposerImagePaths([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function editPrompt(id: string, patch: { text?: string; modelProfile?: ModelProfile; presetId?: string }) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function unarchivePrompt(id: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, { method: "DELETE" });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function moveToPrompts(id: string) {
    const prev = prompts;
    setPrompts((p) => p.map((x) => (x.id === id ? { ...x, column: "PROMPTS", isArchived: false } : x)));
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ column: "PROMPTS", isArchived: false }),
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      setPrompts(prev);
      toast.error(e instanceof Error ? e.message : String(e));
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
        if (overPrompt.column === "PROMPTS") {
          void moveToPrompts(activeId);
        } else if (overPrompt.column === "RUN_IN_PLACE" || overPrompt.column === "RUN_IN_WORKTREE") {
          void launch(activeId, overPrompt.column);
        } else {
          void unarchivePrompt(activeId);
        }
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
      if (target === "PROMPTS") {
        void moveToPrompts(activeId);
      } else if (activePrompt.column !== target && activePrompt.column === "PROMPTS") {
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
    if (target === "PROMPTS") {
      void moveToPrompts(activeId);
      return;
    }
    if (activePrompt.isArchived) {
      if (target === "RUN_IN_PLACE" || target === "RUN_IN_WORKTREE") {
        void launch(activeId, target);
      } else {
        void unarchivePrompt(activeId);
      }
      return;
    }
    if (activePrompt.column === target) return;
    if (activePrompt.column !== "PROMPTS") return; // V1: only launch from backlog
    void launch(activeId, target);
  }

  async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings | undefined> {
    const prev = settings;
    setSettings((cur) => ({ ...cur, ...patch }));
    try {
      const { settings: next } = await api<{ settings: AppSettings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSettings(next);
      return next;
    } catch (e) {
      setSettings(prev);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function createPreset(): Promise<string | undefined> {
    const id = `custom-${Date.now()}`;
    const nextPreset: AgentPreset = { id, name: "Custom", kind: "custom", binary: "codex", argsTemplate: "{{prompt}}", model: "", promptTemplate: "{{prompt}}" };
    const next = await saveSettings({ agentPresets: [...settings.agentPresets, nextPreset] });
    return next ? id : undefined;
  }

  useEffect(() => {
    void api<{ models: PiModel[]; claudeModels: PiModel[] }>("/api/models")
      .then((data) => { setModels(data.models ?? []); setClaudeModels(data.claudeModels ?? []); })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
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

  function selectCommandPrompt(prompt: Prompt) {
    setActiveProjectId(prompt.projectId);
    openTerminal(prompt);
  }

  return (
    <>
      <Toaster richColors closeButton position="top-center" theme="dark" />
      <CommandMenu
        projects={projects}
        prompts={prompts}
        activeProjectId={activeProjectId}
        home={home}
        onSelectProject={(project) => setActiveProjectId(project.id)}
        onSelectPrompt={selectCommandPrompt}
      />
      <div className="app" style={{ ["--sidebar-width" as string]: `${sidebarWidth}px` }}>
      <Sidebar
        projects={projects}
        activeId={activeProjectId}
        onSelect={(id) => setActiveProjectId(id)}
        onRemove={removeProject}
        onAdd={addProject}
        showPicker={showSidebarPicker}
        setShowPicker={setShowSidebarPicker}
        home={home}
        onResize={setSidebarWidth}
        showShortcuts={showProjectShortcuts}
      />
      <main className="main">
        {!activeProject ? (
          <div className="empty-wrapper">
            <EmptyState projects={projects} onAdd={addProject} />
          </div>
        ) : (
          <>
            <div className="topbar">
              <button type="button" className="topbar-title topbar-title-button" onClick={() => void openProjectTerminal(activeProject)} title="Open project terminal">
                <span className="topbar-title-row">
                  <h1>{activeProject.name}</h1>
                  <SquareTerminal className="topbar-title-icon" aria-hidden="true" />
                </span>
                <span className="path" title={activeProject.path}>{tildeify(activeProject.path, home)}</span>
              </button>
              <div className="topbar-spacer" />
              <PresetSettings
                presets={settings.agentPresets}
                defaultPresetId={settings.defaultPresetId}
                onSetDefault={(id) => void saveSettings({ defaultPresetId: id })}
                piModels={models}
                claudeModels={claudeModels}
                onChange={(agentPresets) => void saveSettings({ agentPresets })}
              />
            </div>

            <DndContext sensors={sensors} collisionDetection={columnAwareCollisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
              <div className={`workspace workspace-${terminalTabs.length > 0 ? terminalPosition : "right"}`}>
              <div className={`board ${terminalTabs.length > 0 && terminalPosition === "right" ? "board-rows" : ""}`}>
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
                      presets={settings.agentPresets}
                      onDelete={deletePrompt}
                      onEdit={editPrompt}
                      onArchive={archivePrompt}
                      onUnarchive={unarchivePrompt}
                      onOpenTerminal={openTerminal}
                      openTerminalIds={openTerminalIds}
                      activeTerminalId={activeTerminalId}
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
                            imagePaths={composerImagePaths}
                            onImagePathsChange={setComposerImagePaths}
                            onSubmit={addPrompt}
                            presets={settings.agentPresets}
                            presetId={composerPresetId}
                            onPresetChange={setComposerPresetId}
                            onCreatePreset={async () => {
                              const id = await createPreset();
                              if (id) setComposerPresetId(id);
                            }}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </div>
              {terminalTabs.length > 0 && (
                <TerminalPane
                  tabs={terminalTabs}
                  activeId={activeTerminalId}
                  position={terminalPosition}
                  size={terminalPosition === "right" ? terminalWidth : terminalHeight}
                  onResize={terminalPosition === "right" ? setTerminalWidth : setTerminalHeight}
                  onTogglePosition={() => setTerminalPosition((position) => position === "right" ? "bottom" : "right")}
                  onSelect={activateTerminal}
                  onClose={closeTerminal}
                  focusKey={terminalFocusKey}
                />
              )}
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
    </>
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
  onResize: (width: number) => void;
  showShortcuts: boolean;
}) {
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = e.currentTarget.parentElement?.getBoundingClientRect().width ?? 204;
    const onMove = (event: PointerEvent) => {
      props.onResize(clampSidebarWidth(startWidth + event.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

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
        {props.projects.map((p, index) => (
          <div
            key={p.id}
            className={`project-item ${p.id === props.activeId ? "active" : ""}`}
            onClick={() => props.onSelect(p.id)}
            title={tildeify(p.path, props.home)}
          >
            <ProjectIcon name={p.name} path={p.path} active={p.id === props.activeId} />
            <span className="name">{p.name}</span>
            {props.showShortcuts && index < 9 && <span className="project-shortcut">⌘{index + 1}</span>}
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
      <div className="sidebar-resize-handle" onPointerDown={startResize} title="Resize projects drawer" />
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
        <p>Choose from the list of recent projects or paste a path to a new project.</p>
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
  presets: AgentPreset[];
  onDelete: (id: string) => void;
  onEdit: (id: string, patch: { text?: string; modelProfile?: ModelProfile; presetId?: string }) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onOpenTerminal: (prompt: Prompt) => void;
  openTerminalIds: Set<string>;
  activeTerminalId?: string | null;
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
                presets={props.presets}
                onDelete={props.onDelete}
                onEdit={props.onEdit}
                onArchive={props.onArchive}
                onUnarchive={props.onUnarchive}
                onOpenTerminal={props.onOpenTerminal}
                isTerminalOpen={!!p.tmuxSession && props.openTerminalIds.has(p.tmuxSession)}
                isActiveTerminal={!!p.tmuxSession && p.tmuxSession === props.activeTerminalId}
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

function SortablePresetItem({ preset, active, isDefault, onSelect }: { preset: AgentPreset; active: boolean; isDefault: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`preset-modal-list-item ${active ? "active" : ""}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span className="preset-modal-list-name">{preset.name}{isDefault ? " ★" : ""}</span>
      <span className="preset-modal-list-binary">{preset.binary}</span>
    </button>
  );
}

function PresetSettings(props: { presets: AgentPreset[]; defaultPresetId: string; onSetDefault: (id: string) => void; piModels: PiModel[]; claudeModels: PiModel[]; onChange: (presets: AgentPreset[]) => void }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(props.presets[0]?.id ?? null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  function update(id: string, patch: Partial<AgentPreset>) {
    props.onChange(props.presets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset));
  }
  function addPreset() {
    const id = `custom-${Date.now()}`;
    props.onChange([...props.presets, { id, name: "Custom", kind: "custom", binary: "codex", argsTemplate: "{{prompt}}", model: "", promptTemplate: "{{prompt}}" }]);
    setSelectedId(id);
  }
  function removePreset(id: string) {
    const next = props.presets.filter((preset) => preset.id !== id);
    props.onChange(next);
    setSelectedId(next[0]?.id ?? null);
  }

  const selected = props.presets.find((preset) => preset.id === selectedId) ?? props.presets[0] ?? null;
  const selectedKind: AgentPreset["kind"] = selected?.binary === "pi" ? "pi" : selected?.binary === "claude" ? "claude" : "custom";
  const selectedModels = selectedKind === "claude" ? props.claudeModels : props.piModels;

  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}>Presets</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal preset-modal" onClick={(e) => e.stopPropagation()}>
            <header className="preset-modal-header">
              <h2>Agent presets</h2>
              <button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button>
            </header>
            <div className="preset-modal-body">
              <aside className="preset-modal-list">
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={(e) => {
                  const { active, over } = e;
                  if (!over || active.id === over.id) return;
                  const oldIndex = props.presets.findIndex((p) => p.id === active.id);
                  const newIndex = props.presets.findIndex((p) => p.id === over.id);
                  if (oldIndex === -1 || newIndex === -1) return;
                  props.onChange(arrayMove(props.presets, oldIndex, newIndex));
                }}>
                  <SortableContext items={props.presets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    {props.presets.map((preset) => (
                      <SortablePresetItem
                        key={preset.id}
                        preset={preset}
                        active={preset.id === selected?.id}
                        isDefault={preset.id === props.defaultPresetId}
                        onSelect={() => setSelectedId(preset.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <button className="btn ghost sm" onClick={addPreset}>+ New preset</button>
              </aside>
              {selected ? (
                <form className="preset-modal-form" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    <span>Name</span>
                    <input value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value })} />
                  </label>
                  <label>
                    <span>Binary</span>
                    <input value={selected.binary} onChange={(e) => {
                      const binary = e.target.value;
                      const kind = binary === "pi" ? "pi" : binary === "claude" ? "claude" : "custom";
                      update(selected.id, { binary, kind });
                    }} placeholder="pi, claude, codex, …" />
                  </label>
                  <label>
                    <span>Model</span>
                    {selectedKind === "custom" ? (
                      <input value={selected.model ?? ""} onChange={(e) => update(selected.id, { model: e.target.value })} placeholder="optional, available as {{model}}" />
                    ) : (
                      <ModelPicker models={selectedModels} value={selected.model ?? ""} onChange={(model) => update(selected.id, { model })} />
                    )}
                  </label>

                  <label>
                    <span>Args template</span>
                    <input value={selected.argsTemplate} onChange={(e) => update(selected.id, { argsTemplate: e.target.value })} placeholder="--model {{model}} {{prompt}}" />
                  </label>
                  <label>
                    <span>Prompt template</span>
                    <textarea rows={5} value={selected.promptTemplate ?? "{{prompt}}"} onChange={(e) => update(selected.id, { promptTemplate: e.target.value })} placeholder="Use {{prompt}} for the card text." />
                  </label>
                  <label className="preset-modal-default">
                    <input type="checkbox" checked={selected.id === props.defaultPresetId} onChange={(e) => { if (e.target.checked) props.onSetDefault(selected.id); }} />
                    <span>Use as default for new prompts</span>
                  </label>
                  <div className="preset-modal-form-actions">
                    {props.presets.length > 1 && (
                      <button type="button" className="btn danger sm" onClick={() => removePreset(selected.id)}>Delete preset</button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="preset-modal-empty">No presets yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Composer(props: { value: string; onChange: (v: string) => void; imagePaths: string[]; onImagePathsChange: (paths: string[]) => void; onSubmit: () => void; presets: AgentPreset[]; presetId: string; onPresetChange: (v: string) => void; onCreatePreset: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);

    const paths = getDroppedImagePaths(e.dataTransfer);
    if (paths.length === 0) return;

    props.onImagePathsChange([...new Set([...props.imagePaths, ...paths])]);

    requestAnimationFrame(() => textareaRef.current?.focus());
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
      {props.imagePaths.length > 0 && (
        <div className="image-attachments">
          {props.imagePaths.map((path) => (
            <LocalImageAttachment
              key={path}
              path={path}
              onRemove={() => props.onImagePathsChange(props.imagePaths.filter((p) => p !== path))}
            />
          ))}
        </div>
      )}
      <div className="composer-actions">
        <PresetPicker presets={props.presets} value={props.presetId} onChange={props.onPresetChange} onCreate={props.onCreatePreset} />
        <div style={{ flex: 1 }} />
        <button
          className="btn primary sm composer-submit"
          onClick={props.onSubmit}
          disabled={(!props.value.trim() && props.imagePaths.length === 0) || props.presets.length === 0}
          aria-label="Add prompt"
          title={props.presets.length === 0 ? "Create a preset first" : "Add prompt"}
        >
          Add
        </button>
      </div>
    </div>
  );
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/;
const QUOTED_IMAGE_PATH_RE = /(["'])((?:~|\/)[^"']+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif))\1/gi;
const UNQUOTED_IMAGE_PATH_RE = /(?:^|\s)((?:~|\/)[^\n\r\t"']+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif))(?=$|\s)/gi;

function extractImagePaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(QUOTED_IMAGE_PATH_RE)) paths.add(match[2]);
  for (const match of text.matchAll(UNQUOTED_IMAGE_PATH_RE)) paths.add(match[1].trim());
  return [...paths];
}

function parseImagePaths(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const paths = JSON.parse(value);
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function UrlPreviewLink({ url }: { url: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  function openPreview() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        const width = Math.min(420, window.innerWidth * 0.7);
        const height = 128;
        const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
        const hasRoomAbove = rect.top > height + 16;
        setPopoverStyle({ left, top: hasRoomAbove ? rect.top - height - 8 : rect.bottom + 8, width });
      }
      setShowPreview(true);
    }, 250);
  }

  function closePreview() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  }

  useEffect(() => {
    if (!showPreview || preview || previewError) return;
    const controller = new AbortController();
    void api<UrlPreview>(`/api/url-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(setPreview)
      .catch((e) => {
        if (!controller.signal.aborted) setPreviewError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [preview, previewError, showPreview, url]);

  return (
    <span ref={wrapRef} className="url-preview-wrap" onMouseEnter={openPreview} onMouseLeave={closePreview}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
      {showPreview && (
        <span className="url-preview-popover" style={popoverStyle ?? undefined} aria-hidden="true">
          {!preview && !previewError && (
            <>
              <span className="url-preview-image url-preview-skeleton" />
              <span className="url-preview-content">
                <span className="url-preview-skeleton url-preview-skeleton-site" />
                <span className="url-preview-skeleton url-preview-skeleton-title" />
                <span className="url-preview-skeleton url-preview-skeleton-description" />
                <span className="url-preview-skeleton url-preview-skeleton-url" />
              </span>
            </>
          )}
          {previewError && <span className="url-preview-loading">Preview unavailable</span>}
          {preview && (
            <>
              {preview.image && <img className="url-preview-image" src={preview.image} alt="" loading="lazy" />}
              <span className="url-preview-content">
                <span className="url-preview-site">
                  {preview.favicon && <img src={preview.favicon} alt="" loading="lazy" />}
                  {preview.siteName}
                </span>
                <span className="url-preview-title">{preview.title}</span>
                {preview.description && <span className="url-preview-description">{preview.description}</span>}
                <span className="url-preview-url">{preview.url}</span>
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

function LocalImageAttachment({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const [exists, setExists] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  if (!exists) return null;
  const src = `/api/local-image?path=${encodeURIComponent(path)}`;

  function togglePreview() {
    setPopoverStyle({ left: 0, top: 0, width: 0, height: 0 });
    setShowPreview((value) => !value);
  }

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!showPreview) return;
      if (wrapRef.current?.contains(e.target as Node)) return;
      setShowPreview(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showPreview]);

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    const isWide = naturalWidth > naturalHeight;
    setPopoverStyle(isWide ? { width: "85vw", maxWidth: "85vw" } : { height: "85vh", maxHeight: "85vh" });
  }

  return (
    <span ref={wrapRef} className="image-attachment-wrap">
      <a className="image-attachment" href={src} target="_blank" rel="noreferrer" title={path} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePreview(); }}>
        <img src={src} alt={basename(path)} loading="lazy" onError={() => setExists(false)} />
        <span>{basename(path)}</span>
      </a>
      {onRemove && (
        <button type="button" className="image-attachment-remove" aria-label={`Remove ${basename(path)}`} title="Remove attachment" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}>×</button>
      )}
      {showPreview && (
        <span className="image-attachment-popover" style={popoverStyle ?? undefined} aria-hidden="true">
          <img src={src} alt={basename(path)} loading="lazy" onLoad={handleLoad} />
        </span>
      )}
    </span>
  );
}

function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;
    const url = rawUrl.replace(TRAILING_URL_PUNCTUATION_RE, "");
    const trailing = rawUrl.slice(url.length);

    if (matchIndex > lastIndex) parts.push(text.slice(lastIndex, matchIndex));
    parts.push(<UrlPreviewLink key={`${matchIndex}-${url}`} url={url} />);
    if (trailing) parts.push(trailing);
    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

function Card({ prompt, presets, onDelete, onEdit, onArchive, onUnarchive, onOpenTerminal, isTerminalOpen, isActiveTerminal, home, isArchivedCol }: { prompt: Prompt; presets: AgentPreset[]; onDelete: (id: string) => void; onEdit: (id: string, patch: { text?: string; modelProfile?: ModelProfile; presetId?: string }) => void; onArchive: (id: string) => void; onUnarchive: (id: string) => void; onOpenTerminal: (prompt: Prompt) => void; isTerminalOpen: boolean; isActiveTerminal: boolean; home: string; isArchivedCol?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(prompt.text);
  const [editPresetId, setEditPresetId] = useState(prompt.presetId);
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
  const isRunning = !!prompt.isRunning;
  const presetName = presets.find((preset) => preset.id === prompt.presetId)?.name ?? prompt.presetId;
  const imagePaths = useMemo(() => [...new Set([...parseImagePaths(prompt.imagePaths), ...extractImagePaths(prompt.text)])], [prompt.imagePaths, prompt.text]);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    };
  }, []);

  async function copyWorktreeName() {
    if (!prompt.tmuxSession) return;
    try {
      await navigator.clipboard?.writeText(prompt.tmuxSession);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error("Failed to copy worktree name", e);
      setCopied(false);
    }
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditText(prompt.text);
    setEditPresetId(prompt.presetId);
  }

  function saveEdit() {
    onEdit(prompt.id, { text: editText, presetId: editPresetId });
    setIsEditing(false);
  }

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
              saveEdit();
            }
            if (e.key === "Escape") {
              cancelEdit();
            }
          }}
          autoFocus
        />
        <div className="card-actions" style={{ opacity: 1 }}>
          {prompt.column === "PROMPTS" && (
            <PresetPicker presets={presets} value={editPresetId} onChange={setEditPresetId} />
          )}
          <div style={{ flex: 1 }} />
          <button
            className="btn ghost sm"
            onClick={cancelEdit}
          >
            Cancel
          </button>
          <button
            className="btn primary sm"
            onClick={saveEdit}
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
      onClick={() => {
        if (prompt.tmuxSession) onOpenTerminal(prompt);
      }}
      {...attributes}
      {...listeners}
    >
      {prompt.tmuxSession && prompt.isRunning && (
        <div className={`terminal-card-button ${isActiveTerminal ? "active" : ""}`} title={isActiveTerminal ? "Active terminal" : "Terminal open"} aria-hidden="true">
          <SquareTerminal size={18} />
        </div>
      )}
      <div className="text"><LinkifiedText text={prompt.text} /></div>
      {imagePaths.length > 0 && (
        <div className="image-attachments">
          {imagePaths.map((path) => <LocalImageAttachment key={path} path={path} />)}
        </div>
      )}
      {(prompt.branch || prompt.tmuxSession || prompt.worktreePath || isRunning) && (
        <div className="card-meta">
          {isRunning && <span className="tag accent">running</span>}
          {prompt.tmuxSession && (
            <button
              type="button"
              className="tag tag-button"
              title={`Copy ${prompt.tmuxSession}`}
              aria-label={`Copy ${prompt.tmuxSession}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                copyWorktreeName();
              }}
            >
              {prompt.tmuxSession}
            </button>
          )}
        </div>
      )}
      {prompt.error && <span className="tag error">{prompt.error}</span>}
      <div className="card-actions">
        <span className="model-badge" title={prompt.presetId}>{presetName}</span>
        <div className="card-actions-group">
          {copied && <span className="copy-notice" role="status" aria-live="polite">Copied</span>}
          <button
            className="icon-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setEditText(prompt.text);
              setEditPresetId(prompt.presetId);
              setIsEditing(true);
            }}
            title="Edit prompt"
            aria-label="Edit prompt"
          >
            <Pencil size={14} />
          </button>
          {prompt.tmuxSession && (
            <>
              <button
                type="button"
                className="icon-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  copyWorktreeName();
                }}
                title="Copy worktree name"
                aria-label="Copy worktree name"
              >
                <Copy size={14} />
              </button>
            </>
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

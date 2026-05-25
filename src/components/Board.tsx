import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Check, FolderKanban, FolderRoot, Monitor, Moon, Palette, Play, SquareTerminal, Sun } from "lucide-react";
import TerminalPane from "./TerminalPane.js";
import Portal from "./Portal.js";
import CommandMenu from "./CommandMenu.js";
import Tooltip, { TooltipProvider } from "./Tooltip.js";
import { Toaster, toast } from "sonner";
import { Sidebar, EmptyState, ColumnView, PresetSettings, Composer, tildeify, truncate } from "./BoardParts.js";
import { ApiError, api } from "~/lib/client/api.js";
import {
  ACTIVE_TERMINAL_TAB_KEY,
  SIDEBAR_WIDTH_KEY,
  TERMINAL_HEIGHT_KEY,
  TERMINAL_POSITION_KEY,
  TERMINAL_TABS_KEY,
  TERMINAL_WIDTH_KEY,
  loadActiveTerminalId,
  loadCollapsed,
  isSidebarCollapsed,
  loadSidebarWidth,
  loadTerminalHeight,
  loadTerminalPosition,
  loadTerminalTabs,
  loadTerminalWidth,
  loadTheme,
  loadTerminalTheme,
  loadGlassSettings,
  saveCollapsed,
  saveTerminalTheme,
  saveTheme,
  saveGlassSettings,
  type GlassSettings,
  type ThemeMode,
  type TerminalThemeName,
} from "~/lib/client/persistence.js";
import { TERMINAL_THEME_OPTIONS, terminalThemePreview } from "~/lib/client/terminal-themes.js";
import type { AppSettings, Column, ModelProfile, PiModel, Project, Prompt, TerminalTab } from "~/lib/client/types.js";

const COLUMNS: { id: Column; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "PROMPTS", title: "Prompts", icon: FolderRoot },
  { id: "RUN_IN_PLACE", title: "Run in place", icon: Play },
  { id: "RUN_IN_WORKTREE", title: "Run in worktree", icon: FolderKanban },
  { id: "ARCHIVED", title: "DONE", icon: Check },
];
const THEME_OPTIONS: ThemeMode[] = ["system", "light", "dark"];
const BOARD_ROWS_MAX_WIDTH = 960;

function ThemeIcon(props: { theme: ThemeMode }) {
  if (props.theme === "light") return <Sun size={14} />;
  if (props.theme === "dark") return <Moon size={14} />;
  return <Monitor size={14} />;
}

function ThemeSettingsPicker(props: {
  theme: ThemeMode;
  terminalThemeName: TerminalThemeName;
  onThemeChange: (theme: ThemeMode) => void;
  glass: GlassSettings;
  onGlassChange: (settings: GlassSettings) => void;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Tooltip content="Themes">
        <button type="button" className="theme-toggle" onClick={() => setOpen((value) => !value)} aria-label="Themes">
          <Palette size={14} />
        </button>
      </Tooltip>
      {open && <Portal>
        <div className="modal-overlay theme-modal-overlay" onClick={() => setOpen(false)}>
        <div className="modal theme-modal" onClick={(e) => e.stopPropagation()}>
          <div className="theme-modal-header">
            <h2>Appearance</h2>
            <button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="Close themes">×</button>
          </div>
          <div className="theme-popup-section">
            <div className="theme-popup-label">App theme</div>
            <div className="theme-segmented" role="radiogroup" aria-label="App theme">
              {THEME_OPTIONS.map((option) => (
                <button key={option} type="button" className={props.theme === option ? "active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => props.onThemeChange(option)}>
                  <ThemeIcon theme={option} />
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="theme-popup-section">
            <div className="theme-popup-label">Glass</div>
            <label className="theme-check-row">
              <input type="checkbox" checked={props.glass.enabled} onChange={(e) => props.onGlassChange({ ...props.glass, enabled: e.currentTarget.checked })} />
              <span>Opacity + blur</span>
            </label>
            <label className="theme-range-row">
              <span>Opacity</span>
              <input type="range" min="0.45" max="1" step="0.01" value={props.glass.opacity} onChange={(e) => props.onGlassChange({ ...props.glass, opacity: Number(e.currentTarget.value) })} />
            </label>
            <label className="theme-range-row">
              <span>Blur</span>
              <input type="range" min="0" max="40" step="1" value={props.glass.blur} onChange={(e) => props.onGlassChange({ ...props.glass, blur: Number(e.currentTarget.value) })} />
            </label>
          </div>
          <div className="theme-popup-section">
            <div className="theme-popup-label">Terminal theme</div>
            <div className="model-picker-items theme-picker-items">
              {TERMINAL_THEME_OPTIONS.map((option) => {
                const preview = terminalThemePreview(props.theme, option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`picker-item theme-picker-item ${props.terminalThemeName === option.id ? "active" : ""}`}
                    style={{ "--theme-preview-bg": preview.background, "--theme-preview-fg": preview.foreground, "--theme-preview-accent": preview.accent } as React.CSSProperties}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => props.onTerminalThemeChange(option.id)}
                  >
                    <span className="theme-swatch" />
                    <span className="picker-name">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      </Portal>}
    </>
  );
}

const columnAwareCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

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
  const [presetSettingsOpen, setPresetSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ fastModel: "", smartModel: "", agentPresets: [], defaultPresetId: "pi", helperPresetId: "", lastProjectId: "" });
  const [models, setModels] = useState<PiModel[]>([]);
  const [claudeModels, setClaudeModels] = useState<PiModel[]>([]);
  const [opencodeModels, setOpenCodeModels] = useState<PiModel[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showSidebarPicker, setShowSidebarPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<Column, boolean>>(() => loadCollapsed(getProjectIdFromUrl()));
  const [pendingDeletePromptId, setPendingDeletePromptId] = useState<string | null>(null);
  const [pendingDeleteChanges, setPendingDeleteChanges] = useState<string[] | null>(null);
  const [archiveBlockedMessage, setArchiveBlockedMessage] = useState<string | null>(null);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(() => loadTerminalTabs());
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(() => loadActiveTerminalId(loadTerminalTabs()));
  const [terminalWidth, setTerminalWidth] = useState<number>(() => loadTerminalWidth());
  const [terminalHeight, setTerminalHeight] = useState<number>(() => loadTerminalHeight());
  const [terminalPosition, setTerminalPosition] = useState<"right" | "bottom">(() => loadTerminalPosition());
  const [terminalFocusKey, setTerminalFocusKey] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [showProjectShortcuts, setShowProjectShortcuts] = useState(false);
  const [isClearingDone, setIsClearingDone] = useState(false);
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(() => new Set());
  const [isOpeningProjectTerminal, setIsOpeningProjectTerminal] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [terminalThemeName, setTerminalThemeName] = useState<TerminalThemeName>(() => loadTerminalTheme());
  const [glassSettings, setGlassSettings] = useState<GlassSettings>(() => loadGlassSettings());
  const [boardRows, setBoardRows] = useState(false);
  const [boardElement, setBoardElement] = useState<HTMLDivElement | null>(null);
  const openTerminalIds = useMemo(() => new Set(terminalTabs.map((tab) => tab.id)), [terminalTabs]);
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const filteredTerminalTabs = useMemo(() => {
    if (!activeProject) return [];
    return terminalTabs.filter((tab) => {
      if (tab.projectId) return tab.projectId === activeProject.id;
      if (tab.promptId === activeProject.id) return true;
      const prompt = prompts.find((p) => p.id === tab.promptId);
      if (prompt) return prompt.projectId === activeProject.id;
      return tab.cwd === activeProject.path;
    });
  }, [activeProject, prompts, terminalTabs]);

  const activateTerminal = (id: string) => {
    setActiveTerminalId(id);
    setTerminalFocusKey((key) => key + 1);
  };

  const resetInitialTerminalSplitSize = () => {
    const rect = boardElement?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    if (terminalPosition === "right") setTerminalWidth(Math.floor(rect.width / 2));
    else setTerminalHeight(Math.floor(rect.height / 2));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "system" ? "" : theme;
    document.documentElement.style.colorScheme = theme === "system" ? "" : theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.glass = glassSettings.enabled ? "true" : "";
    document.documentElement.style.setProperty("--glass-opacity", String(glassSettings.opacity));
    document.documentElement.style.setProperty("--glass-blur", `${glassSettings.blur}px`);
    saveGlassSettings(glassSettings);
  }, [glassSettings]);

  useEffect(() => {
    saveTerminalTheme(terminalThemeName);
  }, [terminalThemeName]);

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
    setCollapsed(loadCollapsed(activeProjectId));
  }, [activeProjectId]);

  useEffect(() => {
    saveCollapsed(activeProjectId, collapsed);
  }, [activeProjectId, collapsed]);

  useEffect(() => {
    try { localStorage.setItem(TERMINAL_TABS_KEY, JSON.stringify(terminalTabs)); } catch {}
  }, [terminalTabs]);

  useEffect(() => {
    try {
      if (activeTerminalId) localStorage.setItem(ACTIVE_TERMINAL_TAB_KEY, activeTerminalId);
      else localStorage.removeItem(ACTIVE_TERMINAL_TAB_KEY);
    } catch {}
  }, [activeTerminalId]);

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
    if (!boardElement) return;
    const updateLayout = () => setBoardRows(boardElement.getBoundingClientRect().width < BOARD_ROWS_MAX_WIDTH);
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(boardElement);
    return () => observer.disconnect();
  }, [boardElement]);

  useEffect(() => {
    if (!boardElement || !activeTerminalId) return;
    const tab = terminalTabs.find((item) => item.id === activeTerminalId);
    if (!tab || !prompts.some((prompt) => prompt.id === tab.promptId)) return;

    const frame = requestAnimationFrame(() => {
      const promptElement = Array.from(boardElement.querySelectorAll<HTMLElement>("[data-prompt-id]")).find(
        (element) => element.dataset.promptId === tab.promptId,
      );
      promptElement?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeTerminalId, boardElement, prompts, terminalFocusKey, terminalTabs]);

  useEffect(() => {
    const updateProjectShortcuts = (event: KeyboardEvent | MouseEvent | FocusEvent) => {
      setShowProjectShortcuts(event instanceof KeyboardEvent ? event.metaKey : false);
    };

    const cycleTerminalTabs = (direction: 1 | -1) => {
      if (filteredTerminalTabs.length < 2) return;
      const current = Math.max(filteredTerminalTabs.findIndex((tab) => tab.id === activeTerminalId), 0);
      const next = (current + direction + filteredTerminalTabs.length) % filteredTerminalTabs.length;
      activateTerminal(filteredTerminalTabs[next].id);
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

      if (e.metaKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeProject) void openProjectTerminal(activeProject);
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
  }, [activeProjectId, activeTerminalId, projects, terminalTabs, filteredTerminalTabs]);

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
      projectId: prompt.projectId,
      session: prompt.tmuxSession,
      title: prompt.tmuxSession.replace(/^fractal-/, ""),
      cwd,
    };
    if (terminalTabs.length === 0) resetInitialTerminalSplitSize();
    setTerminalTabs((tabs) => tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]);
    activateTerminal(tab.id);
  }

  function reorderTerminal(fromId: string, toId: string) {
    if (fromId === toId) return;
    setTerminalTabs((tabs) => {
      const fromIndex = tabs.findIndex((tab) => tab.id === fromId);
      const toIndex = tabs.findIndex((tab) => tab.id === toId);
      if (fromIndex < 0 || toIndex < 0) return tabs;
      const next = tabs.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
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
      const nextSettings = data.settings ?? { fastModel: "", smartModel: "", agentPresets: [], defaultPresetId: "pi", helperPresetId: "", lastProjectId: "" };
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
    if (isOpeningProjectTerminal) return;
    setIsOpeningProjectTerminal(true);
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
      const tab: TerminalTab = { id: session, promptId: project.id, projectId: project.id, session, title, cwd: project.path };
      if (terminalTabs.length === 0) resetInitialTerminalSplitSize();
      setTerminalTabs((tabs) => tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]);
      activateTerminal(tab.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIsOpeningProjectTerminal(false);
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
    if ((!text && composerImagePaths.length === 0) || !activeProjectId || isAddingPrompt) return;
    setIsAddingPrompt(true);
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
    } finally {
      setIsAddingPrompt(false);
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

  async function clearDonePrompts() {
    if (!activeProjectId || isClearingDone) return;
    const doneCount = archivedPrompts.length;
    if (doneCount === 0) return;
    setIsClearingDone(true);
    try {
      const { deleted, failed } = await api<{ deleted: string[]; failed: { id: string; error: string }[] }>(`/api/projects/${activeProjectId}/done-prompts`, { method: "DELETE" });
      const deletedIds = new Set(deleted);
      setPrompts((p) => p.filter((x) => !deletedIds.has(x.id)));
      if (failed.length > 0) {
        toast.error(`Deleted ${deleted.length} DONE prompt${deleted.length === 1 ? "" : "s"}; ${failed.length} failed.`);
      } else {
        toast.success(`Cleared ${deleted.length} DONE prompt${deleted.length === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIsClearingDone(false);
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
      if (!prompt.summary) void refreshPromptSummary(id);
      const oldSession = prompts.find((x) => x.id === id)?.tmuxSession;
      if (oldSession) closeTerminal(oldSession);
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

  async function refreshPromptSummary(id: string) {
    setSummarizingIds((ids) => new Set(ids).add(id));
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/summary`, { method: "POST" });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch {
    } finally {
      setSummarizingIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
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
      if (!prompt.summary) void refreshPromptSummary(id);
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

  useEffect(() => {
    void api<{ models: PiModel[]; claudeModels: PiModel[]; opencodeModels: PiModel[] }>("/api/models")
      .then((data) => { setModels(data.models ?? []); setClaudeModels(data.claudeModels ?? []); setOpenCodeModels(data.opencodeModels ?? []); })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  const projectPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId && !p.isArchived),
    [prompts, activeProjectId],
  );
  const archivedPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId && p.isArchived),
    [prompts, activeProjectId],
  );
  const dragging = activeDragId ? prompts.find((p) => p.id === activeDragId) : null;
  const sidebarCollapsed = isSidebarCollapsed(sidebarWidth);

  return (
    <TooltipProvider>
      <Toaster richColors closeButton position="top-center" theme={theme} />
      <CommandMenu
        projects={projects}
        tabs={filteredTerminalTabs}
        activeProjectId={activeProjectId}
        activeTabId={activeTerminalId}
        home={home}
        onSelectProject={(project) => setActiveProjectId(project.id)}
        onSelectTab={(tab) => activateTerminal(tab.id)}
      />
      <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} style={{ ["--sidebar-width" as string]: `${sidebarWidth}px` }}>
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
        collapsed={sidebarCollapsed}
        showShortcuts={showProjectShortcuts && !sidebarCollapsed}
        onReorder={async (ids) => {
          const ordered = ids.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as Project[];
          setProjects(ordered);
          const data = await api<{ projects: Project[] }>("/api/projects/reorder", { method: "POST", body: JSON.stringify({ ids }) });
          setProjects(data.projects);
        }}
      />
      <main className="main">
        {!activeProject ? (
          <div className="empty-wrapper">
            <EmptyState projects={projects} onAdd={addProject} />
          </div>
        ) : (
          <>
            <div className="topbar">
              <Tooltip content={isOpeningProjectTerminal ? "Opening project terminal…" : "Open project terminal"}>
                <button type="button" className="topbar-title topbar-title-button" onClick={() => void openProjectTerminal(activeProject)} disabled={isOpeningProjectTerminal}>
                  <span className="topbar-title-row">
                    <h1>{activeProject.name}</h1>
                    {isOpeningProjectTerminal ? <span className="btn-spinner" aria-hidden="true" /> : <SquareTerminal className="topbar-title-icon" aria-hidden="true" />}
                  </span>
                  <span className="path">{tildeify(activeProject.path, home)}</span>
                </button>
              </Tooltip>
              <div className="topbar-spacer" />
              <PresetSettings
                presets={settings.agentPresets}
                defaultPresetId={settings.defaultPresetId}
                helperPresetId={settings.helperPresetId}
                onSetDefault={(id) => void saveSettings({ defaultPresetId: id })}
                onSetHelper={(id) => void saveSettings({ helperPresetId: id })}
                piModels={models}
                claudeModels={claudeModels}
                opencodeModels={opencodeModels}
                onChange={(agentPresets) => void saveSettings({ agentPresets })}
                open={presetSettingsOpen}
                onOpenChange={setPresetSettingsOpen}
              />
              <ThemeSettingsPicker
                theme={theme}
                terminalThemeName={terminalThemeName}
                onThemeChange={setTheme}
                glass={glassSettings}
                onGlassChange={setGlassSettings}
                onTerminalThemeChange={setTerminalThemeName}
              />
            </div>

            <DndContext sensors={sensors} collisionDetection={columnAwareCollisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
              <div className={`workspace workspace-${filteredTerminalTabs.length > 0 ? terminalPosition : "right"}`}>
              <div ref={setBoardElement} className={`board ${boardRows ? "board-rows" : ""}`}>
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
                      onSummarize={(id) => void refreshPromptSummary(id)}
                      summarizingIds={summarizingIds}
                      openTerminalIds={openTerminalIds}
                      activeTerminalId={activeTerminalId}
                      home={home}
                      activeId={activeDragId}
                      overId={overId}
                      collapsed={!!collapsed[col.id]}
                      onToggleCollapse={() => toggleCollapse(col.id)}
                      isArchivedCol={col.id === "ARCHIVED"}
                      onClearDone={col.id === "ARCHIVED" ? clearDonePrompts : undefined}
                      isClearingDone={col.id === "ARCHIVED" ? isClearingDone : false}
                      composer={
                        col.id === "PROMPTS" ? (
                          <Composer
                            value={composer}
                            onChange={setComposer}
                            imagePaths={composerImagePaths}
                            onImagePathsChange={setComposerImagePaths}
                            onSubmit={addPrompt}
                            isSubmitting={isAddingPrompt}
                            presets={settings.agentPresets}
                            presetId={composerPresetId}
                            onPresetChange={setComposerPresetId}
                            onCreatePreset={() => setPresetSettingsOpen(true)}
                            projectId={activeProjectId}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </div>
              {filteredTerminalTabs.length > 0 && (
                <TerminalPane
                  tabs={filteredTerminalTabs}
                  activeId={activeTerminalId}
                  position={terminalPosition}
                  size={terminalPosition === "right" ? terminalWidth : terminalHeight}
                  onResize={terminalPosition === "right" ? setTerminalWidth : setTerminalHeight}
                  onTogglePosition={() => setTerminalPosition((position) => position === "right" ? "bottom" : "right")}
                  onSelect={activateTerminal}
                  onClose={closeTerminal}
                  onReorder={reorderTerminal}
                  focusKey={terminalFocusKey}
                  theme={theme}
                  terminalThemeName={terminalThemeName}
                  glassEnabled={glassSettings.enabled}
                />
              )}
              </div>
              <DragOverlay dropAnimation={null}>
                {dragging ? <div className="overlay-card">{truncate(dragging.text, 140)}</div> : null}
              </DragOverlay>
            </DndContext>

            {/* Confirm deletion with uncommitted changes */}
            {pendingDeletePromptId && pendingDeleteChanges && <Portal>
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
            </Portal>}

            {archiveBlockedMessage && <Portal>
              <div className="modal-overlay" onClick={() => setArchiveBlockedMessage(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h2>Can't mark this worktree as done yet</h2>
                  <p>{archiveBlockedMessage}</p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => setArchiveBlockedMessage(null)}>OK</button>
                  </div>
                </div>
              </div>
            </Portal>}

          </>
        )}
      </main>
      </div>
    </TooltipProvider>
  );
}

// ---------- Components ----------


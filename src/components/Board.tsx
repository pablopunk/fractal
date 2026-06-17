import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Check,
  FolderKanban,
  FolderRoot,
  GitBranch,
  Hash,
  Menu,
  Play,
  Search,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { ApiError, api } from "~/lib/client/api.js";
import {
  type BoardLayout,
  type CommandRecent,
  type GlassSettings,
  hasLocalUiState,
  isSidebarCollapsed,
  loadActiveTerminalId,
  loadBoardLayout,
  loadCollapsed,
  loadCommandRecents,
  loadGlassSettings,
  loadLastProjectId,
  loadLastTerminalByProject,
  loadSidebarWidth,
  loadTerminalHeight,
  loadTerminalPosition,
  loadTerminalTabs,
  loadTerminalTheme,
  loadTerminalWidth,
  loadTheme,
  loadUiStateCache,
  normalizeUiState,
  saveBoardLayout,
  saveCollapsed,
  saveCommandRecents,
  saveGlassSettings,
  saveLastProjectId,
  saveSidebarWidth,
  saveTerminalHeight,
  saveTerminalPosition,
  saveTerminalTheme,
  saveTerminalWidth,
  saveTheme,
  saveUiStateCache,
  type TerminalThemeName,
  type ThemeMode,
  type UiState,
} from "~/lib/client/persistence.js";
import { terminalTabTitle } from "~/lib/client/terminal-tab-title.js";

import type {
  AppSettings,
  Column,
  DecoratedTerminalTab,
  GithubIssue,
  LinearIssue,
  ModelProfile,
  PiModel,
  Project,
  Prompt,
  TerminalTab,
} from "~/lib/client/types.js";
import AgentPanel from "./AgentPanel.js";
import AppSettingsModal from "./AppSettingsModal.js";
import {
  ColumnView,
  Composer,
  EmptyState,
  PresetSettings,
  Sidebar,
  tildeify,
  truncate,
} from "./BoardParts.js";
import CommandMenu from "./CommandMenu.js";
import EditablePromptText from "./EditablePromptText.js";
import { type BoardIssue, issueFromGithub, issueFromLinear } from "./IssueCard.js";
import Portal from "./Portal.js";
import PresetPicker from "./PresetPicker.js";
import ProjectSettingsModal from "./ProjectSettingsModal.js";
import ReconnectBanner from "./ReconnectBanner.js";
import TerminalPane from "./TerminalPane.js";
import Tooltip, { TooltipProvider } from "./Tooltip.js";

const BASE_COLUMNS: {
  id: Column;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "PROMPTS", title: "Prompts", icon: FolderRoot },
  { id: "GITHUB", title: "GitHub Issues", icon: GitBranch },
  { id: "LINEAR", title: "Linear Issues", icon: Hash },
  { id: "RUN_IN_PLACE", title: "Run in place", icon: Play },
  { id: "RUN_IN_WORKTREE", title: "Run in worktree", icon: FolderKanban },
  { id: "ARCHIVED", title: "DONE", icon: Check },
];
const BOARD_ROWS_MAX_WIDTH = 960;
const BOARD_COMPACT_MAX_WIDTH = 240;

const columnAwareCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function getProjectIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("project");
}

function getInitialProjectId(): string | null {
  return getProjectIdFromUrl() ?? (loadLastProjectId() || null);
}

function validTerminalTabs(
  tabs: TerminalTab[],
  projects: Project[],
  prompts: Prompt[],
  sessionNames: string[] | null | undefined,
): TerminalTab[] {
  if (!sessionNames) return tabs;
  const sessions = new Set(sessionNames);
  const projectIds = new Set(projects.map((project) => project.id));
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  return tabs
    .filter((tab) => {
      if (sessions.has(tab.session)) return true;
      if (!tab.cwd) return false;
      if (tab.projectId && projectIds.has(tab.projectId)) return true;
      const prompt = promptById.get(tab.promptId);
      if (prompt) return prompt.tmuxSession === tab.session && projectIds.has(prompt.projectId);
      return projectIds.has(tab.promptId);
    })
    .map((tab) => retitledTerminalTab(tab, projects, promptById));
}

function retitledTerminalTab(
  tab: TerminalTab,
  projects: Project[],
  promptById: Map<string, Prompt>,
): TerminalTab {
  if (!tab.session.startsWith("fractal-")) return tab;
  const projectId = tab.projectId ?? promptById.get(tab.promptId)?.projectId;
  const project = projects.find((p) => p.id === projectId);
  const title = terminalTabTitle(tab.session, project);
  return title === tab.title ? tab : { ...tab, title };
}

type ActiveView = { kind: "project"; id: string } | null;

export default function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [home, setHome] = useState<string>("");
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    const id = getInitialProjectId();
    return id ? { kind: "project", id } : null;
  });
  const activeProjectId = activeView?.id ?? null;
  const [composer, setComposer] = useState("");
  const [composerImagePaths, setComposerImagePaths] = useState<string[]>([]);
  const [composerPresetId, setComposerPresetId] = useState("");
  const [presetSettingsOpen, setPresetSettingsOpen] = useState(false);
  const [commandEditPromptId, setCommandEditPromptId] = useState<string | null>(null);
  const [commandEditText, setCommandEditText] = useState("");
  const [commandEditPresetId, setCommandEditPresetId] = useState("");
  const [settings, setSettings] = useState<AppSettings>({
    fastModel: "",
    smartModel: "",
    agentPresets: [],
    defaultPresetId: "pi",
    helperPresetId: "",
    lastProjectId: "",
    globalAgentPresetId: "pi",
  });
  const [models, setModels] = useState<PiModel[]>([]);
  const [claudeModels, setClaudeModels] = useState<PiModel[]>([]);
  const [opencodeModels, setOpenCodeModels] = useState<PiModel[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showSidebarPicker, setShowSidebarPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<Column, boolean>>(() =>
    loadCollapsed(getInitialProjectId()),
  );
  const [pendingDeletePromptId, setPendingDeletePromptId] = useState<string | null>(null);
  const [pendingDeleteChanges, setPendingDeleteChanges] = useState<string[] | null>(null);
  type DoneActionInfo = {
    promptId: string;
    branch: string | null;
    hasUncommitted: boolean;
    hasPr: boolean;
    isMerged: boolean;
    changes: string[];
    detail: string;
  };
  const [doneActionInfo, setDoneActionInfo] = useState<DoneActionInfo | null>(null);
  const [doneDiscardConfirm, setDoneDiscardConfirm] = useState(false);
  const [doneActionPending, setDoneActionPending] = useState<string | null>(null);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(() => loadTerminalTabs());
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(() =>
    loadActiveTerminalId(loadTerminalTabs()),
  );
  const [lastTerminalByProject, setLastTerminalByProject] = useState<Record<string, string>>(() =>
    loadLastTerminalByProject(),
  );
  const [terminalWidth, setTerminalWidth] = useState<number>(() => loadTerminalWidth());
  const [terminalHeight, setTerminalHeight] = useState<number>(() => loadTerminalHeight());
  const [terminalPosition, setTerminalPosition] = useState<"right" | "bottom">(() =>
    loadTerminalPosition(),
  );
  const [terminalFocusKey, setTerminalFocusKey] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [showProjectShortcuts, setShowProjectShortcuts] = useState(false);
  const [isClearingDone, setIsClearingDone] = useState(false);
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(() => new Set());
  const [isOpeningProjectTerminal, setIsOpeningProjectTerminal] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [appSettingsInitialTab, setAppSettingsInitialTab] = useState<
    "remote" | "appearance" | "provider" | undefined
  >(undefined);
  const [githubIssues, setGithubIssues] = useState<GithubIssue[]>([]);
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [hiddenIssueIds, setHiddenIssueIds] = useState<Set<string>>(() => new Set());
  const [tackleIssue, setTackleIssue] = useState<{
    issue: BoardIssue;
    column: Column;
    text: string;
    presetId: string;
    projectId: string;
  } | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [terminalThemeName, setTerminalThemeName] = useState<TerminalThemeName>(() =>
    loadTerminalTheme(),
  );
  const [glassSettings, setGlassSettings] = useState<GlassSettings>(() => loadGlassSettings());
  const [commandRecents, setCommandRecents] = useState<CommandRecent[]>(() => loadCommandRecents());
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(() => loadBoardLayout());
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [autoBoardRows, setAutoBoardRows] = useState(false);
  const [autoBoardCompact, setAutoBoardCompact] = useState(false);
  const [boardElement, setBoardElement] = useState<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
  );
  const shouldHydrateUiStateFromServer = useRef(!hasLocalUiState());
  const didReceiveState = useRef(false);
  const lastFetchedState = useRef<string | null>(null);
  const collapsedProjectId = useRef(activeProjectId);
  const pendingCollapsedProjectId = useRef<string | null | undefined>(undefined);
  const pendingCollapsedValue = useRef<Record<Column, boolean> | null>(null);
  const openTerminalIds = useMemo(() => new Set(terminalTabs.map((tab) => tab.id)), [terminalTabs]);
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const COLUMNS = useMemo(() => {
    const showGithub = !!activeProject?.githubRepo;
    const showLinear = !!activeProject?.showLinearIssues;
    return BASE_COLUMNS.filter((col) => {
      if (col.id === "GITHUB") return showGithub;
      if (col.id === "LINEAR") return showLinear;
      return true;
    });
  }, [activeProject?.githubRepo, activeProject?.showLinearIssues]);
  const boardRows = isMobile || boardLayout === "rows" || (boardLayout === "auto" && autoBoardRows);
  const boardCompact =
    !isMobile && (boardLayout === "compact" || (boardLayout === "auto" && autoBoardCompact));
  const boardSnug = useMemo(
    () => boardCompact || COLUMNS.every((col) => collapsed[col.id]),
    [boardCompact, collapsed, COLUMNS],
  );
  const tabBelongsToProject = (tab: TerminalTab, project: Project): boolean => {
    if (tab.projectId) return tab.projectId === project.id;
    if (tab.promptId === project.id) return true;
    const prompt = prompts.find((p) => p.id === tab.promptId);
    if (prompt) return prompt.projectId === project.id;
    return tab.cwd === project.path;
  };
  const filteredTerminalTabs = useMemo(() => {
    if (!activeProject) return [];
    return terminalTabs.filter((tab) => tabBelongsToProject(tab, activeProject));
  }, [activeProject, terminalTabs, tabBelongsToProject]);
  const decorateTerminalTab = (tab: TerminalTab): DecoratedTerminalTab => {
    const prompt = prompts.find((p) => p.id === tab.promptId);
    const label = prompt?.summary?.trim() || prompt?.text?.trim();
    const accent =
      prompt?.column === "RUN_IN_PLACE"
        ? "in-place"
        : prompt?.column === "RUN_IN_WORKTREE"
          ? "worktree"
          : undefined;
    return { ...tab, title: label ? truncate(label, 80) : tab.title, accent };
  };
  const terminalPaneTabs = useMemo(
    () => filteredTerminalTabs.map(decorateTerminalTab),
    [filteredTerminalTabs, decorateTerminalTab],
  );
  const tabsByProject = useMemo(() => {
    const map: Record<string, DecoratedTerminalTab[]> = {};
    for (const project of projects) {
      const tabs = terminalTabs
        .filter((tab) => tabBelongsToProject(tab, project))
        .map(decorateTerminalTab);
      if (tabs.length > 0) map[project.id] = tabs;
    }
    return map;
  }, [projects, terminalTabs, tabBelongsToProject, decorateTerminalTab]);
  const currentUiState = useMemo<UiState>(() => {
    const cached = loadUiStateCache();
    return normalizeUiState({
      ...cached,
      sidebarWidth,
      collapsedColumns: {
        ...cached.collapsedColumns,
        [collapsedProjectId.current || "global"]: collapsed,
      },
      terminalPosition,
      terminalWidth,
      terminalHeight,
      terminalTabs,
      activeTerminalTabId: activeTerminalId,
      theme,
      terminalTheme: terminalThemeName,
      glassSettings,
      commandRecents,
      boardLayout,
      lastProjectId: activeProjectId ?? cached.lastProjectId,
      lastTerminalByProject,
    });
  }, [
    activeProjectId,
    boardLayout,
    collapsed,
    commandRecents,
    glassSettings,
    sidebarWidth,
    terminalHeight,
    terminalPosition,
    terminalTabs,
    activeTerminalId,
    lastTerminalByProject,
    terminalThemeName,
    terminalWidth,
    theme,
  ]);

  function rememberCommandRecent(kind: CommandRecent["kind"], id: string) {
    setCommandRecents((items) =>
      [
        { kind, id, at: Date.now() },
        ...items.filter((item) => item.kind !== kind || item.id !== id),
      ].slice(0, 20),
    );
  }

  function selectProject(id: string) {
    setActiveView({ kind: "project", id });
    setSidebarOpen(false);
    rememberCommandRecent("project", id);
  }

  const activateTerminal = (id: string) => {
    setActiveTerminalId(id);
    setTerminalFocusKey((key) => key + 1);
    rememberCommandRecent("tab", id);
  };

  const selectProjectTab = (projectId: string, tabId: string) => {
    if (activeView && activeView.id !== projectId) {
      selectProject(projectId);
    }
    activateTerminal(tabId);
    setSidebarOpen(false);
  };

  function applyUiState(uiState: UiState) {
    const normalized = normalizeUiState(uiState);
    const projectId = getProjectIdFromUrl() ?? (normalized.lastProjectId || activeProjectId);
    const nextCollapsed =
      normalized.collapsedColumns[projectId || "global"] ?? normalized.collapsedColumns.global;
    setSidebarWidth(normalized.sidebarWidth);
    pendingCollapsedProjectId.current = projectId;
    pendingCollapsedValue.current = nextCollapsed;
    setCollapsed(nextCollapsed);
    setTerminalTabs(normalized.terminalTabs);
    setActiveTerminalId(normalized.activeTerminalTabId);
    setLastTerminalByProject(normalized.lastTerminalByProject);
    setTerminalWidth(normalized.terminalWidth);
    setTerminalHeight(normalized.terminalHeight);
    setTerminalPosition(normalized.terminalPosition);
    setTheme(normalized.theme);
    setTerminalThemeName(normalized.terminalTheme);
    setGlassSettings(normalized.glassSettings);
    setCommandRecents(normalized.commandRecents);
    setBoardLayout(normalized.boardLayout);
    if (!getProjectIdFromUrl() && normalized.lastProjectId) {
      setActiveView(
        normalized.lastProjectId ? { kind: "project", id: normalized.lastProjectId } : null,
      );
    }
  }

  const resizeSidebar = (width: number) => {
    saveSidebarWidth(width);
    setSidebarWidth(width);
  };

  const resizeTerminalWidth = (width: number) => {
    saveTerminalWidth(width);
    setTerminalWidth(width);
  };

  const resizeTerminalHeight = (height: number) => {
    saveTerminalHeight(height);
    setTerminalHeight(height);
  };

  const setPersistentTerminalPosition = (
    position: "right" | "bottom" | ((current: "right" | "bottom") => "right" | "bottom"),
  ) => {
    setTerminalPosition((current) => {
      const next = typeof position === "function" ? position(current) : position;
      saveTerminalPosition(next);
      return next;
    });
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
    saveCommandRecents(commandRecents);
  }, [commandRecents]);

  useEffect(() => {
    const url = new URL(window.location.href);
    saveLastProjectId(activeView ? activeView.id : null);
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
  }, [activeProjectId, activeView]);

  useEffect(() => {
    const onPopState = () => {
      const id = getProjectIdFromUrl();
      setActiveView(id ? { kind: "project", id } : null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const platform = (window as typeof window & { electron?: { platform?: string } }).electron
      ?.platform;
    if (platform === "darwin") document.documentElement.classList.add("macos");
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const nextCollapsed = loadCollapsed(activeProjectId);
    pendingCollapsedProjectId.current = activeProjectId;
    pendingCollapsedValue.current = nextCollapsed;
    setCollapsed(nextCollapsed);
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProject?.defaultPresetId) return;
    if (settings.agentPresets.some((p) => p.id === activeProject.defaultPresetId)) {
      setComposerPresetId(activeProject.defaultPresetId);
    }
  }, [activeProject?.defaultPresetId, settings.agentPresets]);

  useEffect(() => {
    if (pendingCollapsedProjectId.current !== undefined) {
      if (pendingCollapsedValue.current !== collapsed) return;
      collapsedProjectId.current = pendingCollapsedProjectId.current;
      pendingCollapsedProjectId.current = undefined;
      pendingCollapsedValue.current = null;
    }
    if (collapsedProjectId.current !== activeProjectId) return;
    saveCollapsed(activeProjectId, collapsed);
  }, [activeProjectId, collapsed]);

  useEffect(() => {
    saveUiStateCache(currentUiState);
    if (!didReceiveState.current) return;
    const timeout = window.setTimeout(() => {
      void api("/api/ui-state", {
        method: "PATCH",
        body: JSON.stringify(currentUiState),
      }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [currentUiState]);

  useEffect(() => {
    saveTerminalWidth(terminalWidth);
  }, [terminalWidth]);

  useEffect(() => {
    saveTerminalHeight(terminalHeight);
  }, [terminalHeight]);

  useEffect(() => {
    saveTerminalPosition(terminalPosition);
  }, [terminalPosition]);

  useEffect(() => {
    saveSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    saveBoardLayout(boardLayout);
  }, [boardLayout]);

  useEffect(() => {
    if (!boardElement) return;
    const updateLayout = () => {
      const workspaceWidth = boardElement.parentElement?.getBoundingClientRect().width;
      const renderedWidth = boardElement.getBoundingClientRect().width;
      const width =
        workspaceWidth && filteredTerminalTabs.length > 0 && terminalPosition === "right"
          ? Math.max(0, workspaceWidth - terminalWidth)
          : renderedWidth;
      const compact = width < BOARD_COMPACT_MAX_WIDTH;
      setAutoBoardCompact(compact);
      setAutoBoardRows(!compact && width < BOARD_ROWS_MAX_WIDTH);
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(boardElement);
    if (boardElement.parentElement) observer.observe(boardElement.parentElement);
    return () => observer.disconnect();
  }, [boardElement, filteredTerminalTabs.length, terminalPosition, terminalWidth]);

  useEffect(() => {
    if (!boardElement || !activeTerminalId) return;
    const tab = terminalTabs.find((item) => item.id === activeTerminalId);
    if (!tab || !prompts.some((prompt) => prompt.id === tab.promptId)) return;

    const frame = requestAnimationFrame(() => {
      const promptElement = Array.from(
        boardElement.querySelectorAll<HTMLElement>("[data-prompt-id]"),
      ).find((element) => element.dataset.promptId === tab.promptId);
      promptElement?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeTerminalId, boardElement, prompts, terminalTabs]);

  useEffect(() => {
    if (!activeTerminalId) return;
    const tab = terminalTabs.find((item) => item.id === activeTerminalId);
    const project = tab ? projects.find((p) => tabBelongsToProject(tab, p)) : null;
    if (!project) return;
    setLastTerminalByProject((map) =>
      map[project.id] === activeTerminalId ? map : { ...map, [project.id]: activeTerminalId },
    );
  }, [activeTerminalId, terminalTabs, projects, tabBelongsToProject]);

  useEffect(() => {
    if (!activeProject) return;
    if (activeTerminalId && filteredTerminalTabs.some((tab) => tab.id === activeTerminalId)) return;
    const remembered = lastTerminalByProject[activeProject.id];
    const restored =
      remembered && filteredTerminalTabs.some((tab) => tab.id === remembered)
        ? remembered
        : (filteredTerminalTabs[0]?.id ?? null);
    if (restored !== activeTerminalId) setActiveTerminalId(restored);
  }, [activeProject, activeTerminalId, filteredTerminalTabs, lastTerminalByProject]);

  useEffect(() => {
    const updateProjectShortcuts = (event: KeyboardEvent | MouseEvent | FocusEvent) => {
      setShowProjectShortcuts(event instanceof KeyboardEvent ? event.metaKey : false);
    };

    const cycleTerminalTabs = (direction: 1 | -1) => {
      if (filteredTerminalTabs.length < 2) return;
      const current = Math.max(
        filteredTerminalTabs.findIndex((tab) => tab.id === activeTerminalId),
        0,
      );
      const next =
        (current + direction + filteredTerminalTabs.length) % filteredTerminalTabs.length;
      activateTerminal(filteredTerminalTabs[next].id);
    };

    const selectProjectByNumber = (index: number) => {
      const project = projects[index];
      if (project) selectProject(project.id);
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
        if (activeProject) {
          void openProjectTerminal(activeProject);
        }
        return;
      }

      if (e.metaKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setAgentPanelOpen((prev) => !prev);
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
  }, [
    activeTerminalId,
    projects,
    filteredTerminalTabs,
    openProjectTerminal,
    activeProject,
    selectProject,
    activateTerminal,
  ]);

  function toggleCollapse(id: Column) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  function openTerminal(prompt: Prompt) {
    rememberCommandRecent("prompt", prompt.id);
    if (!prompt.tmuxSession) return;
    const existing = terminalTabs.find((tab) => tab.id === prompt.tmuxSession);
    if (existing) {
      activateTerminal(existing.id);
      return;
    }
    const project = projects.find((p) => p.id === prompt.projectId);
    const cwd = prompt.worktreePath ?? project?.path;
    const title = terminalTabTitle(prompt.tmuxSession, project);
    const tab: TerminalTab = {
      id: prompt.tmuxSession,
      promptId: prompt.id,
      projectId: prompt.projectId,
      session: prompt.tmuxSession,
      title,
      cwd,
    };
    setTerminalTabs((tabs) => (tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]));
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
      setActiveTerminalId((active) => (active === id ? (next.at(-1)?.id ?? null) : active));
      return next;
    });
  }

  const refresh = useCallback(async () => {
    try {
      const data = await api<{
        home: string;
        projects: Project[];
        prompts: Prompt[];
        settings: AppSettings;
        uiState?: UiState;
        terminalSessions?: string[] | null;
      }>("/api/state");

      const stateKey = JSON.stringify(data);
      if (stateKey === lastFetchedState.current) return;
      lastFetchedState.current = stateKey;

      const serverUiState = data.uiState ? normalizeUiState(data.uiState) : null;
      if (serverUiState && shouldHydrateUiStateFromServer.current) {
        const tabs = validTerminalTabs(
          serverUiState.terminalTabs,
          data.projects,
          data.prompts,
          data.terminalSessions,
        );
        const activeTerminalTabId =
          serverUiState.activeTerminalTabId &&
          tabs.some((tab) => tab.id === serverUiState.activeTerminalTabId)
            ? serverUiState.activeTerminalTabId
            : (tabs[0]?.id ?? null);
        const hydratedUiState = normalizeUiState({
          ...serverUiState,
          terminalTabs: tabs,
          activeTerminalTabId,
        });
        saveUiStateCache(hydratedUiState);
        applyUiState(hydratedUiState);
        shouldHydrateUiStateFromServer.current = false;
      } else {
        setTerminalTabs((tabs) => {
          const next = validTerminalTabs(tabs, data.projects, data.prompts, data.terminalSessions);
          setActiveTerminalId((active) =>
            active && next.some((tab) => tab.id === active) ? active : (next[0]?.id ?? null),
          );
          return next;
        });
      }
      didReceiveState.current = true;
      setProjects(data.projects);
      setPrompts(data.prompts);
      const nextSettings = data.settings ?? {
        fastModel: "",
        smartModel: "",
        agentPresets: [],
        defaultPresetId: "pi",
        helperPresetId: "",
        lastProjectId: "",
        globalAgentPresetId: "pi",
      };
      setSettings(nextSettings);
      setApiKeys(nextSettings.apiKeys ?? {});
      setComposerPresetId((cur) => {
        if (nextSettings.agentPresets.some((p) => p.id === cur)) return cur;
        if (nextSettings.agentPresets.some((p) => p.id === nextSettings.defaultPresetId))
          return nextSettings.defaultPresetId;
        return nextSettings.agentPresets[0]?.id ?? "pi";
      });
      setHome(data.home ?? "");
      setActiveView((cur) => {
        const hasProject = (id: string | null | undefined) =>
          !!id && data.projects.some((p) => p.id === id);
        const urlId = getProjectIdFromUrl();
        const curId = cur?.id ?? null;

        if (hasProject(urlId) && urlId) return { kind: "project" as const, id: urlId };
        if (hasProject(curId) && curId) return { kind: "project" as const, id: curId };

        if (serverUiState?.lastProjectId && hasProject(serverUiState.lastProjectId))
          return { kind: "project" as const, id: serverUiState.lastProjectId };
        if (hasProject(nextSettings.lastProjectId))
          return { kind: "project" as const, id: nextSettings.lastProjectId };
        return data.projects[0]?.id ? { kind: "project" as const, id: data.projects[0].id } : null;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    void api("/api/health-check", { method: "POST" }).catch(() => {});
    const interval = setInterval(() => {
      void api("/api/health-check", { method: "POST" }).catch(() => {});
      void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function addProject(path: string) {
    if (!path) return;
    try {
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      setProjects((p) => (p.find((x) => x.id === project.id) ? p : [...p, project]));
      selectProject(project.id);
      setShowSidebarPicker(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function openProjectTerminal(project: Project) {
    if (isOpeningProjectTerminal) return;
    setIsOpeningProjectTerminal(true);
    try {
      const { session, title } = await api<{ session: string; title: string }>(
        `/api/projects/${project.id}/terminal`,
        { method: "POST" },
      );
      const existing = terminalTabs.find((tab) => tab.id === session);
      if (existing) {
        if (!existing.cwd) {
          setTerminalTabs((tabs) =>
            tabs.map((tab) => (tab.id === existing.id ? { ...tab, cwd: project.path } : tab)),
          );
        }
        activateTerminal(existing.id);
        return;
      }
      const tab: TerminalTab = {
        id: session,
        promptId: project.id,
        projectId: project.id,
        session,
        title,
        cwd: project.path,
      };
      setTerminalTabs((tabs) => (tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]));
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
          const nextId = next[removedIndex]?.id ?? next[removedIndex - 1]?.id;
          setActiveView(nextId ? { kind: "project", id: nextId } : null);
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

  function buildIssuePromptText(issue: BoardIssue): string {
    const idRef = issue.kind === "github" ? `#${issue.number}` : issue.identifier;
    return `Work on ${idRef}: ${issue.title}\n${issue.url}`;
  }

  async function createPromptFromIssue(
    column: Column,
    presetId: string,
    text: string,
    projectId: string,
  ) {
    if (!projectId || (column !== "RUN_IN_PLACE" && column !== "RUN_IN_WORKTREE")) return;
    try {
      const url = `/api/projects/${projectId}/prompts`;
      const { prompt } = await api<{ prompt: Prompt }>(url, {
        method: "POST",
        body: JSON.stringify({
          text,
          presetId,
        }),
      });
      setPrompts((p) => [...p, { ...prompt, column }]);
      void launchCreated(prompt.id, column);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function launchCreated(id: string, column: Column) {
    const url =
      column === "RUN_IN_PLACE"
        ? `/api/prompts/${id}/run-in-place`
        : `/api/prompts/${id}/run-in-worktree`;
    try {
      const { prompt } = await api<{ prompt: Prompt }>(url, { method: "POST" });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
      if (!prompt.summary) void refreshPromptSummary(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function deletePrompt(id: string, force = false) {
    try {
      await api(`/api/prompts/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ force }),
      });
      setPrompts((p) => p.filter((x) => x.id !== id));
      setPendingDeletePromptId(null);
      setPendingDeleteChanges(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const json = e.body as { hasUncommitted?: boolean; changes?: string[] };
        if (json.hasUncommitted) {
          setPendingDeletePromptId(id);
          setPendingDeleteChanges(json.changes ?? []);
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function clearDonePrompts() {
    if (!activeProjectId || isClearingDone) return;
    const doneCount = archivedPrompts.length;
    if (doneCount === 0) return;
    setIsClearingDone(true);
    try {
      const { deleted, failed } = await api<{
        deleted: string[];
        failed: { id: string; error: string }[];
      }>(`/api/projects/${activeProjectId}/done-prompts`, { method: "DELETE" });
      const deletedIds = new Set(deleted);
      setPrompts((p) => p.filter((x) => !deletedIds.has(x.id)));
      if (failed.length > 0) {
        toast.error(
          `Deleted ${deleted.length} DONE prompt${deleted.length === 1 ? "" : "s"}; ${failed.length} failed.`,
        );
      } else {
        toast.success(`Cleared ${deleted.length} DONE prompt${deleted.length === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIsClearingDone(false);
    }
  }

  async function editPrompt(
    id: string,
    patch: { text?: string; modelProfile?: ModelProfile; presetId?: string },
  ) {
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

  function openCommandPromptEditor(prompt: Prompt) {
    setCommandEditPromptId(prompt.id);
    setCommandEditText(prompt.text);
    setCommandEditPresetId(prompt.presetId);
  }

  function closeCommandPromptEditor() {
    setCommandEditPromptId(null);
    setCommandEditText("");
    setCommandEditPresetId("");
  }

  async function saveCommandPromptEditor() {
    if (!commandEditPromptId || !commandEditText.trim()) return;
    await editPrompt(commandEditPromptId, { text: commandEditText, presetId: commandEditPresetId });
    closeCommandPromptEditor();
  }

  async function archivePrompt(id: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, {
        method: "POST",
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
      if (!prompt.summary) void refreshPromptSummary(id);
      const oldSession = prompts.find((x) => x.id === id)?.tmuxSession;
      if (oldSession) closeTerminal(oldSession);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as {
          detail: string;
          branch?: string;
          hasUncommitted?: boolean;
          hasPr?: boolean;
          isMerged?: boolean;
          changes?: string[];
        };
        setDoneActionInfo({
          promptId: id,
          branch: body.branch ?? null,
          hasUncommitted: body.hasUncommitted ?? false,
          hasPr: body.hasPr ?? false,
          isMerged: body.isMerged ?? false,
          changes: body.changes ?? [],
          detail: body.detail ?? e.message,
        });
        setDoneDiscardConfirm(false);
        return;
      }
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function archiveWithAction(id: string, action: string) {
    if (doneActionPending) return;
    setDoneActionPending(action);
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
      if (!prompt.summary) void refreshPromptSummary(id);
      const oldSession = prompts.find((x) => x.id === id)?.tmuxSession;
      if (oldSession) closeTerminal(oldSession);
      setDoneActionInfo(null);
      setDoneDiscardConfirm(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setDoneActionPending(null);
    }
  }

  async function unarchivePrompt(id: string) {
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/archive`, {
        method: "DELETE",
      });
      setPrompts((p) => p.map((x) => (x.id === id ? prompt : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshPromptSummary(id: string, force = false) {
    setSummarizingIds((ids) => new Set(ids).add(id));
    try {
      const { prompt } = await api<{ prompt: Prompt }>(`/api/prompts/${id}/summary`, {
        method: "POST",
        body: JSON.stringify({ force }),
      });
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
    if (target !== "RUN_IN_PLACE" && target !== "RUN_IN_WORKTREE") return;
    const url =
      target === "RUN_IN_PLACE"
        ? `/api/prompts/${id}/run-in-place`
        : `/api/prompts/${id}/run-in-worktree`;
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
    setPrompts((p) =>
      p.map((x) => (x.id === id ? { ...x, column: "PROMPTS", isArchived: false } : x)),
    );
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
  function onDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }
  function onDragOver(e: {
    active: { id: string | number };
    over: { id: string | number } | null;
  }) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function onDragEnd(e: DragEndEvent) {
    setOverId(null);
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle issue drags
    if (activeId.startsWith("gh:") || activeId.startsWith("li:")) {
      const issue = boardIssues.find((item) => item.id === activeId)?.issue;
      if (!issue || !activeProjectId) return;
      const overCol = overId as Column;
      if (overCol === "RUN_IN_PLACE" || overCol === "RUN_IN_WORKTREE") {
        // Hidden after modal confirmation
        const issueText = buildIssuePromptText(issue);
        setTackleIssue({
          issue,
          column: overCol,
          text: issueText,
          presetId: activeProject?.defaultPresetId || settings.defaultPresetId,
          projectId: activeProjectId,
        });
        return;
      }
      if (overCol === "ARCHIVED") {
        setHiddenIssueIds((ids) => new Set(ids).add(issue.id));
        return;
      }
      // Dropped on another issue or a prompt in PROMPTS — just reorder visually
      const overPrompt = prompts.find((p) => p.id === overId);
      if (overPrompt && overPrompt.column !== "PROMPTS") {
        // Hidden after modal confirmation
        const issueText = buildIssuePromptText(issue);
        setTackleIssue({
          issue,
          column: overPrompt.column,
          text: issueText,
          presetId: activeProject?.defaultPresetId || settings.defaultPresetId,
          projectId: activeProjectId,
        });
      }
      return;
    }

    const activePrompt = prompts.find((p) => p.id === activeId);
    if (!activePrompt) return;

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
        } else if (
          overPrompt.column === "RUN_IN_PLACE" ||
          overPrompt.column === "RUN_IN_WORKTREE"
        ) {
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
            const others = prev.filter(
              (p) => p.column !== activePrompt.column || p.projectId !== activeProjectId,
            );
            return [...others, ...reordered];
          });
        }
        return;
      }
      // Dropped on a card in a different column → treat as drop on that column
      const target = overPrompt.column;
      if (target === "GITHUB" || target === "LINEAR") return;
      if (target === "PROMPTS") {
        void moveToPrompts(activeId);
      } else if (activePrompt.column !== target && activePrompt.column === "PROMPTS") {
        void launch(activeId, target);
      }
      return;
    }

    // Dropped on a column
    const target = overId as Column;
    if (target === "GITHUB" || target === "LINEAR") return;
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

  async function saveProjectSettings(patch: Record<string, unknown>, keepOpen = false) {
    try {
      const { project } = await api<{ project: Project }>(`/api/projects/${activeProject?.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setProjects((p) => p.map((x) => (x.id === project.id ? project : x)));
      if (!keepOpen) setProjectSettingsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
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
    void api<{ models: PiModel[]; claudeModels: PiModel[]; opencodeModels: PiModel[] }>(
      "/api/models",
    )
      .then((data) => {
        setModels(data.models ?? []);
        setClaudeModels(data.claudeModels ?? []);
        setOpenCodeModels(data.opencodeModels ?? []);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  const refreshIssues = useCallback(async () => {
    if (!activeProject) return;
    setLoadingIssues(true);
    try {
      const [gh, li] = await Promise.all([
        activeProject.githubRepo
          ? api<{ issues: GithubIssue[] }>(`/api/projects/${activeProject.id}/github-issues`)
              .then((d) => d.issues)
              .catch(() => [] as GithubIssue[])
          : Promise.resolve([] as GithubIssue[]),
        activeProject.showLinearIssues
          ? api<{ issues: LinearIssue[] }>(`/api/projects/${activeProject.id}/linear-issues`)
              .then((d) => d.issues)
              .catch(() => [] as LinearIssue[])
          : Promise.resolve([] as LinearIssue[]),
      ]);
      setGithubIssues(gh);
      setLinearIssues(li);
      setHiddenIssueIds(new Set());
    } finally {
      setLoadingIssues(false);
    }
  }, [activeProjectId, activeProject?.githubRepo, activeProject?.showLinearIssues]);

  useEffect(() => {
    if (!activeProject) {
      setGithubIssues([]);
      setLinearIssues([]);
      setHiddenIssueIds(new Set());
      return;
    }
    void refreshIssues();
  }, [activeProject?.id, activeProject?.githubRepo, activeProject?.showLinearIssues]);

  useEffect(() => {
    setTackleIssue(null);
  }, [activeProjectId]);

  const githubBoardIssues: Array<{ id: string; issue: BoardIssue }> = useMemo(() => {
    if (!activeProject) return [];
    return githubIssues
      .map(issueFromGithub)
      .filter((issue) => !hiddenIssueIds.has(issue.id))
      .map((issue) => ({ id: issue.id, issue }));
  }, [githubIssues, hiddenIssueIds, activeProject]);
  const linearBoardIssues: Array<{ id: string; issue: BoardIssue }> = useMemo(() => {
    if (!activeProject) return [];
    return linearIssues
      .map(issueFromLinear)
      .filter((issue) => !hiddenIssueIds.has(issue.id))
      .map((issue) => ({ id: issue.id, issue }));
  }, [linearIssues, hiddenIssueIds, activeProject]);
  const boardIssues = useMemo(
    () => [...githubBoardIssues, ...linearBoardIssues],
    [githubBoardIssues, linearBoardIssues],
  );

  const projectPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId && !p.isArchived),
    [prompts, activeProjectId],
  );
  const archivedPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId && p.isArchived),
    [prompts, activeProjectId],
  );
  const commandMenuPrompts = useMemo(
    () => prompts.filter((p) => p.projectId === activeProjectId),
    [prompts, activeProjectId],
  );
  const commandEditPrompt = commandEditPromptId
    ? (prompts.find((p) => p.id === commandEditPromptId) ?? null)
    : null;
  const dragging = activeDragId ? prompts.find((p) => p.id === activeDragId) : null;
  const draggingIssue = activeDragId
    ? (boardIssues.find((item) => item.id === activeDragId)?.issue ?? null)
    : null;
  const sidebarCollapsed = isSidebarCollapsed(sidebarWidth);
  const effectiveTerminalPosition = isMobile ? "bottom" : terminalPosition;
  const effectiveTerminalSize = isMobile
    ? terminalHeight
    : terminalPosition === "right"
      ? terminalWidth
      : terminalHeight;
  const resizeEffectiveTerminal = isMobile
    ? resizeTerminalHeight
    : terminalPosition === "right"
      ? resizeTerminalWidth
      : resizeTerminalHeight;

  return (
    <TooltipProvider>
      <Toaster richColors closeButton position="top-center" theme={theme} />
      <CommandMenu
        projects={projects}
        prompts={commandMenuPrompts}
        activeProjectId={activeProjectId}
        activeTabId={activeTerminalId}
        tabs={filteredTerminalTabs}
        home={home}
        commandRecents={commandRecents}
        isAgentView={false}
        forceOpen={commandMenuOpen}
        onForceOpenChange={setCommandMenuOpen}
        onSelectProject={(project) => selectProject(project.id)}
        onOpenPromptTerminal={openTerminal}
        onRunPrompt={(prompt, target) => void launch(prompt.id, target)}
        onArchivePrompt={(prompt) => void archivePrompt(prompt.id)}
        onDeletePrompt={(prompt) => void deletePrompt(prompt.id)}
        onEditPrompt={openCommandPromptEditor}
      />
      <div
        className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
        style={{ ["--sidebar-width" as string]: `${sidebarWidth}px` }}
      >
        <Sidebar
          projects={projects}
          activeId={activeProjectId}
          activeView={null}
          onSelect={selectProject}
          onRemove={removeProject}
          onAdd={addProject}
          showPicker={showSidebarPicker}
          setShowPicker={setShowSidebarPicker}
          home={home}
          onResize={resizeSidebar}
          collapsed={sidebarCollapsed}
          showShortcuts={showProjectShortcuts && !sidebarCollapsed}
          mobileOpen={isMobile ? sidebarOpen : undefined}
          onMobileClose={() => setSidebarOpen(false)}
          tabsByProject={tabsByProject}
          activeTabId={activeTerminalId}
          onSelectTab={selectProjectTab}
          onReorderTabs={reorderTerminal}
          onReorder={async (ids) => {
            const ordered = ids
              .map((id) => projects.find((p) => p.id === id))
              .filter(Boolean) as Project[];
            setProjects(ordered);
            const data = await api<{ projects: Project[] }>("/api/projects/reorder", {
              method: "POST",
              body: JSON.stringify({ ids }),
            });
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
              <ReconnectBanner />
              <div className="topbar">
                {isMobile && (
                  <button
                    type="button"
                    className="hamburger-btn"
                    onClick={() => setSidebarOpen((o) => !o)}
                    aria-label="Toggle menu"
                  >
                    <Menu size={18} />
                  </button>
                )}
                {isMobile && (
                  <button
                    type="button"
                    className="hamburger-btn"
                    onClick={() => setCommandMenuOpen(true)}
                    aria-label="Search"
                  >
                    <Search size={18} />
                  </button>
                )}
                <Tooltip
                  content={
                    isOpeningProjectTerminal ? "Opening project terminal…" : "Open project terminal"
                  }
                >
                  <button
                    type="button"
                    className="topbar-title topbar-title-button"
                    onClick={() => void openProjectTerminal(activeProject)}
                    disabled={isOpeningProjectTerminal}
                  >
                    <span className="topbar-title-row">
                      {isOpeningProjectTerminal ? (
                        <span className="btn-spinner" aria-hidden="true" />
                      ) : (
                        <SquareTerminal className="topbar-title-icon" aria-hidden="true" />
                      )}
                      <h1>{activeProject.name}</h1>
                    </span>
                    <span className="path">{tildeify(activeProject.path, home)}</span>
                  </button>
                </Tooltip>
                <Tooltip content="Project settings">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setProjectSettingsOpen(true)}
                    aria-label="Project settings"
                  >
                    <Settings size={15} />
                  </button>
                </Tooltip>
                <div className="topbar-spacer" />
                <PresetSettings
                  presets={settings.agentPresets}
                  defaultPresetId={settings.defaultPresetId}
                  helperPresetId={settings.helperPresetId}
                  globalAgentPresetId={settings.globalAgentPresetId}
                  onSetDefault={(id) => void saveSettings({ defaultPresetId: id })}
                  onSetHelper={(id) => void saveSettings({ helperPresetId: id })}
                  onSetGlobalAgent={(id) => void saveSettings({ globalAgentPresetId: id })}
                  piModels={models}
                  claudeModels={claudeModels}
                  opencodeModels={opencodeModels}
                  onChange={(agentPresets) => void saveSettings({ agentPresets })}
                  open={presetSettingsOpen}
                  onOpenChange={setPresetSettingsOpen}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setAppSettingsOpen(true)}
                  aria-label="App settings"
                  title="App settings"
                >
                  <Settings size={15} />
                </button>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={columnAwareCollisionDetection}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
              >
                <div
                  className={`workspace workspace-${filteredTerminalTabs.length > 0 ? effectiveTerminalPosition : "right"}`}
                >
                  <div
                    ref={setBoardElement}
                    className={`board ${boardRows ? "board-rows" : ""} ${boardCompact ? "board-compact" : ""} ${boardSnug ? "board-snug" : ""}`}
                  >
                    {COLUMNS.map((col) => {
                      const colPrompts =
                        col.id === "ARCHIVED"
                          ? archivedPrompts
                          : projectPrompts.filter((p) => p.column === col.id);
                      const isIssueCol = col.id === "GITHUB" || col.id === "LINEAR";
                      const colItemCount =
                        col.id === "GITHUB"
                          ? githubBoardIssues.length
                          : col.id === "LINEAR"
                            ? linearBoardIssues.length
                            : colPrompts.length;
                      const colEmpty = colItemCount === 0 && col.id !== "PROMPTS";
                      return (
                        <ColumnView
                          key={col.id}
                          id={col.id}
                          title={col.title}
                          icon={col.icon}
                          prompts={isIssueCol ? [] : colPrompts}
                          presets={settings.agentPresets}
                          onDelete={deletePrompt}
                          onEdit={editPrompt}
                          onArchive={archivePrompt}
                          onUnarchive={unarchivePrompt}
                          onOpenTerminal={openTerminal}
                          onSummarize={(id) => void refreshPromptSummary(id, true)}
                          summarizingIds={summarizingIds}
                          openTerminalIds={openTerminalIds}
                          activeTerminalId={activeTerminalId}
                          home={home}
                          activeId={activeDragId}
                          overId={overId}
                          collapsed={colEmpty ? false : !!collapsed[col.id]}
                          compact={boardCompact}
                          onToggleCollapse={colEmpty ? undefined : () => toggleCollapse(col.id)}
                          isArchivedCol={col.id === "ARCHIVED"}
                          onClearDone={col.id === "ARCHIVED" ? clearDonePrompts : undefined}
                          isClearingDone={col.id === "ARCHIVED" ? isClearingDone : false}
                          onRefreshIssues={isIssueCol ? refreshIssues : undefined}
                          loadingIssues={isIssueCol ? loadingIssues : false}
                          issueSection={
                            isIssueCol && loadingIssues ? (
                              <div className="issue-section-loading">Loading issues…</div>
                            ) : undefined
                          }
                          issueItems={
                            col.id === "GITHUB"
                              ? githubBoardIssues
                              : col.id === "LINEAR"
                                ? linearBoardIssues
                                : undefined
                          }
                          itemCount={
                            col.id === "GITHUB"
                              ? githubBoardIssues.length
                              : col.id === "LINEAR"
                                ? linearBoardIssues.length
                                : undefined
                          }
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
                      tabs={terminalPaneTabs}
                      activeId={activeTerminalId}
                      position={effectiveTerminalPosition}
                      size={effectiveTerminalSize}
                      snug={!isMobile && boardSnug && terminalPosition === "right"}
                      onResize={resizeEffectiveTerminal}
                      onTogglePosition={() =>
                        setPersistentTerminalPosition((position) =>
                          position === "right" ? "bottom" : "right",
                        )
                      }
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
                  {dragging ? (
                    <motion.div
                      className="overlay-card"
                      initial={{ rotate: 0, scale: 1 }}
                      animate={{ rotate: -1.2, scale: 1.03 }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
                    >
                      {truncate(dragging.text, 140)}
                    </motion.div>
                  ) : null}
                  {draggingIssue ? (
                    <motion.div
                      className="overlay-card issue-overlay"
                      initial={{ rotate: 0, scale: 1 }}
                      animate={{ rotate: -1.2, scale: 1.03 }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
                    >
                      {truncate(draggingIssue.title, 140)}
                    </motion.div>
                  ) : null}
                </DragOverlay>
              </DndContext>

              {/* Tackle issue modal */}
              {tackleIssue && (
                <Portal>
                  <div className="modal-overlay" onClick={() => setTackleIssue(null)}>
                    <div
                      className="modal"
                      onClick={(e) => e.stopPropagation()}
                      style={{ maxWidth: 480 }}
                    >
                      <h2>Tackle issue</h2>
                      <p style={{ fontSize: 13, marginBottom: 4, color: "var(--text-faint)" }}>
                        Tackling{" "}
                        <strong>
                          {tackleIssue.issue.kind === "github"
                            ? `#${tackleIssue.issue.number}`
                            : tackleIssue.issue.identifier}
                        </strong>{" "}
                        — {tackleIssue.issue.title}
                      </p>
                      <p style={{ fontSize: 12, marginBottom: 12, color: "var(--text-faint)" }}>
                        Choose a preset and review the prompt text below.
                      </p>
                      <EditablePromptText
                        value={tackleIssue.text}
                        onChange={(v) => setTackleIssue({ ...tackleIssue, text: v })}
                        autoFocus
                        ariaLabel="Prompt text"
                        placeholder="Prompt text"
                        className="modal-prompt-editor"
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Escape") {
                            setTackleIssue(null);
                            return;
                          }
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            if (!tackleIssue.presetId || !tackleIssue.text.trim()) return;
                            const ti = tackleIssue;
                            setTackleIssue(null);
                            setHiddenIssueIds((ids) => new Set(ids).add(ti.issue.id));
                            void createPromptFromIssue(
                              ti.column,
                              ti.presetId,
                              ti.text,
                              ti.projectId,
                            );
                          }
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                        <PresetPicker
                          presets={settings.agentPresets}
                          value={tackleIssue.presetId}
                          onChange={(id) => setTackleIssue({ ...tackleIssue, presetId: id })}
                          onCreate={() => setPresetSettingsOpen(true)}
                        />
                        <div style={{ flex: 1 }} />
                        <button className="btn ghost" onClick={() => setTackleIssue(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn primary"
                          disabled={!tackleIssue.presetId || !tackleIssue.text.trim()}
                          onClick={() => {
                            const ti = tackleIssue;
                            setTackleIssue(null);
                            setHiddenIssueIds((ids) => new Set(ids).add(ti.issue.id));
                            void createPromptFromIssue(
                              ti.column,
                              ti.presetId,
                              ti.text,
                              ti.projectId,
                            );
                          }}
                        >
                          Tackle
                        </button>
                      </div>
                    </div>
                  </div>
                </Portal>
              )}

              {/* Confirm deletion with uncommitted changes */}
              {pendingDeletePromptId && pendingDeleteChanges && (
                <Portal>
                  <div
                    className="modal-overlay"
                    onClick={() => {
                      setPendingDeletePromptId(null);
                      setPendingDeleteChanges(null);
                    }}
                  >
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                      <h2>Confirm deletion</h2>
                      <p>This worktree has uncommitted changes:</p>
                      <div
                        className="changes-list"
                        style={{
                          maxHeight: 200,
                          overflowY: "auto",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: 4,
                          padding: 8,
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          marginBottom: 16,
                        }}
                      >
                        {pendingDeleteChanges.map((line, i) => (
                          <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {line}
                          </div>
                        ))}
                      </div>
                      <p style={{ color: "var(--text-faint)", fontSize: 12 }}>
                        Are you sure you want to delete this prompt and discard these changes?
                      </p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          className="btn ghost"
                          onClick={() => {
                            setPendingDeletePromptId(null);
                            setPendingDeleteChanges(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn danger"
                          onClick={() => void deletePrompt(pendingDeletePromptId, true)}
                        >
                          Delete & Discard Changes
                        </button>
                      </div>
                    </div>
                  </div>
                </Portal>
              )}

              {commandEditPrompt && (
                <Portal>
                  <div className="modal-overlay" onClick={closeCommandPromptEditor}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                      <h2>Edit prompt</h2>
                      <EditablePromptText
                        value={commandEditText}
                        onChange={setCommandEditText}
                        autoFocus
                        ariaLabel="Original prompt text"
                        placeholder="Prompt text"
                        className="modal-prompt-editor"
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Escape") closeCommandPromptEditor();
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                            void saveCommandPromptEditor();
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <PresetPicker
                          presets={settings.agentPresets}
                          value={commandEditPresetId}
                          onChange={setCommandEditPresetId}
                          onCreate={() => setPresetSettingsOpen(true)}
                        />
                        <div style={{ flex: 1 }} />
                        <button className="btn ghost" onClick={closeCommandPromptEditor}>
                          Cancel
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => void saveCommandPromptEditor()}
                          disabled={!commandEditText.trim()}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </Portal>
              )}

              {doneActionInfo && (
                <Portal>
                  <div
                    className="modal-overlay"
                    onClick={() => {
                      setDoneActionInfo(null);
                      setDoneDiscardConfirm(false);
                    }}
                  >
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                      <h2>Worktree needs action</h2>
                      <p className="done-action-detail">{doneActionInfo.detail}</p>
                      {doneActionInfo.branch && (
                        <p
                          className="done-action-meta"
                          style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}
                        >
                          Branch: <code>{doneActionInfo.branch}</code>
                        </p>
                      )}
                      <div className="done-action-buttons">
                        {!doneActionInfo.hasPr && !doneActionInfo.hasUncommitted && (
                          <button
                            className="btn primary"
                            disabled={!!doneActionPending}
                            onClick={() =>
                              void archiveWithAction(doneActionInfo.promptId, "create-pr")
                            }
                          >
                            {doneActionPending === "create-pr" && (
                              <span className="btn-spinner" aria-hidden="true" />
                            )}
                            {doneActionPending === "create-pr" ? "Creating PR…" : "Create PR"}
                          </button>
                        )}
                        {!doneActionInfo.isMerged && !doneActionInfo.hasUncommitted && (
                          <button
                            className="btn"
                            disabled={!!doneActionPending}
                            onClick={() =>
                              void archiveWithAction(doneActionInfo.promptId, "merge-main")
                            }
                          >
                            {doneActionPending === "merge-main" && (
                              <span className="btn-spinner" aria-hidden="true" />
                            )}
                            {doneActionPending === "merge-main" ? "Merging…" : "Merge to main"}
                          </button>
                        )}
                        {!doneDiscardConfirm ? (
                          <button
                            className="btn danger"
                            disabled={!!doneActionPending}
                            onClick={() => setDoneDiscardConfirm(true)}
                          >
                            Discard
                          </button>
                        ) : (
                          <>
                            <span style={{ fontSize: 12, color: "var(--danger)" }}>
                              This permanently discards the worktree and any uncommitted changes.
                            </span>
                            <button
                              className="btn danger"
                              disabled={!!doneActionPending}
                              onClick={() =>
                                void archiveWithAction(doneActionInfo.promptId, "discard")
                              }
                            >
                              {doneActionPending === "discard" && (
                                <span className="btn-spinner" aria-hidden="true" />
                              )}
                              {doneActionPending === "discard"
                                ? "Discarding…"
                                : "Yes, discard everything"}
                            </button>
                          </>
                        )}
                        <button
                          className="btn ghost"
                          disabled={!!doneActionPending}
                          onClick={() => {
                            setDoneActionInfo(null);
                            setDoneDiscardConfirm(false);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </Portal>
              )}

              {appSettingsOpen && (
                <AppSettingsModal
                  onClose={() => {
                    setAppSettingsOpen(false);
                    setAppSettingsInitialTab(undefined);
                  }}
                  theme={theme}
                  terminalThemeName={terminalThemeName}
                  boardLayout={boardLayout}
                  onThemeChange={setTheme}
                  glass={glassSettings}
                  onGlassChange={setGlassSettings}
                  onTerminalThemeChange={setTerminalThemeName}
                  onBoardLayoutChange={setBoardLayout}
                  apiKeys={apiKeys}
                  onApiKeysChange={(keys) => {
                    setApiKeys(keys);
                    void saveSettings({ apiKeys: keys });
                  }}
                  initialTab={appSettingsInitialTab}
                />
              )}

              {projectSettingsOpen && activeProject && (
                <ProjectSettingsModal
                  project={activeProject}
                  presets={settings.agentPresets}
                  onClose={() => setProjectSettingsOpen(false)}
                  onSave={saveProjectSettings}
                />
              )}
            </>
          )}
          <AgentPanel
            open={agentPanelOpen}
            onToggle={() => setAgentPanelOpen((prev) => !prev)}
            apiKeys={apiKeys}
            onOpenSettings={() => {
              setAppSettingsInitialTab("provider");
              setAppSettingsOpen(true);
            }}
          />
        </main>
      </div>
    </TooltipProvider>
  );
}

// ---------- Components ----------

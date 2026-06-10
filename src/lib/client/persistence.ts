import type { Column, TerminalTab } from "./types.js";

export type CommandRecent = { kind: "project" | "prompt" | "tab"; id: string; at: number };

export const COLLAPSED_KEY = "fractal:collapsedColumns";
export const PROJECT_COLLAPSED_KEY_PREFIX = "fractal:collapsedColumns:";
export const TERMINAL_TABS_KEY = "fractal:terminalTabs";
export const ACTIVE_TERMINAL_TAB_KEY = "fractal:activeTerminalTab";
export const TERMINAL_WIDTH_KEY = "fractal:terminalWidth";
export const TERMINAL_HEIGHT_KEY = "fractal:terminalHeight";
export const TERMINAL_POSITION_KEY = "fractal:terminalPosition";
export const SIDEBAR_WIDTH_KEY = "fractal:sidebarWidth";
export const THEME_KEY = "fractal:theme";
export const TERMINAL_THEME_KEY = "fractal:terminalTheme";
export const GLASS_SETTINGS_KEY = "fractal:glassSettings";
export const COMMAND_RECENTS_KEY = "fractal:commandRecents";
export const BOARD_LAYOUT_KEY = "fractal:boardLayout";
export const LAST_PROJECT_ID_KEY = "fractal:lastProjectId";
export const UI_STATE_KEY = "fractal:uiState";
export type ThemeMode = "system" | "light" | "dark";
export type GlassSettings = { enabled: boolean; opacity: number; blur: number; version?: number };
export type TerminalThemeName = "fractal" | "catppuccin" | "tokyo-night" | "solarized";
export type BoardLayout = "auto" | "rows" | "compact";
export type UiState = {
  version: 1;
  sidebarWidth: number;
  collapsedColumns: Record<string, Record<Column, boolean>>;
  terminalPosition: "right" | "bottom";
  terminalWidth: number;
  terminalHeight: number;
  terminalTabs: TerminalTab[];
  activeTerminalTabId: string | null;
  theme: ThemeMode;
  terminalTheme: TerminalThemeName;
  glassSettings: GlassSettings;
  commandRecents: CommandRecent[];
  boardLayout: BoardLayout;
  lastProjectId: string;
};
export const SIDEBAR_COLLAPSED_WIDTH = 56;
export const SIDEBAR_COLLAPSE_THRESHOLD = 132;
export const SIDEBAR_MIN_WIDTH = 176;
export const SIDEBAR_MAX_WIDTH = 260;

const DEFAULT_COLLAPSED = { PROMPTS: false, RUN_IN_PLACE: false, RUN_IN_WORKTREE: false, GITHUB: false, LINEAR: false, ARCHIVED: true } as Record<Column, boolean>;

const LEGACY_KEYS = [
  COLLAPSED_KEY,
  TERMINAL_TABS_KEY,
  ACTIVE_TERMINAL_TAB_KEY,
  TERMINAL_WIDTH_KEY,
  TERMINAL_HEIGHT_KEY,
  TERMINAL_POSITION_KEY,
  SIDEBAR_WIDTH_KEY,
  THEME_KEY,
  TERMINAL_THEME_KEY,
  GLASS_SETTINGS_KEY,
  COMMAND_RECENTS_KEY,
  BOARD_LAYOUT_KEY,
  LAST_PROJECT_ID_KEY,
];

function collapsedKey(projectId: string | null | undefined): string {
  return projectId ? `${PROJECT_COLLAPSED_KEY_PREFIX}${projectId}` : COLLAPSED_KEY;
}

function storageGet(key: string): string | null {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null; } catch { return null; }
}

function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

function storageRemove(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function validColumnMap(value: unknown): Record<Column, boolean> {
  if (!value || typeof value !== "object") return { ...DEFAULT_COLLAPSED };
  return { ...DEFAULT_COLLAPSED, ...(value as Partial<Record<Column, boolean>>) };
}

export function hasLocalUiState(): boolean {
  if (typeof localStorage === "undefined") return false;
  if (storageGet(UI_STATE_KEY)) return true;
  if (LEGACY_KEYS.some((key) => storageGet(key) !== null)) return true;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      if (localStorage.key(i)?.startsWith(PROJECT_COLLAPSED_KEY_PREFIX)) return true;
    }
  } catch {}
  return false;
}

export function loadCollapsed(projectId?: string | null): Record<Column, boolean> {
  const uiState = loadStoredUiState();
  if (uiState) return validColumnMap(uiState.collapsedColumns[projectId || "global"]);
  return validColumnMap(parseJson(storageGet(collapsedKey(projectId)), DEFAULT_COLLAPSED));
}

export function saveCollapsed(projectId: string | null | undefined, collapsed: Record<Column, boolean>): void {
  const key = projectId || "global";
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, collapsedColumns: { ...uiState.collapsedColumns, [key]: validColumnMap(collapsed) } });
  storageSet(collapsedKey(projectId), JSON.stringify(collapsed));
}

export function loadTerminalTabs(): TerminalTab[] {
  const uiState = loadStoredUiState();
  if (uiState) return uiState.terminalTabs;
  const parsed = parseJson<unknown>(storageGet(TERMINAL_TABS_KEY), []);
  return Array.isArray(parsed) ? parsed.filter(isTerminalTab) : [];
}

function isTerminalTab(value: unknown): value is TerminalTab {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TerminalTab>;
  return typeof item.id === "string" && typeof item.promptId === "string" && typeof item.session === "string" && typeof item.title === "string";
}

function isCommandRecent(value: unknown): value is CommandRecent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CommandRecent>;
  return (item.kind === "project" || item.kind === "prompt" || item.kind === "tab") && typeof item.id === "string" && typeof item.at === "number";
}

export function loadCommandRecents(): CommandRecent[] {
  const uiState = loadStoredUiState();
  if (uiState) return uiState.commandRecents;
  const parsed = parseJson<unknown>(storageGet(COMMAND_RECENTS_KEY), []);
  return Array.isArray(parsed) ? parsed.filter(isCommandRecent) : [];
}

export function saveCommandRecents(recents: CommandRecent[]): void {
  storageSet(COMMAND_RECENTS_KEY, JSON.stringify(recents.slice(0, 20)));
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, commandRecents: recents.slice(0, 20) });
}

export function loadActiveTerminalId(tabs: TerminalTab[]): string | null {
  const uiState = loadStoredUiState();
  const raw = uiState?.activeTerminalTabId ?? storageGet(ACTIVE_TERMINAL_TAB_KEY);
  return raw && tabs.some((tab) => tab.id === raw) ? raw : tabs[0]?.id ?? null;
}

function halfViewportWidth(): number {
  return typeof window === "undefined" ? 520 : Math.floor(window.innerWidth / 2);
}

function halfViewportHeight(): number {
  return typeof window === "undefined" ? 320 : Math.floor(window.innerHeight / 2);
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function loadTerminalWidth(): number {
  const fallback = halfViewportWidth();
  const uiState = loadStoredUiState();
  if (uiState) return finiteNumber(uiState.terminalWidth, fallback);
  return finiteNumber(storageGet(TERMINAL_WIDTH_KEY), fallback);
}

export function saveTerminalWidth(width: number): void {
  storageSet(TERMINAL_WIDTH_KEY, String(width));
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, terminalWidth: width });
}

export function loadTerminalHeight(): number {
  const fallback = halfViewportHeight();
  const uiState = loadStoredUiState();
  if (uiState) return finiteNumber(uiState.terminalHeight, fallback);
  return finiteNumber(storageGet(TERMINAL_HEIGHT_KEY), fallback);
}

export function saveTerminalHeight(height: number): void {
  storageSet(TERMINAL_HEIGHT_KEY, String(height));
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, terminalHeight: height });
}

export function loadTerminalPosition(): "right" | "bottom" {
  const uiState = loadStoredUiState();
  const raw = uiState?.terminalPosition ?? storageGet(TERMINAL_POSITION_KEY);
  return raw === "bottom" ? "bottom" : "right";
}

export function saveTerminalPosition(position: "right" | "bottom"): void {
  storageSet(TERMINAL_POSITION_KEY, position);
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, terminalPosition: position });
}

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export function snapSidebarWidth(width: number): number {
  if (width < SIDEBAR_COLLAPSE_THRESHOLD) return SIDEBAR_COLLAPSED_WIDTH;
  return clampSidebarWidth(width);
}

export function isSidebarCollapsed(width: number): boolean {
  return width < SIDEBAR_COLLAPSE_THRESHOLD;
}

export function loadSidebarWidth(): number {
  const uiState = loadStoredUiState();
  if (uiState) return snapSidebarWidth(finiteNumber(uiState.sidebarWidth, 204));
  return snapSidebarWidth(finiteNumber(storageGet(SIDEBAR_WIDTH_KEY), 204));
}

export function saveSidebarWidth(width: number): void {
  storageSet(SIDEBAR_WIDTH_KEY, String(width));
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, sidebarWidth: snapSidebarWidth(width) });
}

export function loadTheme(): ThemeMode {
  const uiState = loadStoredUiState();
  const raw = uiState?.theme ?? storageGet(THEME_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function saveTheme(theme: ThemeMode): void {
  storageSet(THEME_KEY, theme);
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, theme });
}

export function loadTerminalTheme(): TerminalThemeName {
  const uiState = loadStoredUiState();
  const raw = uiState?.terminalTheme ?? storageGet(TERMINAL_THEME_KEY);
  return raw === "catppuccin" || raw === "tokyo-night" || raw === "solarized" ? raw : "fractal";
}

export function saveTerminalTheme(theme: TerminalThemeName): void {
  storageSet(TERMINAL_THEME_KEY, theme);
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, terminalTheme: theme });
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function migrateGlassBlur(parsed: Partial<GlassSettings>, fallback: number): number {
  const rawBlur = Number(parsed.blur);
  if (!Number.isFinite(rawBlur)) return fallback;
  if (!parsed.version && rawBlur > 0 && rawBlur <= 6) return Math.round((rawBlur / 6) * fallback);
  return rawBlur;
}

export function normalizeGlassSettings(settings: Partial<GlassSettings> | undefined): GlassSettings {
  const fallback = { enabled: false, opacity: 0.68, blur: 22, version: 2 };
  if (!settings) return fallback;
  return {
    version: 2,
    enabled: Boolean(settings.enabled),
    opacity: clampNumber(settings.opacity, fallback.opacity, 0.45, 1),
    blur: clampNumber(migrateGlassBlur(settings, fallback.blur), fallback.blur, 0, 40),
  };
}

export function loadGlassSettings(): GlassSettings {
  const uiState = loadStoredUiState();
  if (uiState) return normalizeGlassSettings(uiState.glassSettings);
  return normalizeGlassSettings(parseJson<Partial<GlassSettings> | undefined>(storageGet(GLASS_SETTINGS_KEY), undefined));
}

export function saveGlassSettings(settings: GlassSettings): void {
  const normalized = normalizeGlassSettings(settings);
  storageSet(GLASS_SETTINGS_KEY, JSON.stringify(normalized));
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, glassSettings: normalized });
}

export function loadBoardLayout(): BoardLayout {
  const uiState = loadStoredUiState();
  const raw = uiState?.boardLayout ?? storageGet(BOARD_LAYOUT_KEY);
  return raw === "rows" || raw === "compact" ? raw : "auto";
}

export function saveBoardLayout(layout: BoardLayout): void {
  storageSet(BOARD_LAYOUT_KEY, layout);
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, boardLayout: layout });
}

export function loadLastProjectId(): string {
  const uiState = loadStoredUiState();
  return uiState?.lastProjectId || storageGet(LAST_PROJECT_ID_KEY) || "";
}

export function saveLastProjectId(id: string | null | undefined): void {
  const value = id ?? "";
  if (value) storageSet(LAST_PROJECT_ID_KEY, value);
  else storageRemove(LAST_PROJECT_ID_KEY);
  const uiState = loadUiStateCache();
  saveUiStateCache({ ...uiState, lastProjectId: value });
}

function loadStoredUiState(): UiState | null {
  const raw = storageGet(UI_STATE_KEY);
  if (!raw) return null;
  return normalizeUiState(parseJson<Partial<UiState> | null>(raw, null));
}

function loadLegacyCollapsedColumns(): Record<string, Record<Column, boolean>> {
  const collapsedColumns: Record<string, Record<Column, boolean>> = {};
  collapsedColumns.global = validColumnMap(parseJson(storageGet(COLLAPSED_KEY), DEFAULT_COLLAPSED));
  if (typeof localStorage === "undefined") return collapsedColumns;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PROJECT_COLLAPSED_KEY_PREFIX)) continue;
      const projectId = key.slice(PROJECT_COLLAPSED_KEY_PREFIX.length);
      if (projectId) collapsedColumns[projectId] = validColumnMap(parseJson(storageGet(key), DEFAULT_COLLAPSED));
    }
  } catch {}
  return collapsedColumns;
}

export function loadUiStateCache(): UiState {
  return loadStoredUiState() ?? normalizeUiState({
    version: 1,
    sidebarWidth: loadSidebarWidth(),
    collapsedColumns: loadLegacyCollapsedColumns(),
    terminalPosition: loadTerminalPosition(),
    terminalWidth: loadTerminalWidth(),
    terminalHeight: loadTerminalHeight(),
    terminalTabs: loadTerminalTabs(),
    activeTerminalTabId: storageGet(ACTIVE_TERMINAL_TAB_KEY),
    theme: loadTheme(),
    terminalTheme: loadTerminalTheme(),
    glassSettings: loadGlassSettings(),
    commandRecents: loadCommandRecents(),
    boardLayout: loadBoardLayout(),
    lastProjectId: storageGet(LAST_PROJECT_ID_KEY) || "",
  });
}

export function saveUiStateCache(state: UiState): void {
  const normalized = normalizeUiState(state);
  storageSet(UI_STATE_KEY, JSON.stringify(normalized));
  storageSet(SIDEBAR_WIDTH_KEY, String(normalized.sidebarWidth));
  storageSet(TERMINAL_TABS_KEY, JSON.stringify(normalized.terminalTabs));
  if (normalized.activeTerminalTabId) storageSet(ACTIVE_TERMINAL_TAB_KEY, normalized.activeTerminalTabId);
  else storageRemove(ACTIVE_TERMINAL_TAB_KEY);
  storageSet(TERMINAL_WIDTH_KEY, String(normalized.terminalWidth));
  storageSet(TERMINAL_HEIGHT_KEY, String(normalized.terminalHeight));
  storageSet(TERMINAL_POSITION_KEY, normalized.terminalPosition);
  storageSet(THEME_KEY, normalized.theme);
  storageSet(TERMINAL_THEME_KEY, normalized.terminalTheme);
  storageSet(GLASS_SETTINGS_KEY, JSON.stringify(normalized.glassSettings));
  storageSet(COMMAND_RECENTS_KEY, JSON.stringify(normalized.commandRecents));
  storageSet(BOARD_LAYOUT_KEY, normalized.boardLayout);
  if (normalized.lastProjectId) storageSet(LAST_PROJECT_ID_KEY, normalized.lastProjectId);
  else storageRemove(LAST_PROJECT_ID_KEY);
  for (const [projectId, collapsed] of Object.entries(normalized.collapsedColumns)) {
    storageSet(projectId === "global" ? COLLAPSED_KEY : `${PROJECT_COLLAPSED_KEY_PREFIX}${projectId}`, JSON.stringify(collapsed));
  }
}

export function normalizeUiState(value: Partial<UiState> | null | undefined): UiState {
  const fallback = {
    version: 1 as const,
    sidebarWidth: 204,
    collapsedColumns: { global: { ...DEFAULT_COLLAPSED } },
    terminalPosition: "right" as const,
    terminalWidth: halfViewportWidth(),
    terminalHeight: halfViewportHeight(),
    terminalTabs: [] as TerminalTab[],
    activeTerminalTabId: null,
    theme: "system" as ThemeMode,
    terminalTheme: "fractal" as TerminalThemeName,
    glassSettings: normalizeGlassSettings(undefined),
    commandRecents: [] as CommandRecent[],
    boardLayout: "auto" as BoardLayout,
    lastProjectId: "",
  };
  const collapsedColumns: Record<string, Record<Column, boolean>> = { ...fallback.collapsedColumns };
  for (const [key, collapsed] of Object.entries(value?.collapsedColumns ?? {})) {
    collapsedColumns[key || "global"] = validColumnMap(collapsed);
  }
  const terminalTabs = Array.isArray(value?.terminalTabs) ? value.terminalTabs.filter(isTerminalTab) : fallback.terminalTabs;
  const activeTerminalTabId = typeof value?.activeTerminalTabId === "string" && terminalTabs.some((tab) => tab.id === value.activeTerminalTabId) ? value.activeTerminalTabId : terminalTabs[0]?.id ?? null;
  const theme = value?.theme === "light" || value?.theme === "dark" ? value.theme : fallback.theme;
  const terminalTheme = value?.terminalTheme === "catppuccin" || value?.terminalTheme === "tokyo-night" || value?.terminalTheme === "solarized" ? value.terminalTheme : fallback.terminalTheme;
  const boardLayout = value?.boardLayout === "rows" || value?.boardLayout === "compact" ? value.boardLayout : fallback.boardLayout;
  const terminalPosition = value?.terminalPosition === "bottom" ? "bottom" : "right";
  const commandRecents = Array.isArray(value?.commandRecents) ? value.commandRecents.filter(isCommandRecent).slice(0, 20) : fallback.commandRecents;
  return {
    version: 1,
    sidebarWidth: snapSidebarWidth(finiteNumber(value?.sidebarWidth, fallback.sidebarWidth)),
    collapsedColumns,
    terminalPosition,
    terminalWidth: finiteNumber(value?.terminalWidth, fallback.terminalWidth),
    terminalHeight: finiteNumber(value?.terminalHeight, fallback.terminalHeight),
    terminalTabs,
    activeTerminalTabId,
    theme,
    terminalTheme,
    glassSettings: normalizeGlassSettings(value?.glassSettings),
    commandRecents,
    boardLayout,
    lastProjectId: typeof value?.lastProjectId === "string" ? value.lastProjectId : fallback.lastProjectId,
  };
}

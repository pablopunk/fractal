import type { Column, TerminalTab } from "./types.js";

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
export type ThemeMode = "system" | "light" | "dark";
export type GlassSettings = { enabled: boolean; opacity: number; blur: number };
export type TerminalThemeName = "fractal" | "catppuccin" | "tokyo-night" | "solarized";
export const SIDEBAR_COLLAPSED_WIDTH = 56;
export const SIDEBAR_COLLAPSE_THRESHOLD = 132;
export const SIDEBAR_MIN_WIDTH = 176;
export const SIDEBAR_MAX_WIDTH = 260;

const DEFAULT_COLLAPSED = { PROMPTS: false, RUN_IN_PLACE: false, RUN_IN_WORKTREE: false, ARCHIVED: true } as Record<Column, boolean>;

function collapsedKey(projectId: string | null | undefined): string {
  return projectId ? `${PROJECT_COLLAPSED_KEY_PREFIX}${projectId}` : COLLAPSED_KEY;
}

export function loadCollapsed(projectId?: string | null): Record<Column, boolean> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(collapsedKey(projectId)) : null;
    if (!raw) return { ...DEFAULT_COLLAPSED };
    return { ...DEFAULT_COLLAPSED, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_COLLAPSED }; }
}

export function saveCollapsed(projectId: string | null | undefined, collapsed: Record<Column, boolean>): void {
  try { localStorage.setItem(collapsedKey(projectId), JSON.stringify(collapsed)); } catch {}
}

export function loadTerminalTabs(): TerminalTab[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_TABS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function loadActiveTerminalId(tabs: TerminalTab[]): string | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_TERMINAL_TAB_KEY) : null;
    return raw && tabs.some((tab) => tab.id === raw) ? raw : tabs[0]?.id ?? null;
  } catch { return tabs[0]?.id ?? null; }
}

function halfViewportWidth(): number {
  return typeof window === "undefined" ? 520 : Math.floor(window.innerWidth / 2);
}

function halfViewportHeight(): number {
  return typeof window === "undefined" ? 320 : Math.floor(window.innerHeight / 2);
}

export function loadTerminalWidth(): number {
  const fallback = halfViewportWidth();
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_WIDTH_KEY) : null;
    return raw ? Number(raw) || fallback : fallback;
  } catch { return fallback; }
}

export function loadTerminalHeight(): number {
  const fallback = halfViewportHeight();
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_HEIGHT_KEY) : null;
    return raw ? Number(raw) || fallback : fallback;
  } catch { return fallback; }
}

export function loadTerminalPosition(): "right" | "bottom" {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_POSITION_KEY) : null;
    return raw === "bottom" ? "bottom" : "right";
  } catch { return "right"; }
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
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_KEY) : null;
    return raw ? snapSidebarWidth(Number(raw) || 204) : 204;
  } catch { return 204; }
}

export function loadTheme(): ThemeMode {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch { return "system"; }
}

export function saveTheme(theme: ThemeMode): void {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

export function loadTerminalTheme(): TerminalThemeName {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_THEME_KEY) : null;
    return raw === "catppuccin" || raw === "tokyo-night" || raw === "solarized" ? raw : "fractal";
  } catch { return "fractal"; }
}

export function saveTerminalTheme(theme: TerminalThemeName): void {
  try { localStorage.setItem(TERMINAL_THEME_KEY, theme); } catch {}
}

export function loadGlassSettings(): GlassSettings {
  const fallback = { enabled: false, opacity: 0.68, blur: 6 };
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(GLASS_SETTINGS_KEY) : null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GlassSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      opacity: Math.min(1, Math.max(0.45, Number(parsed.opacity) || fallback.opacity)),
      blur: Math.min(6, Math.max(0, Number(parsed.blur) || fallback.blur)),
    };
  } catch { return fallback; }
}

export function saveGlassSettings(settings: GlassSettings): void {
  try { localStorage.setItem(GLASS_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

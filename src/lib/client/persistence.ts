import type { Column, TerminalTab } from "./types.js";

export const COLLAPSED_KEY = "fractal:collapsedColumns";
export const TERMINAL_TABS_KEY = "fractal:terminalTabs";
export const ACTIVE_TERMINAL_TAB_KEY = "fractal:activeTerminalTab";
export const TERMINAL_WIDTH_KEY = "fractal:terminalWidth";
export const TERMINAL_HEIGHT_KEY = "fractal:terminalHeight";
export const TERMINAL_POSITION_KEY = "fractal:terminalPosition";
export const SIDEBAR_WIDTH_KEY = "fractal:sidebarWidth";
export const SIDEBAR_MIN_WIDTH = 176;
export const SIDEBAR_MAX_WIDTH = 260;

export function loadCollapsed(): Record<Column, boolean> {
  const def = { PROMPTS: false, RUN_IN_PLACE: false, RUN_IN_WORKTREE: false, ARCHIVED: true } as Record<Column, boolean>;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(COLLAPSED_KEY) : null;
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch { return def; }
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

export function loadTerminalWidth(): number {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_WIDTH_KEY) : null;
    return raw ? Number(raw) || 520 : 520;
  } catch { return 520; }
}

export function loadTerminalHeight(): number {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TERMINAL_HEIGHT_KEY) : null;
    return raw ? Number(raw) || 320 : 320;
  } catch { return 320; }
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

export function loadSidebarWidth(): number {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_KEY) : null;
    return raw ? clampSidebarWidth(Number(raw) || 204) : 204;
  } catch { return 204; }
}

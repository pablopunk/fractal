import type { ITheme } from "@xterm/xterm";
import type { ThemeMode } from "./persistence.js";

export type TerminalThemeName = "fractal" | "catppuccin" | "tokyo-night" | "solarized";
export type ResolvedThemeMode = "light" | "dark";

type TerminalThemeFamily = {
  label: string;
  dark: ITheme;
  light: ITheme;
};

export const TERMINAL_THEME_OPTIONS: { id: TerminalThemeName; label: string }[] = [
  { id: "fractal", label: "Fractal" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "solarized", label: "Solarized" },
];

const THEMES: Record<TerminalThemeName, TerminalThemeFamily> = {
  fractal: {
    label: "Fractal",
    dark: {
      background: "#0b0b0d",
      foreground: "#ededf0",
      cursor: "#ff6a3d",
      selectionBackground: "#34343c",
      black: "#24242b",
      red: "#f87171",
      green: "#34d399",
      yellow: "#fbbf24",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#d4d4d8",
      brightBlack: "#71717a",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    },
    light: {
      background: "#fafafa",
      foreground: "#15151a",
      cursor: "#ea580c",
      selectionBackground: "#d4d4d8",
      black: "#24242b",
      red: "#dc2626",
      green: "#16a34a",
      yellow: "#ca8a04",
      blue: "#2563eb",
      magenta: "#9333ea",
      cyan: "#0891b2",
      white: "#e4e4e7",
      brightBlack: "#71717a",
      brightRed: "#ef4444",
      brightGreen: "#22c55e",
      brightYellow: "#eab308",
      brightBlue: "#3b82f6",
      brightMagenta: "#a855f7",
      brightCyan: "#06b6d4",
      brightWhite: "#fafafa",
    },
  },
  catppuccin: {
    label: "Catppuccin",
    dark: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      selectionBackground: "#45475a",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#cba6f7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#cba6f7",
      brightCyan: "#94e2d5",
      brightWhite: "#a6adc8",
    },
    light: {
      background: "#eff1f5",
      foreground: "#4c4f69",
      cursor: "#dc8a78",
      selectionBackground: "#ccd0da",
      black: "#5c5f77",
      red: "#d20f39",
      green: "#40a02b",
      yellow: "#df8e1d",
      blue: "#1e66f5",
      magenta: "#8839ef",
      cyan: "#179299",
      white: "#acb0be",
      brightBlack: "#6c6f85",
      brightRed: "#d20f39",
      brightGreen: "#40a02b",
      brightYellow: "#df8e1d",
      brightBlue: "#1e66f5",
      brightMagenta: "#8839ef",
      brightCyan: "#179299",
      brightWhite: "#bcc0cc",
    },
  },
  "tokyo-night": {
    label: "Tokyo Night",
    dark: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      cursor: "#c0caf5",
      selectionBackground: "#33467c",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
    light: {
      background: "#d5d6db",
      foreground: "#343b58",
      cursor: "#343b58",
      selectionBackground: "#c4c8da",
      black: "#0f0f14",
      red: "#8c4351",
      green: "#485e30",
      yellow: "#8f5e15",
      blue: "#34548a",
      magenta: "#5a4a78",
      cyan: "#166775",
      white: "#9699a8",
      brightBlack: "#4c505e",
      brightRed: "#8c4351",
      brightGreen: "#485e30",
      brightYellow: "#8f5e15",
      brightBlue: "#34548a",
      brightMagenta: "#5a4a78",
      brightCyan: "#166775",
      brightWhite: "#343b58",
    },
  },
  solarized: {
    label: "Solarized",
    dark: {
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
    light: {
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#586e75",
      selectionBackground: "#eee8d5",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
};

export function resolveThemeMode(theme: ThemeMode): ResolvedThemeMode {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function terminalTheme(theme: ThemeMode, terminalThemeName: TerminalThemeName, transparent = false): ITheme {
  const family = THEMES[terminalThemeName] ?? THEMES.fractal;
  const resolved = family[resolveThemeMode(theme)];
  return transparent ? { ...resolved, background: "#00000000" } : resolved;
}

export function terminalThemePreview(theme: ThemeMode, terminalThemeName: TerminalThemeName): { background: string; foreground: string; accent: string } {
  const resolved = terminalTheme(theme, terminalThemeName);
  return {
    background: resolved.background ?? "#0b0b0d",
    foreground: resolved.foreground ?? "#ededf0",
    accent: resolved.cursor ?? resolved.blue ?? "#ff6a3d",
  };
}

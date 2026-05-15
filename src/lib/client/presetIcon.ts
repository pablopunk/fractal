import type { AgentPreset } from "./types";

type ImgIcon = { type: "img"; light: string; dark: string };
type LetterIcon = { type: "letter"; letter: string; hue: number };
export type PresetIconDescriptor = ImgIcon | LetterIcon;

const KIND_ICONS: Record<Exclude<AgentPreset["kind"], "custom">, ImgIcon> = {
  claude: { type: "img", light: "/agent-icons/claude.svg", dark: "/agent-icons/claude.svg" },
  opencode: { type: "img", light: "/agent-icons/opencode-light.svg", dark: "/agent-icons/opencode-dark.svg" },
  pi: { type: "img", light: "/agent-icons/pi-light.svg", dark: "/agent-icons/pi-dark.svg" },
};

const CODEX_ICON: ImgIcon = { type: "img", light: "/agent-icons/codex-light.svg", dark: "/agent-icons/codex-dark.svg" };

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function basename(binary: string): string {
  const trimmed = binary.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export function getPresetIcon(preset: Pick<AgentPreset, "kind" | "binary" | "name">): PresetIconDescriptor {
  if (preset.kind !== "custom") return KIND_ICONS[preset.kind];
  const bin = basename(preset.binary).toLowerCase();
  if (bin.includes("codex")) return CODEX_ICON;
  if (bin.includes("claude")) return KIND_ICONS.claude;
  if (bin.includes("opencode")) return KIND_ICONS.opencode;
  if (bin === "pi") return KIND_ICONS.pi;
  const label = (bin || preset.name || "?").replace(/^[._-]+/, "");
  const letter = (label.charAt(0) || "?").toUpperCase();
  return { type: "letter", letter, hue: hashString(label) % 360 };
}

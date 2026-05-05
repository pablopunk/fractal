import { exec } from "./exec.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ModelProfile, AppSettings } from "./store.js";

function findPiBin(): string {
  const home = process.env.HOME ?? "";
  const candidates = [
    join(home, ".bun/bin/pi"),
    join(home, ".local/share/mise/shims/pi"),
    join(home, ".local/bin/pi"),
    join(home, ".npm/bin/pi"),
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
    "/usr/bin/pi",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "pi";
}

const PI_BIN = findPiBin();

export type PiModel = {
  provider: string;
  model: string;
  id: string;
  context?: string;
  maxOut?: string;
  thinking?: string;
  images?: string;
};

export async function listPiModels(): Promise<PiModel[]> {
  const { stdout, stderr } = await exec(PI_BIN, ["--list-models"], { timeoutMs: 30000 });
  // pi --list-models writes to stderr
  const lines = (stderr || stdout).split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1);
  const models: PiModel[] = [];
  for (const line of rows) {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/);
    if (!match) continue;
    const [, provider, model, context, maxOut, thinking, images] = match;
    models.push({ provider, model, id: `${provider}/${model}`, context, maxOut, thinking, images });
  }
  return models;
}

export function resolvePromptModel(profile: ModelProfile, settings: AppSettings): string | undefined {
  const model = profile === "fast" ? settings.fastModel : settings.smartModel;
  return model || undefined;
}

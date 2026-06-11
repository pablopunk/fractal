import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const TEST_DB_PATH = join(tmpdir(), `fractal-test-${randomUUID()}.db`);

const SAVED_DB_PATH = process.env.FRACTAL_DB_PATH;

describe("store", () => {
  let store: typeof import("./store.js");
  let client: typeof import("./db/client.js");

  beforeAll(async () => {
    process.env.FRACTAL_DB_PATH = TEST_DB_PATH;
    vi.resetModules();
    store = await import("./store.js");
    client = await import("./db/client.js");
  });

  afterAll(() => {
    client.closeDb();
    process.env.FRACTAL_DB_PATH = SAVED_DB_PATH;
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      // db may not exist if beforeAll failed
    }
  });

  it("getSettings returns defaults with an empty DB", () => {
    const settings = store.getSettings();
    expect(settings.defaultPresetId).toBe("pi");
    expect(settings.fastModel).toBe("");
    expect(settings.smartModel).toBe("");
    expect(settings.lastProjectId).toBe("");
    expect(settings.agentPresets).toHaveLength(3);
    expect(settings.agentPresets.map((p) => p.id).sort()).toEqual([
      "claude",
      "opencode",
      "pi",
    ]);
    // Empty DB: helperPresetId auto-resolves to first pi preset
    expect(settings.helperPresetId).toBe("pi");
  });

  it("persists and reads back an explicit helperPresetId", () => {
    store.updateSettings({ helperPresetId: "claude" });
    expect(store.getSettings().helperPresetId).toBe("claude");
  });

  it("validates helperPresetId against stored agentPresets, clears if missing", () => {
    // Store a helperPresetId that matches no stored preset
    store.updateSettings({ agentPresets: [], helperPresetId: "ghost" });
    expect(store.getSettings().helperPresetId).toBe("");
  });

  it("updateSettings persists and returns updated settings", () => {
    const updated = store.updateSettings({ defaultPresetId: "claude" });
    expect(updated.defaultPresetId).toBe("claude");
    expect(store.getSettings().defaultPresetId).toBe("claude");
    // Other defaults unchanged
    expect(updated.fastModel).toBe("");
  });
});

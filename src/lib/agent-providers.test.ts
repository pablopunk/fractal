import { describe, expect, it } from "vitest";
import {
  FRACTAL_AGENT_MODELS,
  FRACTAL_AGENT_PROVIDERS,
  modelLabel,
  providerLabel,
} from "./agent-providers.js";

describe("agent-providers", () => {
  it("all provider ids have a non-empty model list", () => {
    for (const p of FRACTAL_AGENT_PROVIDERS) {
      const models = FRACTAL_AGENT_MODELS[p.id];
      expect(models, `${p.id} models`).toBeDefined();
      expect(models.length, `${p.id} has models`).toBeGreaterThan(0);
    }
  });

  it("all model entries have valid id and label", () => {
    for (const p of FRACTAL_AGENT_PROVIDERS) {
      for (const m of FRACTAL_AGENT_MODELS[p.id]) {
        expect(typeof m.id, `${p.id}/${m.label} id`).toBe("string");
        expect(m.id.length, `${p.id}/${m.label} id non-empty`).toBeGreaterThan(0);
        expect(typeof m.label, `${p.id}/${m.id} label`).toBe("string");
        expect(m.label.length, `${p.id}/${m.id} label non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it("model ids are unique within each provider", () => {
    for (const p of FRACTAL_AGENT_PROVIDERS) {
      const ids = FRACTAL_AGENT_MODELS[p.id].map((m) => m.id);
      expect(new Set(ids).size, `${p.id} unique ids`).toBe(ids.length);
    }
  });

  describe("pi-ai model resolution", () => {
    it("all catalog models resolve via pi-ai getModel", async () => {
      const { getModel } = await import("@earendil-works/pi-ai");
      const failures: string[] = [];
      for (const p of FRACTAL_AGENT_PROVIDERS) {
        for (const m of FRACTAL_AGENT_MODELS[p.id]) {
          const model = getModel(p.id as never, m.id as never);
          if (!model) {
            failures.push(`${p.id}/${m.id}`);
          }
        }
      }
      expect(failures, `unresolvable models: ${failures.join(", ") || "none"}`).toEqual([]);
    });
  });

  describe("auth provider mapping", () => {
    it("has a defined label for every provider id", () => {
      for (const p of FRACTAL_AGENT_PROVIDERS) {
        expect(typeof providerLabel(p.id), `${p.id} label`).toBe("string");
      }
    });

    it("modelLabel returns a string for valid provider+model", () => {
      for (const p of FRACTAL_AGENT_PROVIDERS) {
        if (FRACTAL_AGENT_MODELS[p.id].length > 0) {
          const firstModel = FRACTAL_AGENT_MODELS[p.id][0].id;
          expect(typeof modelLabel(p.id, firstModel), `${p.id}/${firstModel} label`).toBe("string");
        }
      }
    });

    it("modelLabel returns the model id for unknown models", () => {
      expect(modelLabel("anthropic", "nonexistent")).toBe("nonexistent");
    });
  });
});

import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const registry = ModelRegistry.create(AuthStorage.create());
    const models = registry.getAvailable().map((model) => ({
      id: `${model.provider}/${model.id}`,
      provider: model.provider,
      model: model.id,
      agent: "pi" as const,
    }));
    return Response.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
};

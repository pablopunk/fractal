import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { APIRoute } from "astro";

export const prerender = false;

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const GET: APIRoute = async () => {
  return Response.json({ name: "Fractal", version: appVersion() });
};

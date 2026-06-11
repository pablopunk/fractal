import type { APIRoute } from "astro";
import { HOME, listDirectories, SUGGESTION_ROOTS } from "~/lib/server/fs.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  const seen = new Set<string>();
  const entries: { name: string; absolute: string; root: string }[] = [];
  for (const root of SUGGESTION_ROOTS) {
    for (const e of listDirectories(root, { limit: 500 })) {
      if (seen.has(e.absolute)) continue;
      seen.add(e.absolute);
      entries.push({ ...e, root });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ home: HOME, roots: SUGGESTION_ROOTS, entries });
};

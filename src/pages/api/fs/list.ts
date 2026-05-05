import type { APIRoute } from "astro";
import { HOME, expandPath, listDirectories } from "~/lib/server/fs.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const dir = url.searchParams.get("dir") ?? "~";
  const includeHidden = url.searchParams.get("hidden") === "1";
  const absolute = expandPath(dir);
  const entries = listDirectories(absolute, { includeHidden, limit: 500 });
  return Response.json({ home: HOME, absolute, entries });
};

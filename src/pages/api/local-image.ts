import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRoute } from "astro";
import { expandPath, HOME } from "~/lib/server/fs.js";
import { resolvedPathIsWithin } from "~/lib/server/path-containment.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

function contentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "application/octet-stream";
}

export const GET: APIRoute = async ({ url }) => {
  const rawPath = url.searchParams.get("path");
  if (!rawPath) return new Response("Missing path parameter", { status: 400 });

  const path = resolve(expandPath(rawPath));
  if (!IMAGE_RE.test(path)) return new Response("Unsupported image type", { status: 415 });

  try {
    const stats = statSync(path);
    if (!stats.isFile()) return new Response("Not found", { status: 404 });
    if (!resolvedPathIsWithin(HOME, path)) return new Response("Forbidden", { status: 403 });
    if (stats.size > MAX_IMAGE_BYTES) return new Response("Image too large", { status: 413 });
    const buf = readFileSync(path);
    return new Response(buf, {
      headers: {
        "Content-Type": contentType(path),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};

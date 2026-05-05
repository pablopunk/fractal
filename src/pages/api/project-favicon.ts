import type { APIRoute } from "astro";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

const FAVICON_CANDIDATES = [
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "app/favicon.ico",
  "app/favicon.png",
  "app/icon.svg",
  "app/icon.png",
  "app/icon.ico",
  "src/favicon.ico",
  "src/favicon.svg",
  "src/app/favicon.ico",
  "src/app/icon.svg",
  "src/app/icon.png",
  "assets/icon.svg",
  "assets/icon.png",
  "assets/logo.svg",
  "assets/logo.png",
  ".idea/icon.svg",
] as const;

const ICON_SOURCE_FILES = [
  "index.html",
  "public/index.html",
  "app/routes/__root.tsx",
  "src/routes/__root.tsx",
  "app/root.tsx",
  "src/root.tsx",
  "src/index.html",
] as const;

const LINK_ICON_HTML_RE =
  /<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["']([^"'?]+))[^>]*>/i;
const LINK_ICON_OBJ_RE =
  /(?=[^}]*\brel\s*:\s*["'](?:icon|shortcut icon)["'])(?=[^}]*\bhref\s*:\s*["']([^"'?]+))[^}]*/i;

function extractIconHref(source: string): string | null {
  const htmlMatch = source.match(LINK_ICON_HTML_RE);
  if (htmlMatch?.[1]) return htmlMatch[1];
  const objMatch = source.match(LINK_ICON_OBJ_RE);
  if (objMatch?.[1]) return objMatch[1];
  return null;
}

function isPathWithinProject(projectCwd: string, candidatePath: string): boolean {
  const rel = relative(resolve(projectCwd), resolve(candidatePath));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function findExistingFile(projectCwd: string, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (!isPathWithinProject(projectCwd, candidate)) continue;
    try {
      const stats = statSync(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function resolveIconHref(projectCwd: string, href: string): string[] {
  const clean = href.replace(/^\//, "");
  return [join(projectCwd, "public", clean), join(projectCwd, clean)];
}

function guessContentType(path: string): string {
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

export const GET: APIRoute = async ({ url }) => {
  const cwd = url.searchParams.get("cwd");
  if (!cwd) {
    return new Response("Missing cwd parameter", { status: 400 });
  }

  // Security: resolve to absolute and verify it's a real path
  const projectCwd = resolve(cwd);

  // Check well-known favicon paths
  for (const candidate of FAVICON_CANDIDATES) {
    const resolved = join(projectCwd, candidate);
    const existing = findExistingFile(projectCwd, [resolved]);
    if (existing) {
      try {
        const buf = readFileSync(existing);
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": guessContentType(existing),
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch {
        // fall through to fallback
      }
    }
  }

  // Parse source files for icon hrefs
  for (const sourceFile of ICON_SOURCE_FILES) {
    const sourcePath = join(projectCwd, sourceFile);
    if (!existsSync(sourcePath)) continue;
    try {
      const source = readFileSync(sourcePath, "utf-8");
      const href = extractIconHref(source);
      if (!href) continue;
      const existing = findExistingFile(projectCwd, resolveIconHref(projectCwd, href));
      if (existing) {
        try {
          const buf = readFileSync(existing);
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": guessContentType(existing),
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch {
          // fall through
        }
      }
    } catch {
      // ignore
    }
  }

  return new Response("Not found", { status: 404 });
};

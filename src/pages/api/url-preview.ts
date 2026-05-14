import type { APIRoute } from "astro";

type UrlPreview = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
};

const cache = new Map<string, { value: UrlPreview; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60;
const MAX_HTML_BYTES = 600_000;

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return tag.match(re)?.[2] ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function absolutize(value: string | null, base: string): string {
  if (!value) return "";
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

const MAX_TAGS_SCANNED = 500;

function meta(html: string, key: string): string {
  const tags = (html.match(/<meta\b[^>]{0,2000}>/gi) ?? []).slice(0, MAX_TAGS_SCANNED);
  for (const tag of tags) {
    const property = attr(tag, "property") ?? attr(tag, "name");
    if (property?.toLowerCase() === key.toLowerCase()) return decodeEntities(attr(tag, "content") ?? "");
  }
  return "";
}

function title(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(match?.[1] ?? "");
}

function favicon(html: string, base: string): string {
  const links = (html.match(/<link\b[^>]{0,2000}>/gi) ?? []).slice(0, MAX_TAGS_SCANNED);
  const icon = links.find((tag) => /\brel\s*=\s*(["']).*?(?:apple-touch-icon|icon).*?\1/i.test(tag));
  return absolutize(icon ? attr(icon, "href") : "/favicon.ico", base);
}

function parsePreview(html: string, finalUrl: string): UrlPreview {
  const url = new URL(finalUrl);
  return {
    url: finalUrl,
    title: meta(html, "og:title") || meta(html, "twitter:title") || title(html) || url.hostname,
    description: meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description"),
    image: absolutize(meta(html, "og:image") || meta(html, "twitter:image"), finalUrl),
    siteName: meta(html, "og:site_name") || url.hostname.replace(/^www\./, ""),
    favicon: favicon(html, finalUrl),
  };
}

export const GET: APIRoute = async ({ url }) => {
  const target = url.searchParams.get("url");
  if (!target) return Response.json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return Response.json({ error: "Unsupported url" }, { status: 400 });
  }

  const cached = cache.get(parsed.toString());
  if (cached && cached.expiresAt > Date.now()) return Response.json(cached.value);

  try {
    const res = await fetch(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const preview = parsePreview(html, res.url || parsed.toString());
    cache.set(parsed.toString(), { value: preview, expiresAt: Date.now() + CACHE_TTL_MS });
    return Response.json(preview, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
};

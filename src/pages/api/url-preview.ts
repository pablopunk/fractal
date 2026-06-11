import dns from "node:dns/promises";
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
const MAX_REDIRECTS = 5;

const LOOPBACK_V4_PREFIXES = [127];
const PRIVATE_V4_RANGES: [number, number, number][] = [
  [10, 0, 8],
  [172, 16, 12],
  [192, 168, 16],
  [169, 254, 16],
  [0, 0, 8],
  [100, 64, 10],
];

export function ipv4IsPrivate(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false;
  if (LOOPBACK_V4_PREFIXES.includes(octets[0])) return true;
  for (const [prefixA, prefixB, cidr] of PRIVATE_V4_RANGES) {
    if (cidr === 8 && octets[0] === prefixA) return true;
    if (cidr === 10) {
      if (octets[0] !== prefixA) continue;
      const high = (prefixB & 0xc0) >>> 0;
      return (octets[1] & 0xc0) >>> 0 === high;
    }
    if (cidr === 12) {
      if (octets[0] !== prefixA) continue;
      return octets[1] >= prefixB && octets[1] <= prefixB + 15;
    }
    if (cidr === 16 && octets[0] === prefixA && octets[1] === prefixB) return true;
  }
  return false;
}

export function ipv6IsPrivate(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) {
    const rest = normalized.slice(7);
    if (rest.includes(".")) return ipv4IsPrivate(rest);
    const groups = rest.split(":");
    let v4 = 0;
    for (const g of groups) v4 = ((v4 << 16) | (parseInt(g || "0", 16) & 0xffff)) >>> 0;
    const oct = [(v4 >>> 24) & 0xff, (v4 >>> 16) & 0xff, (v4 >>> 8) & 0xff, v4 & 0xff];
    return ipv4IsPrivate(oct.join("."));
  }
  return false;
}

async function assertPublicHostnameOrThrow(hostname: string): Promise<void> {
  if (hostname === "localhost" || hostname === "localhost.localdomain") {
    throw new Error("Blocked address");
  }
  const v4 = hostname.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)?.[1];
  if (v4) {
    if (ipv4IsPrivate(v4)) throw new Error("Blocked address");
    return;
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const v6 = hostname.slice(1, -1);
    if (ipv6IsPrivate(v6)) throw new Error("Blocked address");
    return;
  }
  if (hostname.includes(":")) {
    if (ipv6IsPrivate(hostname)) throw new Error("Blocked address");
    return;
  }
  const resolved = await dns.lookup(hostname, { all: true });
  for (const addr of resolved) {
    if (addr.family === 4) {
      if (ipv4IsPrivate(addr.address)) throw new Error("Blocked address");
    } else {
      if (ipv6IsPrivate(addr.address)) throw new Error("Blocked address");
    }
  }
}

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
    if (property?.toLowerCase() === key.toLowerCase())
      return decodeEntities(attr(tag, "content") ?? "");
  }
  return "";
}

function title(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(match?.[1] ?? "");
}

function favicon(html: string, base: string): string {
  const links = (html.match(/<link\b[^>]{0,2000}>/gi) ?? []).slice(0, MAX_TAGS_SCANNED);
  const icon = links.find((tag) =>
    /\brel\s*=\s*(["']).*?(?:apple-touch-icon|icon).*?\1/i.test(tag),
  );
  return absolutize(icon ? attr(icon, "href") : "/favicon.ico", base);
}

function parsePreview(html: string, finalUrl: string): UrlPreview {
  const url = new URL(finalUrl);
  return {
    url: finalUrl,
    title: meta(html, "og:title") || meta(html, "twitter:title") || title(html) || url.hostname,
    description:
      meta(html, "og:description") ||
      meta(html, "twitter:description") ||
      meta(html, "description"),
    image: absolutize(meta(html, "og:image") || meta(html, "twitter:image"), finalUrl),
    siteName: meta(html, "og:site_name") || url.hostname.replace(/^www\./, ""),
    favicon: favicon(html, finalUrl),
  };
}

async function fetchWithGuard(initialUrl: URL): Promise<{ body: string; finalUrl: string }> {
  let current = initialUrl.toString();
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const parsed = new URL(current);
    await assertPublicHostnameOrThrow(parsed.hostname);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without Location header");
      const next = new URL(location, current);
      if (!["http:", "https:"].includes(next.protocol)) {
        throw new Error("Blocked address");
      }
      current = next.toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { body: await res.text(), finalUrl: res.url || current };
  }
  throw new Error("Too many redirects");
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
    const { body, finalUrl } = await fetchWithGuard(parsed);
    const html = body.slice(0, MAX_HTML_BYTES);
    const preview = parsePreview(html, finalUrl);
    cache.set(parsed.toString(), { value: preview, expiresAt: Date.now() + CACHE_TTL_MS });
    return Response.json(preview, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Blocked address" ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
};

import { execFileSync } from "node:child_process";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const raw = execFileSync("tailscale", ["status", "--json"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const status = JSON.parse(raw);
    const self = status.Self;
    return Response.json({
      installed: true,
      hostname: self?.HostName ?? null,
      dnsName: self?.DNSName?.replace(/\.$/, "") ?? null,
      tailnetName: status.CurrentTailnet?.Name ?? null,
      online: self?.Online ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT") || message.includes("not found")) {
      return Response.json({ installed: false });
    }
    return Response.json({ installed: true, error: message }, { status: 500 });
  }
};

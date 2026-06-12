import { execFile } from "node:child_process";
import type { APIRoute } from "astro";

function execTailscaleStatus(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "tailscale",
      ["status", "--json"],
      { encoding: "utf8", timeout: 5000 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const stdout = await execTailscaleStatus();
    const status = JSON.parse(stdout);
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
      return Response.json({
        installed: false,
        hostname: "",
        dnsName: "",
        tailnetName: "",
        online: false,
      });
    }
    return Response.json(
      {
        installed: true,
        hostname: null,
        dnsName: null,
        tailnetName: null,
        online: false,
        error: message,
      },
      { status: 500 },
    );
  }
};

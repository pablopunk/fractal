import type { APIRoute } from "astro";
import { execFile } from "node:child_process/promises";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as { enable?: boolean };
    const port = process.env.PORT || "7666";
    if (body.enable) {
      await execFile("tailscale", ["serve", "--bg", `http://127.0.0.1:${port}`], {
        timeout: 10000,
      });
      return Response.json({ ok: true });
    }
    await execFile("tailscale", ["serve", "--https=443", "off"], {
      timeout: 10000,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Tailscale serve command failed" });
  }
};

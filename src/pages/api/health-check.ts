import type { APIRoute } from "astro";
import { autoArchiveOrphans } from "~/lib/server/cleanup.js";

export const prerender = false;

/**
 * Health check endpoint that:
 * - Scans all prompts for missing worktrees
 * - Auto-archives prompts with orphaned worktrees
 * - Can be called periodically (e.g., via cron or page load)
 */
export const POST: APIRoute = async () => {
  try {
    const archived = await autoArchiveOrphans();
    return Response.json({
      ok: true,
      archivedCount: archived.length,
      archived: archived.map((p) => ({ id: p.id, text: p.text })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};

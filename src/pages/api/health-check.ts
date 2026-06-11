import type { APIRoute } from "astro";
import { autoArchiveOrphans, autoCleanupDonePrompts } from "~/lib/server/cleanup.js";

export const prerender = false;

/**
 * Health check endpoint that:
 * - Scans all prompts for missing worktrees
 * - Auto-archives prompts with orphaned worktrees
 * - Deletes old DONE prompts and removes their resources/worktrees
 * - Can be called periodically (e.g., via cron or page load)
 */
export const POST: APIRoute = async () => {
  try {
    const [archived, deleted] = await Promise.all([autoArchiveOrphans(), autoCleanupDonePrompts()]);
    return Response.json({
      ok: true,
      archivedCount: archived.length,
      archived: archived.map((p) => ({ id: p.id, text: p.text })),
      deletedDoneCount: deleted.length,
      deletedDone: deleted.map((p) => ({ id: p.id, text: p.text })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};

/**
 * Deterministic, safe branch name derived from a prompt.
 * Strategy: lowercase, strip non-alphanumeric, collapse dashes, take first ~8
 * meaningful words, append a short id suffix for uniqueness.
 */
export function slugifyPrompt(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const stop = new Set([
    "a", "an", "the", "and", "or", "but", "of", "to", "for", "in", "on", "at",
    "with", "by", "is", "are", "was", "were", "be", "this", "that", "it", "as",
  ]);
  const meaningful = words.filter((w) => !stop.has(w)).slice(0, 8);
  const slug = (meaningful.length ? meaningful : words.slice(0, 6)).join("-").replace(/-+/g, "-").slice(0, 60);
  return slug || "prompt";
}

export function canonicalRunId(repoName: string, prompt: string, suffix: string): string {
  const safeRepo = repoName.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "project";
  const prefix = `fractal-${safeRepo}`.replace(/-+/g, "-");
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
  const maxSlugLength = Math.max(12, 80 - prefix.length - safeSuffix.length - 2);
  const slug = slugifyPrompt(prompt).slice(0, maxSlugLength).replace(/-+$/g, "") || "prompt";
  return `${prefix}-${slug}-${safeSuffix}`.replace(/-+/g, "-");
}

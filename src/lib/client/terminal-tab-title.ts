function sessionSafeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function terminalTabTitle(
  session: string,
  project?: { name: string; path: string } | null,
): string {
  const title = session.replace(/^fractal-/, "");
  const prefixCandidates = project
    ? [project.name, project.path.split("/").filter(Boolean).at(-1) ?? ""]
    : [];
  for (const candidate of prefixCandidates) {
    const prefix = sessionSafeSegment(candidate);
    if (prefix && title.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)) {
      return title.slice(prefix.length + 1) || session;
    }
  }
  return title || session;
}

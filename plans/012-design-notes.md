# Plan 012: Design notes — Issue ↔ prompt linking

## Q1: Schema shape

**Recommendation: Option A — nullable `issueRef` column on `prompts`.**

A single nullable text column is the simplest representation that matches the real workflow: a prompt is created to tackle one specific issue. The ref format encodes both platform and identity:

- GitHub: `github:owner/repo#42`
- Linear: `linear:ABC-123`

Option B (junction table `prompt_issue_links`) is overbuilt for the current use case. A many-to-many link between prompts and issues presumes prompts routinely address multiple issues simultaneously, which is not the observed workflow. If that need emerges later, a junction table can be added alongside the column without breaking the single-ref path.

The column is nullable so existing prompts and newly created ones without an explicit link remain valid. Zero migration risk for existing DBs.

## Q2: How is a link created?

**Recommendation: Manual linking first, auto-detection deferred.**

Manual linking (user drags an issue card onto a prompt, or selects "Link to issue" from a prompt context menu) is explicit and gives the user full control. There is no ambiguity about intent.

Auto-detection (parsing `fixes #42` or `ABC-123` from prompt text) is convenient but opinionated:
- False positives: a prompt discussing multiple issues in prose could pick up the wrong ref.
- Fragility: different projects use different conventions (`closes`, `fixes`, `resolves`, `refs`).
- Surprising behavior: the user may not expect the link to be created.

Auto-detection can be added later as an opt-in enhancement (e.g., a checkbox "auto-link issues from text") once the manual flow is proven.

## Q3: How is it surfaced?

**Recommendation: A chip on the prompt `Card`, minimal for now.**

A small chip showing the linked issue (e.g., `#42` with a GitHub icon, or `ABC-123` with a Linear icon) on the prompt card is the minimal surface. It answers "which issue does this prompt address?" at a glance.

A "linked prompts" view on the issue card (the reverse direction) is deferred — it requires a reverse query that reads all prompts for a given `issueRef`, which is trivial to add but belongs in the UI implementation, not this spike.

Both directions should eventually exist; the chip on the prompt is the higher-value starting point because it's visible where the work is happening.

## Q4: Migration plan

The drizzle-kit workflow is:

1. Edit `src/lib/server/db/schema.ts` — add `issueRef: text("issue_ref")` to the `prompts` table.
2. Run `mise exec -- pnpm run db:generate` — produces a new migration file in `drizzle/`.
3. Run `mise exec -- tsx ./scripts/migrate.ts` — applies the migration.
4. Update `ensureSchema` in `src/lib/server/db/client.ts` to include the column in `CREATE TABLE IF NOT EXISTS` and an `ALTER TABLE` catch block for existing DBs.

The change is a nullable text column — purely additive. No data migration needed. Existing `prompts` rows get `NULL` for `issue_ref`. The `ALTER TABLE ADD COLUMN` is a safe operation in SQLite.

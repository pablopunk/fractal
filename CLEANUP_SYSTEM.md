# Fractal Cleanup System

This document describes the smart cleanup and archival system for Fractal prompts.

## Overview

Fractal now has intelligent resource management that automatically detects and handles:
- Deleted worktrees (automatically archives orphaned prompts)
- Tmux session cleanup when prompts are deleted
- Manual archival for keeping history without active resources
- Full deletion with complete resource teardown

## Features

### 1. **Automatic Orphan Detection**
- Every 30 seconds, the app runs a health check
- Detects prompts with worktrees that no longer exist on disk
- Automatically archives those prompts (`isArchived = true`)
- Archived prompts remain in the database but are hidden from the main board

**API Endpoint:** `POST /api/health-check`

### 2. **Smart Deletion**
When you delete a prompt, the system:
1. **Kills the tmux session** (if one exists)
2. **Removes the worktree** (if one exists)
   - Uses `git worktree remove`
   - Falls back to `git worktree prune` if removal fails
3. **Deletes from database**

**Supports both:**
- **In-worktree prompts:** Full cleanup (tmux + worktree + db)
- **In-place prompts:** Cleanup tmux session only (no worktree to remove)

**API Endpoint:** `DELETE /api/prompts/[id]`

### 3. **Manual Archival**
Archive a prompt without deleting it:
- Keeps history and prompt text
- Removes from board view
- Can be restored later
- Does NOT clean up resources (for in-place prompts)

**API Endpoint:** `POST /api/prompts/[id]/archive` (archive)
**API Endpoint:** `DELETE /api/prompts/[id]/archive` (unarchive)

### 4. **UI Components**

#### Main Board
- **Archive Button:** Move finished prompts to archive without full deletion
- **Delete Button:** Complete cleanup with resource removal
- **Auto-archival:** Orphaned worktrees auto-archive (shown in console/health-check)

#### Archived Section
- Collapsible section at bottom showing archived prompts
- **Restore Button:** Bring archived prompts back to the board
- **Delete Button:** Permanently delete archived prompts

## Database Schema

```ts
export const prompts = sqliteTable("prompts", {
  // ... existing fields ...
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  // ... timestamps ...
});
```

The `isArchived` field filters prompts:
- `false` (default) → Show on main board
- `true` → Move to archived section

## How to Use

### Archive a Finished Prompt
1. Click the **"archive"** button on the prompt card
2. Prompt moves to collapsed "Archived" section
3. Worktree and tmux stay intact (if exists)

### Delete and Clean Up Resources
1. Click **"delete"** button
2. System will:
   - Kill any active tmux session
   - Remove worktree from disk
   - Delete from database
3. Prompt disappears immediately

### Restore an Archived Prompt
1. Expand "Archived" section
2. Click **"restore"** button
3. Prompt returns to original column (usually "PROMPTS")

### View Auto-Archived Prompts
When worktree is manually deleted (outside Fractal):
1. Health check runs (every 30 seconds)
2. Detects missing worktree
3. Auto-archives the prompt
4. Prompt appears in "Archived" section

## Cleanup Utility Functions

Located in `src/lib/server/cleanup.ts`:

```ts
// Clean up a specific prompt by ID
await cleanupPromptById(promptId);

// Detect and clean/archive orphans
const { cleaned, archived } = await detectAndCleanupOrphans({
  delete: true,   // Delete orphans
  archive: true,  // Archive orphans
});

// Check if a prompt's resources are healthy
const isHealthy = await validatePromptHealth(prompt);

// Auto-archive all orphaned prompts
const archived = await autoArchiveOrphans();
```

## Git Integration

### Worktree Management
- `removeWorktree(repoPath, worktreePath)` - Remove with graceful fallback to prune
- Handles cases where worktree is already gone
- Automatically prunes broken references

### Tmux Management  
- `killSession(sessionName)` - Kill session safely
- Ignores if session already gone
- No errors on cleanup attempts

## Background Health Check

The UI calls `/api/health-check` every 30 seconds, which:
1. Scans all active prompts
2. Checks if worktrees still exist
3. Archives any orphaned prompts
4. Triggers UI refresh

You can also call it manually:
```bash
curl -X POST http://localhost:3000/api/health-check
```

## Error Handling

All cleanup operations are resilient:
- Missing tmux sessions are silently handled
- Gone worktrees don't block cleanup
- Database cleanup always completes
- Errors are logged but don't stop the process

## Future Enhancements

Potential improvements:
- [x] Auto-archive orphaned prompts
- [ ] Batch archive/delete operations
- [ ] Restore archive with clean state
- [ ] Archive pruning (auto-delete after N days)
- [ ] Archive search/filter

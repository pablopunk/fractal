import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Check,
  Copy,
  GitBranch,
  Pencil,
  Sparkles,
  SquareTerminal,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentPreset, ModelProfile, Prompt } from "~/lib/client/types.js";
import EditablePromptText from "./EditablePromptText.js";
import MarkdownText from "./MarkdownText.js";
import PresetIcon from "./PresetIcon.js";
import PresetPicker from "./PresetPicker.js";
import { extractImagePaths, LocalImageAttachment, parseImagePaths } from "./PromptMedia.js";
import Tooltip from "./Tooltip.js";

function PrStatusBadges({ prompt }: { prompt: Prompt }) {
  const ci = prompt.prCiStatus;
  const reviewCount = prompt.prReviewCount;
  const conflicts = prompt.prHasConflicts;

  // All green?
  const allGreen = ci === "pass" && reviewCount === 0 && conflicts === false;

  return (
    <span
      className="pr-status-badges"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {allGreen ? (
        <Tooltip content="PR ready — CI passing, no reviews, no conflicts">
          <span className="pr-badge green">
            <Check size={10} />
          </span>
        </Tooltip>
      ) : (
        <>
          <Tooltip
            content={
              ci === "pass"
                ? "CI passing"
                : ci === "fail"
                  ? "CI failing"
                  : ci === "pending"
                    ? "CI pending"
                    : "CI status unavailable"
            }
          >
            <span
              className={`pr-badge ${ci === "pass" ? "green" : ci === "fail" ? "red" : ci === "pending" ? "amber" : "gray"}`}
            >
              <span className="pr-badge-dot" />
            </span>
          </Tooltip>
          <Tooltip
            content={
              reviewCount === null
                ? "Reviews unavailable"
                : reviewCount === 0
                  ? "No review comments"
                  : `${reviewCount} review comment${reviewCount === 1 ? "" : "s"}`
            }
          >
            <span
              className={`pr-badge ${reviewCount === 0 ? "green" : reviewCount !== null ? "amber" : "gray"}`}
            >
              {reviewCount != null && reviewCount > 0 ? (
                reviewCount
              ) : (
                <span className="pr-badge-dot" />
              )}
            </span>
          </Tooltip>
          <Tooltip
            content={
              conflicts === false
                ? "No merge conflicts"
                : conflicts === true
                  ? "Merge conflicts"
                  : "Conflict status unavailable"
            }
          >
            <span
              className={`pr-badge ${conflicts === false ? "green" : conflicts === true ? "red" : "gray"}`}
            >
              {conflicts ? <AlertCircle size={10} /> : <span className="pr-badge-dot" />}
            </span>
          </Tooltip>
        </>
      )}
    </span>
  );
}

export function Card({
  prompt,
  presets,
  onDelete,
  onEdit,
  onArchive,
  onUnarchive,
  onOpenTerminal,
  onSummarize,
  isSummarizing,
  isActiveTerminal,
  isArchivedCol,
}: {
  prompt: Prompt;
  presets: AgentPreset[];
  onDelete: (id: string) => void | Promise<void>;
  onEdit: (
    id: string,
    patch: { text?: string; modelProfile?: ModelProfile; presetId?: string },
  ) => void | Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
  onUnarchive: (id: string) => void | Promise<void>;
  onOpenTerminal: (prompt: Prompt) => void;
  onSummarize?: (id: string) => void | Promise<void>;
  isSummarizing?: boolean;
  isActiveTerminal: boolean;
  isArchivedCol?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(prompt.text);
  const [editPresetId, setEditPresetId] = useState(prompt.presetId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prompt.id,
    disabled: isEditing,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isRunning = !!prompt.isRunning;
  const presetForBadge = presets.find((preset) => preset.id === prompt.presetId);
  const presetName = presetForBadge?.name ?? prompt.presetId;
  const imagePaths = useMemo(
    () => [...new Set([...parseImagePaths(prompt.imagePaths), ...extractImagePaths(prompt.text)])],
    [prompt.imagePaths, prompt.text],
  );
  const displayText =
    prompt.column === "PROMPTS" ? prompt.text : prompt.summary?.trim() || prompt.text;
  const isShowingSummary = prompt.column !== "PROMPTS" && !!prompt.summary?.trim();
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "archive" | "unarchive" | "delete" | null
  >(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    };
  }, []);

  async function copyWorktreeName() {
    if (!prompt.tmuxSession) return;
    try {
      await navigator.clipboard?.writeText(prompt.tmuxSession);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error("Failed to copy worktree name", e);
      setCopied(false);
    }
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditText(prompt.text);
    setEditPresetId(prompt.presetId);
  }

  async function runCardAction(
    action: NonNullable<typeof pendingAction>,
    task: () => void | Promise<void>,
  ) {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      await task();
      if (action === "save") setIsEditing(false);
    } finally {
      setPendingAction(null);
    }
  }

  function saveEdit() {
    void runCardAction("save", () => onEdit(prompt.id, { text: editText, presetId: editPresetId }));
  }

  if (isEditing) {
    return (
      <div className="card">
        <EditablePromptText
          value={editText}
          onChange={setEditText}
          className="text card-prompt-editor"
          autoFocus
          ariaLabel="Original prompt text"
          placeholder="Prompt text"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              saveEdit();
            }
            if (e.key === "Escape") {
              cancelEdit();
            }
          }}
        />
        <div className="card-actions" style={{ opacity: 1 }}>
          {prompt.column === "PROMPTS" && (
            <PresetPicker presets={presets} value={editPresetId} onChange={setEditPresetId} />
          )}
          <div style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={cancelEdit}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            onClick={saveEdit}
            disabled={!editText.trim() || !!pendingAction}
          >
            {pendingAction === "save" && <span className="btn-spinner" aria-hidden="true" />}
            {pendingAction === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`card ${isDragging ? "dragging" : ""} ${isActiveTerminal ? "active-terminal" : ""}`}
      style={style}
      onClick={() => {
        if (prompt.tmuxSession) onOpenTerminal(prompt);
      }}
      {...attributes}
      {...listeners}
    >
      {prompt.tmuxSession && prompt.isRunning && (
        <Tooltip content={isActiveTerminal ? "Active terminal" : "Terminal open"}>
          <div
            className={`terminal-card-button ${isActiveTerminal ? "active" : ""}`}
            aria-hidden="true"
          >
            <SquareTerminal size={18} />
          </div>
        </Tooltip>
      )}
      <Tooltip
        content={
          displayText === prompt.text ? (
            ""
          ) : (
            <>
              <span className="ai-helper-tooltip-title">Generated summary from</span>
              <div className="markdown-text tooltip-markdown">
                <MarkdownText text={prompt.text} />
              </div>
            </>
          )
        }
      >
        <div className="text markdown-text">
          <MarkdownText text={displayText} />
          {isShowingSummary && (
            <span className="ai-helper-mark" aria-label="Prompt summary was generated">
              ∗
            </span>
          )}
        </div>
      </Tooltip>
      {imagePaths.length > 0 && (
        <div className="image-attachments">
          {imagePaths.map((path) => (
            <LocalImageAttachment key={path} path={path} />
          ))}
        </div>
      )}
      {prompt.error && <span className="tag error">{prompt.error}</span>}
      <div className="card-footer">
        <div
          className="card-actions"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {prompt.column === "PROMPTS" ? (
            <PresetPicker
              presets={presets}
              value={prompt.presetId}
              onChange={(id) => {
                if (id !== prompt.presetId) void onEdit(prompt.id, { presetId: id });
              }}
            />
          ) : (
            <Tooltip content={prompt.presetId}>
              <span className="model-badge">
                {presetForBadge && <PresetIcon preset={presetForBadge} size={12} />}
                {presetName}
              </span>
            </Tooltip>
          )}
          <div className="card-actions-group">
            {copied && (
              <span className="copy-notice" role="status" aria-live="polite">
                Copied
              </span>
            )}
            {prompt.column !== "PROMPTS" && !prompt.summary?.trim() && onSummarize && (
              <Tooltip content={isSummarizing ? "Summarizing…" : "Summarize prompt"}>
                <button
                  className="icon-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={!!pendingAction || !!isSummarizing}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onSummarize(prompt.id);
                  }}
                  aria-label={isSummarizing ? "Summarizing prompt" : "Summarize prompt"}
                >
                  {isSummarizing ? (
                    <span className="btn-spinner" aria-hidden="true" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                </button>
              </Tooltip>
            )}
            <Tooltip content="Edit prompt">
              <button
                className="icon-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditText(prompt.text);
                  setEditPresetId(prompt.presetId);
                  setIsEditing(true);
                }}
                aria-label="Edit prompt"
              >
                <Pencil size={14} />
              </button>
            </Tooltip>
            {prompt.tmuxSession && (
              <Tooltip content="Copy worktree name">
                <button
                  type="button"
                  className="icon-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyWorktreeName();
                  }}
                  aria-label="Copy worktree name"
                >
                  <Copy size={14} />
                </button>
              </Tooltip>
            )}
            {prompt.prUrl && (
              <Tooltip content="Open pull request">
                <a
                  href={prompt.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Open pull request"
                >
                  <GitBranch size={14} />
                </a>
              </Tooltip>
            )}
            {isArchivedCol ? (
              <Tooltip content="Move prompt out of DONE">
                <button
                  className="icon-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={!!pendingAction}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runCardAction("unarchive", () => onUnarchive(prompt.id));
                  }}
                  aria-label="Move prompt out of DONE"
                >
                  {pendingAction === "unarchive" ? (
                    <span className="btn-spinner" aria-hidden="true" />
                  ) : (
                    <Undo2 size={14} />
                  )}
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Mark prompt as done">
                <button
                  className="icon-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={!!pendingAction}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runCardAction("archive", () => onArchive(prompt.id));
                  }}
                  aria-label="Mark prompt as done"
                >
                  {pendingAction === "archive" ? (
                    <span className="btn-spinner" aria-hidden="true" />
                  ) : (
                    <Check size={14} />
                  )}
                </button>
              </Tooltip>
            )}
            <Tooltip content="Delete prompt and cleanup resources">
              <button
                className="icon-btn danger"
                onPointerDown={(e) => e.stopPropagation()}
                disabled={!!pendingAction}
                onClick={(e) => {
                  e.stopPropagation();
                  void runCardAction("delete", () => onDelete(prompt.id));
                }}
                aria-label="Delete prompt and cleanup resources"
              >
                {pendingAction === "delete" ? (
                  <span className="btn-spinner" aria-hidden="true" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </Tooltip>
          </div>
        </div>
        {(prompt.column === "REVIEW" ||
          prompt.branch ||
          prompt.tmuxSession ||
          prompt.worktreePath ||
          isRunning) && (
          <div className="card-meta">
            {prompt.column === "REVIEW" ? (
              <PrStatusBadges prompt={prompt} />
            ) : (
              <>
                {isRunning && <span className="tag accent">running</span>}
                {prompt.tmuxSession && (
                  <Tooltip content={`Copy ${prompt.tmuxSession}`}>
                    <button
                      type="button"
                      className="tag tag-button"
                      aria-label={`Copy ${prompt.tmuxSession}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyWorktreeName();
                      }}
                    >
                      {prompt.tmuxSession}
                    </button>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

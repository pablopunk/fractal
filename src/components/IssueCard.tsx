import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GitBranch, Hash } from "lucide-react";
import type { GithubIssue, LinearIssue } from "~/lib/client/types.js";

export type BoardIssue = {
  id: string;
  kind: "github" | "linear";
  title: string;
  url: string;
  number?: number;
  identifier?: string;
  labels?: string[];
  priority?: string;
  state?: string;
};

function priorityColor(priority: string): string {
  if (priority === "urgent") return "var(--danger)";
  if (priority === "high") return "var(--warning, #d97706)";
  if (priority === "medium") return "var(--accent-secondary, #7c6ff7)";
  return "var(--text-faint)";
}

export function githubIssueId(issue: GithubIssue): string {
  return `gh:${issue.number}`;
}

export function linearIssueId(issue: LinearIssue): string {
  return `li:${issue.identifier}`;
}

export function issueFromGithub(issue: GithubIssue): BoardIssue {
  return {
    id: githubIssueId(issue),
    kind: "github",
    title: issue.title,
    url: issue.url,
    number: issue.number,
    labels: issue.labels,
  };
}

export function issueFromLinear(issue: LinearIssue): BoardIssue {
  return {
    id: linearIssueId(issue),
    kind: "linear",
    title: issue.title,
    url: issue.url,
    identifier: issue.identifier,
    priority: issue.priority,
    state: issue.state,
  };
}

export function SortableIssueCard({ issue }: { issue: BoardIssue }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isGithub = issue.kind === "github";

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <a
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`card issue-card ${isGithub ? "github-issue" : "linear-issue"}`}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      >
        <div className="issue-card-head">
          {isGithub ? (
            <GitBranch size={13} className="issue-card-icon" />
          ) : (
            <Hash size={13} className="issue-card-icon" />
          )}
          <span className="issue-card-number">
            {isGithub ? `#${issue.number}` : issue.identifier}
          </span>
          {!isGithub && issue.priority && (
            <span className="issue-card-state" style={{ color: priorityColor(issue.priority) }}>
              {issue.priority}
            </span>
          )}
        </div>
        <div className="text issue-card-title">{issue.title}</div>
        {isGithub && issue.labels && issue.labels.length > 0 && (
          <div className="issue-card-labels">
            {issue.labels.map((label) => (
              <span key={label} className="tag">
                {label}
              </span>
            ))}
          </div>
        )}
      </a>
    </div>
  );
}

/** Non-sortable static card for inline display (kept for reference) */
export function GithubIssueCard({ issue }: { issue: GithubIssue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card issue-card github-issue"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="issue-card-head">
        <GitBranch size={13} className="issue-card-icon" />
        <span className="issue-card-number">#{issue.number}</span>
      </div>
      <div className="text issue-card-title">{issue.title}</div>
      {issue.labels.length > 0 && (
        <div className="issue-card-labels">
          {issue.labels.map((label) => (
            <span key={label} className="tag">
              {label}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

export function LinearIssueCard({ issue }: { issue: LinearIssue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card issue-card linear-issue"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="issue-card-head">
        <Hash size={13} className="issue-card-icon" />
        <span className="issue-card-number">{issue.identifier}</span>
        <span className="issue-card-state" style={{ color: priorityColor(issue.priority) }}>
          {issue.priority}
        </span>
      </div>
      <div className="text issue-card-title">{issue.title}</div>
    </a>
  );
}

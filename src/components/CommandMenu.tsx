import { Command, useCommandState } from "cmdk";
import { Check, Copy, FolderKanban, Pencil, Play, SquareTerminal, Trash2 } from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import type { CommandRecent } from "~/lib/client/persistence.js";
import type { Project, Prompt, TerminalTab } from "~/lib/client/types.js";

type Props = {
  projects: Project[];
  prompts: Prompt[];
  activeProjectId: string | null;
  activeTabId: string | null;
  tabs: TerminalTab[];
  home: string;
  commandRecents: CommandRecent[];
  onSelectProject: (project: Project) => void;
  onOpenPromptTerminal: (prompt: Prompt) => void;
  onRunPrompt: (prompt: Prompt, target: "RUN_IN_PLACE" | "RUN_IN_WORKTREE") => void;
  onArchivePrompt: (prompt: Prompt) => void;
  onDeletePrompt: (prompt: Prompt) => void;
  onEditPrompt: (prompt: Prompt) => void;
};

type ActionItemProps = {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  value: string;
  badge?: ReactNode;
  onSelect: () => void;
};

export default function CommandMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const [runPrompt, setRunPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function run(action: () => void) {
    action();
    setRunPrompt(null);
    setOpen(false);
  }

  function copySession(value: string) {
    void navigator.clipboard?.writeText(value).catch(() => {});
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setRunPrompt(null);
      }}
      label="Command menu"
      className="cmdk-dialog"
      overlayClassName="cmdk-overlay"
      shouldFilter={!runPrompt}
      loop
    >
      <Command.Input
        className="cmdk-input"
        autoFocus
        placeholder={runPrompt ? `Run ${promptTitle(runPrompt)}…` : "Open project, prompt, or run…"}
      />
      <Command.List className="cmdk-list">
        <Command.Empty className="cmdk-empty">No results found.</Command.Empty>
        {runPrompt ? (
          <RunPromptChoices prompt={runPrompt} run={run} onRunPrompt={props.onRunPrompt} />
        ) : (
          <MenuItems
            {...props}
            run={run}
            copySession={copySession}
            onChooseRunPrompt={setRunPrompt}
          />
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function MenuItems(
  props: Props & {
    run: (action: () => void) => void;
    copySession: (value: string) => void;
    onChooseRunPrompt: (prompt: Prompt) => void;
  },
) {
  const search = useCommandState((state) => state.search);
  const showActions = search.length > 0;

  const recentsByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of props.commandRecents) {
      if (r.kind === "project") map.set(r.id, r.at);
    }
    return map;
  }, [props.commandRecents]);

  const recentsByPrompt = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of props.commandRecents) {
      if (r.kind === "prompt" || r.kind === "tab") map.set(r.id, r.at);
    }
    return map;
  }, [props.commandRecents]);

  const sortedProjects = useMemo(() => {
    return [...props.projects]
      .filter((p) => p.id !== props.activeProjectId)
      .sort((a, b) => {
        const ra = recentsByProject.get(a.id) ?? 0;
        const rb = recentsByProject.get(b.id) ?? 0;
        return rb - ra;
      });
  }, [props.projects, props.activeProjectId, recentsByProject]);

  const promptsByProject = useMemo(() => {
    return props.prompts.filter((p) => p.projectId === props.activeProjectId);
  }, [props.prompts, props.activeProjectId]);

  const startedPrompts = useMemo(() => {
    return promptsByProject.filter((p) => p.tmuxSession && !p.isArchived);
  }, [promptsByProject]);

  const sortedStartedPrompts = useMemo(() => {
    return [...startedPrompts].sort((a, b) => {
      const ra = Math.max(
        recentsByPrompt.get(a.id) ?? 0,
        a.tmuxSession ? (recentsByPrompt.get(a.tmuxSession) ?? 0) : 0,
      );
      const rb = Math.max(
        recentsByPrompt.get(b.id) ?? 0,
        b.tmuxSession ? (recentsByPrompt.get(b.tmuxSession) ?? 0) : 0,
      );
      return rb - ra;
    });
  }, [startedPrompts, recentsByPrompt]);

  const runnablePrompts = useMemo(() => {
    return promptsByProject.filter(
      (p) => !p.isArchived && !p.tmuxSession && p.column === "PROMPTS",
    );
  }, [promptsByProject]);

  const activeTabPrompt = useMemo(() => {
    const tab = props.tabs.find((item) => item.id === props.activeTabId);
    if (!tab) return null;
    return (
      promptsByProject.find(
        (prompt) => prompt.id === tab.promptId || prompt.tmuxSession === tab.session,
      ) ?? null
    );
  }, [props.tabs, props.activeTabId, promptsByProject]);

  function run(action: () => void) {
    action();
  }

  return (
    <>
      {sortedProjects.map((project) => (
        <Command.Item
          key={`project:${project.id}`}
          value={`project ${project.name} ${project.path}`}
          className="cmdk-item"
          onSelect={() => props.run(() => props.onSelectProject(project))}
        >
          <FolderKanban className="cmdk-icon" aria-hidden="true" />
          <span className="cmdk-item-main">
            <span>{project.name}</span>
            <span className="cmdk-item-sub">{tildeify(project.path, props.home)}</span>
          </span>
        </Command.Item>
      ))}

      {sortedStartedPrompts.map((prompt) => (
        <Command.Item
          key={`started:${prompt.id}`}
          value={`terminal ${prompt.summary ?? ""} ${prompt.text} ${prompt.tmuxSession ?? ""}`}
          className="cmdk-item"
          onSelect={() => props.run(() => props.onOpenPromptTerminal(prompt))}
        >
          <SquareTerminal className="cmdk-icon" aria-hidden="true" />
          <span className="cmdk-item-main">
            <span>{promptTitle(prompt)}</span>
            <span className="cmdk-item-sub">{prompt.tmuxSession}</span>
          </span>
          {prompt.isRunning && <span className="cmdk-badge">running</span>}
        </Command.Item>
      ))}

      {runnablePrompts.map((prompt) => (
        <Command.Item
          key={`run:${prompt.id}`}
          value={`run tackle ${prompt.summary ?? ""} ${prompt.text}`}
          className="cmdk-item"
          onSelect={() => props.onChooseRunPrompt(prompt)}
        >
          <Play className="cmdk-icon" aria-hidden="true" />
          <span className="cmdk-item-main">
            <span>{promptTitle(prompt)}</span>
            <span className="cmdk-item-sub">Run prompt</span>
          </span>
        </Command.Item>
      ))}

      {showActions && activeTabPrompt && (
        <StartedPromptActions
          prompt={activeTabPrompt}
          run={run}
          copySession={props.copySession}
          onOpenPromptTerminal={props.onOpenPromptTerminal}
          onArchivePrompt={props.onArchivePrompt}
          onEditPrompt={props.onEditPrompt}
          onDeletePrompt={props.onDeletePrompt}
        />
      )}
    </>
  );
}

function StartedPromptActions(props: {
  prompt: Prompt;
  run: (action: () => void) => void;
  copySession: (value: string) => void;
  onOpenPromptTerminal: (prompt: Prompt) => void;
  onArchivePrompt: (prompt: Prompt) => void;
  onEditPrompt: (prompt: Prompt) => void;
  onDeletePrompt: (prompt: Prompt) => void;
}) {
  const title = promptTitle(props.prompt);
  return (
    <>
      {props.prompt.tmuxSession && (
        <ActionItem
          icon={SquareTerminal}
          title={`Focus terminal: ${title}`}
          subtitle={props.prompt.tmuxSession}
          value={`focus terminal ${props.prompt.text} ${props.prompt.tmuxSession}`}
          onSelect={() => props.run(() => props.onOpenPromptTerminal(props.prompt))}
        />
      )}
      {props.prompt.tmuxSession && (
        <ActionItem
          icon={Copy}
          title={`Copy session: ${title}`}
          subtitle={props.prompt.tmuxSession}
          value={`copy session ${props.prompt.text} ${props.prompt.tmuxSession}`}
          onSelect={() => props.run(() => props.copySession(props.prompt.tmuxSession!))}
        />
      )}
      <ActionItem
        icon={Check}
        title={`Done: ${title}`}
        subtitle="Mark complete"
        value={`done ${props.prompt.text} ${props.prompt.summary ?? ""}`}
        onSelect={() => props.run(() => props.onArchivePrompt(props.prompt))}
      />
      <ActionItem
        icon={Pencil}
        title={`Edit: ${title}`}
        subtitle="Prompt text and preset"
        value={`edit ${props.prompt.text} ${props.prompt.summary ?? ""}`}
        onSelect={() => props.run(() => props.onEditPrompt(props.prompt))}
      />
      <ActionItem
        icon={Trash2}
        title={`Remove: ${title}`}
        subtitle="Delete prompt and cleanup resources"
        value={`remove ${props.prompt.text} ${props.prompt.summary ?? ""}`}
        onSelect={() => props.run(() => props.onDeletePrompt(props.prompt))}
      />
    </>
  );
}

function RunPromptChoices(props: {
  prompt: Prompt;
  run: (action: () => void) => void;
  onRunPrompt: Props["onRunPrompt"];
}) {
  const title = promptTitle(props.prompt);
  return (
    <>
      <ActionItem
        icon={Play}
        title="Run in place"
        subtitle={title}
        value="run in place"
        onSelect={() => props.run(() => props.onRunPrompt(props.prompt, "RUN_IN_PLACE"))}
      />
      <ActionItem
        icon={FolderKanban}
        title="Run in worktree"
        subtitle={title}
        value="run in worktree"
        onSelect={() => props.run(() => props.onRunPrompt(props.prompt, "RUN_IN_WORKTREE"))}
      />
    </>
  );
}

function ActionItem(props: ActionItemProps) {
  const Icon = props.icon;
  return (
    <Command.Item value={props.value} className="cmdk-item" onSelect={props.onSelect}>
      <Icon className="cmdk-icon" aria-hidden="true" />
      <span className="cmdk-item-main">
        <span>{props.title}</span>
        {props.subtitle && <span className="cmdk-item-sub">{props.subtitle}</span>}
      </span>
      {props.badge && <span className="cmdk-badge">{props.badge}</span>}
    </Command.Item>
  );
}

function promptTitle(prompt: Prompt): string {
  const text = prompt.summary?.trim() || prompt.text.trim() || "Untitled prompt";
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

function tildeify(abs: string, home: string): string {
  if (!home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(`${home}/`)) return `~${abs.slice(home.length)}`;
  return abs;
}

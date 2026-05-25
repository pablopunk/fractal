import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Command } from "cmdk";
import { Check, Copy, FolderKanban, FolderRoot, Pencil, Play, Settings, SquareTerminal, Trash2, Undo2, X } from "lucide-react";
import { TERMINAL_THEME_OPTIONS, terminalThemePreview } from "~/lib/client/terminal-themes.js";
import type { Column, Project, Prompt, TerminalTab } from "~/lib/client/types.js";
import type { TerminalThemeName, ThemeMode } from "~/lib/client/persistence.js";

type CommandColumn = { id: Column; title: string; icon: ComponentType<{ className?: string }> };

type Props = {
  projects: Project[];
  prompts: Prompt[];
  tabs: TerminalTab[];
  columns: CommandColumn[];
  collapsedColumns: Record<Column, boolean>;
  activeProject: Project | null;
  activeProjectId: string | null;
  activeTabId: string | null;
  home: string;
  theme: ThemeMode;
  terminalThemeName: TerminalThemeName;
  hasDonePrompts: boolean;
  onSelectProject: (project: Project) => void;
  onSelectTab: (tab: TerminalTab) => void;
  onCloseTab: (tab: TerminalTab) => void;
  onRunPrompt: (prompt: Prompt, target: "RUN_IN_PLACE" | "RUN_IN_WORKTREE") => void;
  onArchivePrompt: (prompt: Prompt) => void;
  onUnarchivePrompt: (prompt: Prompt) => void;
  onDeletePrompt: (prompt: Prompt) => void;
  onEditPrompt: (prompt: Prompt) => void;
  onOpenPromptTerminal: (prompt: Prompt) => void;
  onOpenPresets: () => void;
  onOpenProjectTerminal: (project: Project) => void;
  onClearDone: () => void;
  onToggleTerminalPosition: () => void;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
  onToggleColumn: (column: Column) => void;
  onFocusComposer: () => void;
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
  const promptBySession = useMemo(() => {
    const map = new Map<string, Prompt>();
    for (const prompt of props.prompts) {
      if (prompt.tmuxSession) map.set(prompt.tmuxSession, prompt);
    }
    return map;
  }, [props.prompts]);

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
    setOpen(false);
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value).catch(() => {});
  }

  const runnablePrompts = props.prompts.filter((prompt) => !prompt.isArchived && !prompt.tmuxSession && prompt.column === "PROMPTS");
  const activePrompts = props.prompts.filter((prompt) => !prompt.isArchived && (prompt.tmuxSession || prompt.column !== "PROMPTS"));
  const archivedPrompts = props.prompts.filter((prompt) => prompt.isArchived);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu" className="cmdk-dialog" overlayClassName="cmdk-overlay" shouldFilter loop>
      <Command.Input className="cmdk-input" autoFocus placeholder="Run command, open project, prompt, or tab…" />
      <Command.List className="cmdk-list">
        <Command.Empty className="cmdk-empty">No results found.</Command.Empty>

        <Command.Group heading="Actions" className="cmdk-group">
          {props.activeProject && (
            <ActionItem
              icon={SquareTerminal}
              title="Open project terminal"
              subtitle={tildeify(props.activeProject.path, props.home)}
              value={`open project terminal ${props.activeProject.name} ${props.activeProject.path}`}
              onSelect={() => run(() => props.onOpenProjectTerminal(props.activeProject!))}
            />
          )}
          <ActionItem icon={Settings} title="Open presets" subtitle="Agent presets and defaults" value="open presets agent settings" onSelect={() => run(props.onOpenPresets)} />
          <ActionItem icon={SquareTerminal} title="Toggle terminal position" subtitle="Move terminal between right and bottom" value="toggle terminal position right bottom" onSelect={() => run(props.onToggleTerminalPosition)} />
          <ActionItem icon={FolderRoot} title="Focus composer" subtitle="Jump to the prompt input" value="focus composer prompt input" onSelect={() => run(props.onFocusComposer)} />
          {props.hasDonePrompts && <ActionItem icon={Trash2} title="Clear DONE" subtitle="Delete archived prompts for this project" value="clear done archived prompts" onSelect={() => run(props.onClearDone)} />}
        </Command.Group>

        <Command.Group heading="Columns" className="cmdk-group">
          {props.columns.map((column) => (
            <ActionItem
              key={`column:${column.id}`}
              icon={column.icon}
              title={`${props.collapsedColumns[column.id] ? "Expand" : "Collapse"} ${column.title}`}
              subtitle="Board navigation"
              value={`column ${column.title} ${column.id} ${props.collapsedColumns[column.id] ? "expand" : "collapse"}`}
              onSelect={() => run(() => props.onToggleColumn(column.id))}
            />
          ))}
        </Command.Group>

        <Command.Group heading="Terminal themes" className="cmdk-group">
          {TERMINAL_THEME_OPTIONS.map((option) => {
            const preview = terminalThemePreview(props.theme, option.id);
            return (
              <Command.Item
                key={`terminal-theme:${option.id}`}
                value={`terminal theme ${option.label} ${option.id}`}
                className="cmdk-item"
                onSelect={() => run(() => props.onTerminalThemeChange(option.id))}
              >
                <span className="cmdk-theme-swatch" style={{ "--cmdk-theme-bg": preview.background, "--cmdk-theme-fg": preview.foreground, "--cmdk-theme-accent": preview.accent } as CSSProperties} />
                <span className="cmdk-item-main">
                  <span>{option.label}</span>
                  <span className="cmdk-item-sub">Terminal theme</span>
                </span>
                {props.terminalThemeName === option.id && <span className="cmdk-badge">current</span>}
              </Command.Item>
            );
          })}
        </Command.Group>

        {runnablePrompts.length > 0 && (
          <Command.Group heading="Prompts" className="cmdk-group">
            {runnablePrompts.map((prompt) => (
              <PromptActions key={prompt.id} prompt={prompt} home={props.home} run={run} onRunPrompt={props.onRunPrompt} onEditPrompt={props.onEditPrompt} onDeletePrompt={props.onDeletePrompt} />
            ))}
          </Command.Group>
        )}

        {activePrompts.length > 0 && (
          <Command.Group heading="Running prompts" className="cmdk-group">
            {activePrompts.map((prompt) => (
              <ActivePromptActions
                key={prompt.id}
                prompt={prompt}
                home={props.home}
                isTerminalOpen={!!prompt.tmuxSession && props.tabs.some((tab) => tab.id === prompt.tmuxSession)}
                run={run}
                copy={copy}
                onOpenPromptTerminal={props.onOpenPromptTerminal}
                onArchivePrompt={props.onArchivePrompt}
                onEditPrompt={props.onEditPrompt}
                onDeletePrompt={props.onDeletePrompt}
              />
            ))}
          </Command.Group>
        )}

        {archivedPrompts.length > 0 && (
          <Command.Group heading="DONE" className="cmdk-group">
            {archivedPrompts.map((prompt) => (
              <ArchivedPromptActions key={prompt.id} prompt={prompt} run={run} onUnarchivePrompt={props.onUnarchivePrompt} onDeletePrompt={props.onDeletePrompt} />
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Projects" className="cmdk-group">
          {props.projects.map((project) => (
            <Command.Item
              key={`project:${project.id}`}
              value={`project ${project.name} ${project.path}`}
              className="cmdk-item"
              onSelect={() => run(() => props.onSelectProject(project))}
            >
              <FolderKanban className="cmdk-icon" aria-hidden="true" />
              <span className="cmdk-item-main">
                <span>{project.name}</span>
                <span className="cmdk-item-sub">{tildeify(project.path, props.home)}</span>
              </span>
              {project.id === props.activeProjectId && <span className="cmdk-badge">current</span>}
            </Command.Item>
          ))}
        </Command.Group>

        {props.tabs.length > 0 && (
          <Command.Group heading="Tabs" className="cmdk-group">
            {props.tabs.map((tab) => {
              const prompt = promptBySession.get(tab.session);
              return (
                <Command.Item
                  key={`tab:${tab.id}`}
                  value={`tab terminal focus ${tab.title} ${tab.session} ${tab.cwd ?? ""}`}
                  className="cmdk-item"
                  onSelect={() => run(() => props.onSelectTab(tab))}
                >
                  <SquareTerminal className="cmdk-icon" aria-hidden="true" />
                  <span className="cmdk-item-main">
                    <span>{tab.title}</span>
                    <span className="cmdk-item-sub">{tab.cwd ? tildeify(tab.cwd, props.home) : tab.session}</span>
                  </span>
                  {prompt?.isRunning && <span className="cmdk-badge">running</span>}
                  {tab.id === props.activeTabId && <span className="cmdk-badge">focused</span>}
                </Command.Item>
              );
            })}
            {props.tabs.map((tab) => (
              <ActionItem
                key={`close-tab:${tab.id}`}
                icon={X}
                title={`Close terminal tab: ${tab.title}`}
                subtitle={tab.session}
                value={`close terminal tab ${tab.title} ${tab.session}`}
                onSelect={() => run(() => props.onCloseTab(tab))}
              />
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
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

function PromptActions(props: { prompt: Prompt; home: string; run: (action: () => void) => void; onRunPrompt: Props["onRunPrompt"]; onEditPrompt: Props["onEditPrompt"]; onDeletePrompt: Props["onDeletePrompt"] }) {
  const title = promptTitle(props.prompt);
  return (
    <>
      <ActionItem icon={Play} title={`Run in place: ${title}`} subtitle={promptSubtitle(props.prompt, props.home)} value={`prompt run in place ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onRunPrompt(props.prompt, "RUN_IN_PLACE"))} />
      <ActionItem icon={FolderKanban} title={`Run in worktree: ${title}`} subtitle={promptSubtitle(props.prompt, props.home)} value={`prompt run worktree ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onRunPrompt(props.prompt, "RUN_IN_WORKTREE"))} />
      <ActionItem icon={Pencil} title={`Edit: ${title}`} subtitle="Prompt text and preset" value={`prompt edit ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onEditPrompt(props.prompt))} />
      <ActionItem icon={Trash2} title={`Remove: ${title}`} subtitle="Delete prompt" value={`prompt remove delete ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onDeletePrompt(props.prompt))} />
    </>
  );
}

function ActivePromptActions(props: { prompt: Prompt; home: string; isTerminalOpen: boolean; run: (action: () => void) => void; copy: (value: string) => void; onOpenPromptTerminal: Props["onOpenPromptTerminal"]; onArchivePrompt: Props["onArchivePrompt"]; onEditPrompt: Props["onEditPrompt"]; onDeletePrompt: Props["onDeletePrompt"] }) {
  const title = promptTitle(props.prompt);
  return (
    <>
      {props.prompt.tmuxSession && <ActionItem icon={SquareTerminal} title={`${props.isTerminalOpen ? "Focus" : "Open"} terminal: ${title}`} subtitle={props.prompt.tmuxSession} value={`prompt terminal focus open ${props.prompt.text} ${props.prompt.tmuxSession}`} onSelect={() => props.run(() => props.onOpenPromptTerminal(props.prompt))} />}
      {props.prompt.tmuxSession && <ActionItem icon={Copy} title={`Copy session: ${title}`} subtitle={props.prompt.tmuxSession} value={`prompt copy session tmux ${props.prompt.text} ${props.prompt.tmuxSession}`} onSelect={() => props.run(() => props.copy(props.prompt.tmuxSession!))} />}
      <ActionItem icon={Check} title={`Done: ${title}`} subtitle={promptSubtitle(props.prompt, props.home)} value={`prompt done archive ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onArchivePrompt(props.prompt))} />
      <ActionItem icon={Pencil} title={`Edit: ${title}`} subtitle="Prompt text and preset" value={`prompt edit ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onEditPrompt(props.prompt))} />
      <ActionItem icon={Trash2} title={`Remove: ${title}`} subtitle="Delete prompt and cleanup resources" value={`prompt remove delete ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onDeletePrompt(props.prompt))} />
    </>
  );
}

function ArchivedPromptActions(props: { prompt: Prompt; run: (action: () => void) => void; onUnarchivePrompt: Props["onUnarchivePrompt"]; onDeletePrompt: Props["onDeletePrompt"] }) {
  const title = promptTitle(props.prompt);
  return (
    <>
      <ActionItem icon={Undo2} title={`Move out of DONE: ${title}`} subtitle="Restore prompt" value={`prompt restore unarchive done ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onUnarchivePrompt(props.prompt))} />
      <ActionItem icon={Trash2} title={`Remove: ${title}`} subtitle="Delete prompt" value={`prompt remove delete archived done ${props.prompt.text} ${props.prompt.summary ?? ""}`} onSelect={() => props.run(() => props.onDeletePrompt(props.prompt))} />
    </>
  );
}

function promptTitle(prompt: Prompt): string {
  const text = prompt.summary?.trim() || prompt.text.trim() || "Untitled prompt";
  return text.length > 72 ? text.slice(0, 71) + "…" : text;
}

function promptSubtitle(prompt: Prompt, home: string): string {
  if (prompt.worktreePath) return tildeify(prompt.worktreePath, home);
  if (prompt.tmuxSession) return prompt.tmuxSession;
  return prompt.column === "PROMPTS" ? "Backlog prompt" : prompt.column.replaceAll("_", " ").toLowerCase();
}

function tildeify(abs: string, home: string): string {
  if (!home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}

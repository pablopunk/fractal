import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Command } from "cmdk";
import { Check, Copy, Droplets, FolderKanban, FolderRoot, Minus, Pencil, Play, Plus, Settings, SquareTerminal, Trash2, Undo2, X } from "lucide-react";
import { TERMINAL_THEME_OPTIONS, terminalThemePreview } from "~/lib/client/terminal-themes.js";
import type { Column, Project, Prompt, TerminalTab } from "~/lib/client/types.js";
import type { CommandRecent, GlassSettings, TerminalThemeName, ThemeMode } from "~/lib/client/persistence.js";

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
  glass: GlassSettings;
  commandRecents: CommandRecent[];
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
  onGlassChange: (settings: GlassSettings) => void;
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

type RecentEntry =
  | { key: string; kind: "project"; project: Project }
  | { key: string; kind: "prompt"; prompt: Prompt }
  | { key: string; kind: "tab"; tab: TerminalTab; prompt?: Prompt };

export default function CommandMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const promptBySession = useMemo(() => {
    const map = new Map<string, Prompt>();
    for (const prompt of props.prompts) {
      if (prompt.tmuxSession) map.set(prompt.tmuxSession, prompt);
    }
    return map;
  }, [props.prompts]);

  const recentEntries = useMemo(
    () => resolveRecentEntries(props.commandRecents, props.projects, props.prompts, props.tabs, promptBySession),
    [props.commandRecents, props.projects, props.prompts, props.tabs, promptBySession],
  );

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

  function updateGlass(patch: Partial<GlassSettings>) {
    props.onGlassChange({ ...props.glass, ...patch });
  }

  const glassOpacity = Math.round(props.glass.opacity * 100);
  const glassBlur = Math.round(props.glass.blur);
  const glassSubtitle = `Opacity ${glassOpacity}% · Blur ${glassBlur}px`;
  const runnablePrompts = props.prompts.filter((prompt) => !prompt.isArchived && !prompt.tmuxSession && prompt.column === "PROMPTS");
  const activePrompts = props.prompts.filter((prompt) => !prompt.isArchived && (prompt.tmuxSession || prompt.column !== "PROMPTS"));
  const archivedPrompts = props.prompts.filter((prompt) => prompt.isArchived);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu" className="cmdk-dialog" overlayClassName="cmdk-overlay" shouldFilter loop>
      <Command.Input className="cmdk-input" autoFocus placeholder="Run command, open project, prompt, or tab…" />
      <Command.List className="cmdk-list">
        <Command.Empty className="cmdk-empty">No results found.</Command.Empty>

        {recentEntries.length > 0 && (
          <Command.Group heading="Recent" className="cmdk-group">
            {recentEntries.map((entry) => (
              <RecentEntryItem
                key={entry.key}
                entry={entry}
                home={props.home}
                tabs={props.tabs}
                run={run}
                copy={copy}
                onSelectProject={props.onSelectProject}
                onSelectTab={props.onSelectTab}
                onRunPrompt={props.onRunPrompt}
                onEditPrompt={props.onEditPrompt}
                onDeletePrompt={props.onDeletePrompt}
                onOpenPromptTerminal={props.onOpenPromptTerminal}
                onArchivePrompt={props.onArchivePrompt}
                onUnarchivePrompt={props.onUnarchivePrompt}
              />
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

        <Command.Group heading="Glass" className="cmdk-group">
          <ActionItem icon={Droplets} title={`${props.glass.enabled ? "Disable" : "Enable"} opacity + blur`} subtitle={glassSubtitle} value={`glass opacity blur ${props.glass.enabled ? "disable off" : "enable on"} ${glassOpacity} ${glassBlur}`} onSelect={() => run(() => updateGlass({ enabled: !props.glass.enabled }))} />
          <ActionItem icon={Minus} title="Decrease glass opacity" subtitle={`${Math.round(clamp(props.glass.opacity - 0.05, 0.45, 1) * 100)}%`} value="glass opacity decrease lower more transparent" onSelect={() => run(() => updateGlass({ opacity: roundGlass(clamp(props.glass.opacity - 0.05, 0.45, 1)) }))} />
          <ActionItem icon={Plus} title="Increase glass opacity" subtitle={`${Math.round(clamp(props.glass.opacity + 0.05, 0.45, 1) * 100)}%`} value="glass opacity increase higher less transparent" onSelect={() => run(() => updateGlass({ opacity: roundGlass(clamp(props.glass.opacity + 0.05, 0.45, 1)) }))} />
          <ActionItem icon={Minus} title="Decrease glass blur" subtitle={`${Math.round(clamp(props.glass.blur - 4, 0, 40))}px`} value="glass blur decrease lower sharper" onSelect={() => run(() => updateGlass({ blur: Math.round(clamp(props.glass.blur - 4, 0, 40)) }))} />
          <ActionItem icon={Plus} title="Increase glass blur" subtitle={`${Math.round(clamp(props.glass.blur + 4, 0, 40))}px`} value="glass blur increase higher softer" onSelect={() => run(() => updateGlass({ blur: Math.round(clamp(props.glass.blur + 4, 0, 40)) }))} />
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

function RecentEntryItem(props: {
  entry: RecentEntry;
  home: string;
  tabs: TerminalTab[];
  run: (action: () => void) => void;
  copy: (value: string) => void;
  onSelectProject: Props["onSelectProject"];
  onSelectTab: Props["onSelectTab"];
  onRunPrompt: Props["onRunPrompt"];
  onArchivePrompt: Props["onArchivePrompt"];
  onUnarchivePrompt: Props["onUnarchivePrompt"];
  onDeletePrompt: Props["onDeletePrompt"];
  onEditPrompt: Props["onEditPrompt"];
  onOpenPromptTerminal: Props["onOpenPromptTerminal"];
}) {
  if (props.entry.kind === "project") {
    const project = props.entry.project;
    return (
      <ActionItem
        icon={FolderKanban}
        title={project.name}
        subtitle={tildeify(project.path, props.home)}
        value={`recent project ${project.name} ${project.path}`}
        onSelect={() => props.run(() => props.onSelectProject(project))}
      />
    );
  }

  if (props.entry.kind === "tab") {
    const { tab, prompt } = props.entry;
    return (
      <Command.Item
        value={`recent tab terminal focus ${tab.title} ${tab.session} ${tab.cwd ?? ""}`}
        className="cmdk-item"
        onSelect={() => props.run(() => props.onSelectTab(tab))}
      >
        <SquareTerminal className="cmdk-icon" aria-hidden="true" />
        <span className="cmdk-item-main">
          <span>{tab.title}</span>
          <span className="cmdk-item-sub">{tab.cwd ? tildeify(tab.cwd, props.home) : tab.session}</span>
        </span>
        {prompt?.isRunning && <span className="cmdk-badge">running</span>}
      </Command.Item>
    );
  }

  const prompt = props.entry.prompt;
  if (prompt.isArchived) {
    return <ArchivedPromptActions prompt={prompt} run={props.run} onUnarchivePrompt={props.onUnarchivePrompt} onDeletePrompt={props.onDeletePrompt} />;
  }

  if (prompt.tmuxSession || prompt.column !== "PROMPTS") {
    return (
      <ActivePromptActions
        prompt={prompt}
        home={props.home}
        isTerminalOpen={!!prompt.tmuxSession && props.tabs.some((tab) => tab.id === prompt.tmuxSession)}
        run={props.run}
        copy={props.copy}
        onOpenPromptTerminal={props.onOpenPromptTerminal}
        onArchivePrompt={props.onArchivePrompt}
        onEditPrompt={props.onEditPrompt}
        onDeletePrompt={props.onDeletePrompt}
      />
    );
  }

  return (
    <PromptActions
      prompt={prompt}
      home={props.home}
      run={props.run}
      onRunPrompt={props.onRunPrompt}
      onEditPrompt={props.onEditPrompt}
      onDeletePrompt={props.onDeletePrompt}
    />
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

function resolveRecentEntries(recents: CommandRecent[], projects: Project[], prompts: Prompt[], tabs: TerminalTab[], promptBySession: Map<string, Prompt>): RecentEntry[] {
  const entries: RecentEntry[] = [];
  const seen = new Set<string>();

  for (const recent of recents) {
    const key = `${recent.kind}:${recent.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (recent.kind === "project") {
      const project = projects.find((item) => item.id === recent.id);
      if (project) entries.push({ key, kind: "project", project });
    } else if (recent.kind === "prompt") {
      const prompt = prompts.find((item) => item.id === recent.id);
      if (prompt) entries.push({ key, kind: "prompt", prompt });
    } else {
      const tab = tabs.find((item) => item.id === recent.id);
      if (tab) entries.push({ key, kind: "tab", tab, prompt: promptBySession.get(tab.session) });
    }

    if (entries.length >= 5) break;
  }

  return entries;
}

function tildeify(abs: string, home: string): string {
  if (!home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundGlass(value: number): number {
  return Math.round(value * 100) / 100;
}

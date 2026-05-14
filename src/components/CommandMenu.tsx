import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { FolderKanban, MessageSquareText, SquareTerminal } from "lucide-react";

type Project = { id: string; name: string; path: string };
type Prompt = {
  id: string;
  projectId: string;
  text: string;
  imagePaths: string;
  modelProfile: "fast" | "smart";
  presetId: string;
  column: "PROMPTS" | "RUN_IN_PLACE" | "RUN_IN_WORKTREE" | "ARCHIVED";
  runMode?: "in_place" | "worktree" | null;
  branch?: string | null;
  worktreePath?: string | null;
  tmuxSession?: string | null;
  error?: string | null;
  isArchived?: boolean | null;
  launchedAt?: number | null;
  isRunning?: boolean;
};

type Props = {
  projects: Project[];
  prompts: Prompt[];
  activeProjectId: string | null;
  home: string;
  onSelectProject: (project: Project) => void;
  onSelectPrompt: (prompt: Prompt) => void;
};

export default function CommandMenu(props: Props) {
  const [open, setOpen] = useState(false);

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

  const runnablePrompts = useMemo(
    () => props.prompts.filter((prompt) => (prompt.column === "RUN_IN_PLACE" || prompt.column === "RUN_IN_WORKTREE") && prompt.tmuxSession),
    [props.prompts],
  );

  function run(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu" className="cmdk-dialog" overlayClassName="cmdk-overlay" shouldFilter loop>
      <Command.Input className="cmdk-input" autoFocus placeholder="Open project or prompt…" />
      <Command.List className="cmdk-list">
        <Command.Empty className="cmdk-empty">No results found.</Command.Empty>
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
        {runnablePrompts.length > 0 && (
          <Command.Group heading="Prompts" className="cmdk-group">
            {runnablePrompts.map((prompt) => {
              const project = props.projects.find((p) => p.id === prompt.projectId);
              return (
                <Command.Item
                  key={`prompt:${prompt.id}`}
                  value={`prompt ${prompt.text} ${prompt.tmuxSession ?? ""} ${project?.name ?? ""}`}
                  className="cmdk-item"
                  onSelect={() => run(() => props.onSelectPrompt(prompt))}
                >
                  {prompt.column === "RUN_IN_WORKTREE" ? <FolderKanban className="cmdk-icon" aria-hidden="true" /> : <SquareTerminal className="cmdk-icon" aria-hidden="true" />}
                  <span className="cmdk-item-main">
                    <span>{prompt.text.trim() || prompt.tmuxSession}</span>
                    <span className="cmdk-item-sub"><MessageSquareText className="cmdk-sub-icon" aria-hidden="true" /> {project?.name ?? "Unknown project"} · {prompt.column === "RUN_IN_WORKTREE" ? "worktree" : "in place"}</span>
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function tildeify(abs: string, home: string): string {
  if (!home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}

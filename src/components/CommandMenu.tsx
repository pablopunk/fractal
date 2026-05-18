import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { FolderKanban, SquareTerminal } from "lucide-react";
import type { Project, TerminalTab } from "~/lib/client/types.js";

type Props = {
  projects: Project[];
  tabs: TerminalTab[];
  activeProjectId: string | null;
  activeTabId: string | null;
  home: string;
  onSelectProject: (project: Project) => void;
  onSelectTab: (tab: TerminalTab) => void;
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

  function run(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu" className="cmdk-dialog" overlayClassName="cmdk-overlay" shouldFilter loop>
      <Command.Input className="cmdk-input" autoFocus placeholder="Open project or tab…" />
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
        {props.tabs.length > 0 && (
          <Command.Group heading="Tabs" className="cmdk-group">
            {props.tabs.map((tab) => (
              <Command.Item
                key={`tab:${tab.id}`}
                value={`tab ${tab.title} ${tab.session} ${tab.cwd ?? ""}`}
                className="cmdk-item"
                onSelect={() => run(() => props.onSelectTab(tab))}
              >
                <SquareTerminal className="cmdk-icon" aria-hidden="true" />
                <span className="cmdk-item-main">
                  <span>{tab.title}</span>
                  <span className="cmdk-item-sub">{tab.cwd ? tildeify(tab.cwd, props.home) : tab.session}</span>
                </span>
                {tab.id === props.activeTabId && <span className="cmdk-badge">focused</span>}
              </Command.Item>
            ))}
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

import { useState } from "react";
import Portal from "./Portal.js";
import PresetPicker from "./PresetPicker.js";
import type { AgentPreset, Project } from "~/lib/client/types.js";

export default function ProjectSettingsModal(props: {
  project: Project;
  presets: AgentPreset[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>, keepOpen?: boolean) => Promise<void>;
}) {
  const [defaultPresetId, setDefaultPresetId] = useState(props.project.defaultPresetId ?? "");
  const [githubRepo, setGithubRepo] = useState(props.project.githubRepo ?? "");
  const [showGithubIssues, setShowGithubIssues] = useState(!!props.project.showGithubIssues);
  const [showLinearIssues, setShowLinearIssues] = useState(!!props.project.showLinearIssues);
  const [detectingGithub, setDetectingGithub] = useState(false);

  function save() {
    void props.onSave({
      defaultPresetId: defaultPresetId || null,
      githubRepo: githubRepo || null,
      showGithubIssues,
      showLinearIssues,
    });
  }

  function detectGithub() {
    setDetectingGithub(true);
    void props.onSave({ detectGithub: true }, true).finally(() => setDetectingGithub(false));
  }

  return (
    <Portal>
      <div className="modal-overlay" onClick={props.onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
          <header className="preset-modal-header">
            <h2>{props.project.name} settings</h2>
            <button className="btn ghost sm" onClick={props.onClose}>Close</button>
          </header>

          <div className="project-settings-body">
            <div className="project-settings-section">
              <label className="project-settings-label">Default preset</label>
              <p className="project-settings-hint">Overrides the global default for new prompts in this project.</p>
              <PresetPicker
                presets={props.presets}
                value={defaultPresetId}
                onChange={setDefaultPresetId}
                allowClear
              />
            </div>

            <div className="project-settings-section">
              <label className="project-settings-label">GitHub repo</label>
              <p className="project-settings-hint">owner/repo to show open issues from.</p>
              <div className="project-settings-row">
                <input
                  className="input"
                  placeholder="e.g. pablopunk/fractal"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
                <button
                  className="btn ghost sm"
                  disabled={detectingGithub}
                  onClick={detectGithub}
                >
                  {detectingGithub ? "…" : "Detect"}
                </button>
              </div>
            </div>

            <div className="project-settings-section">
              <label className="project-settings-label">Linear</label>
              <p className="project-settings-hint">Shows your assigned Linear issues using the configured linear CLI.</p>
            </div>

            <div className="project-settings-section">
              <label className="project-settings-label">Show in board</label>
              <div className="project-settings-toggles">
                <label className="project-settings-toggle">
                  <input
                    type="checkbox"
                    checked={showGithubIssues}
                    onChange={(e) => setShowGithubIssues(e.target.checked)}
                    disabled={!githubRepo}
                  />
                  <span>GitHub open issues</span>
                </label>
                <label className="project-settings-toggle">
                  <input
                    type="checkbox"
                    checked={showLinearIssues}
                    onChange={(e) => setShowLinearIssues(e.target.checked)}
                  />
                  <span>Linear issues (mine)</span>
                </label>
              </div>
            </div>
          </div>

          <footer className="project-settings-footer">
            <button className="btn ghost sm" onClick={props.onClose}>Cancel</button>
            <button className="btn primary sm" onClick={save}>Save</button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

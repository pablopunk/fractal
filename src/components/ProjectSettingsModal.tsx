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
  const [showLinearIssues, setShowLinearIssues] = useState(!!props.project.showLinearIssues);
  const [detectingGithub, setDetectingGithub] = useState(false);

  function save() {
    void props.onSave({
      defaultPresetId: defaultPresetId || null,
      githubRepo: githubRepo || null,
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
              <p className="project-settings-hint">owner/repo — issues appear in the GitHub column when set.</p>
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
              <p className="project-settings-hint">Shows your assigned Linear issues in a dedicated column.</p>
              <label className="project-settings-toggle">
                <input
                  type="checkbox"
                  checked={showLinearIssues}
                  onChange={(e) => setShowLinearIssues(e.target.checked)}
                />
                <span>Enable Linear issues</span>
              </label>
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

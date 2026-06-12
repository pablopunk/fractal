import Portal from "./Portal.js";
import RemoteAccessSettings from "./RemoteAccessSettings.js";

export default function AppSettingsModal(props: { onClose: () => void }) {
  return (
    <Portal>
      <div className="modal-overlay" onClick={props.onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <header className="preset-modal-header">
            <h2>Settings</h2>
            <button className="btn ghost sm" onClick={props.onClose}>
              Close
            </button>
          </header>
          <div className="project-settings-body">
            <RemoteAccessSettings />
          </div>
          <footer className="project-settings-footer">
            <button className="btn primary sm" onClick={props.onClose}>
              Done
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

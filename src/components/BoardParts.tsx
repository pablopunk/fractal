import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronLeft, ChevronRight, Copy, Info, Pencil, Plus, RefreshCw, SquareTerminal, Trash2, Undo2 } from "lucide-react";
import ProjectPicker from "./ProjectPicker.js";
import ModelPicker from "./ModelPicker.js";
import PresetPicker from "./PresetPicker.js";
import Tooltip from "./Tooltip.js";
import { Card } from "./Card.js";
import { SortableIssueCard } from "./IssueCard.js";
import { LocalImageAttachment } from "./PromptMedia.js";
import { api } from "~/lib/client/api.js";
import { snapSidebarWidth } from "~/lib/client/persistence.js";
import PresetIcon from "./PresetIcon.js";
import Portal from "./Portal.js";
import type { AgentPreset, Column, ModelProfile, PiModel, Project, Prompt, UrlPreview } from "~/lib/client/types.js";

export function Sidebar(props: {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (path: string) => void;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
  home: string;
  onResize: (width: number) => void;
  collapsed: boolean;
  showShortcuts: boolean;
  onReorder: (ids: string[]) => void | Promise<void>;
}) {
  const projectSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = e.currentTarget.parentElement?.getBoundingClientRect().width ?? 204;
    const onMove = (event: PointerEvent) => {
      props.onResize(snapSidebarWidth(startWidth + event.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  return (
    <aside className={`sidebar ${props.collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-head">
        <span className="brand-dot" />
        <span className="sidebar-brand">Fractal</span>
      </div>
      <div className="sidebar-section">Projects</div>
      <div className="project-list">
        {props.projects.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-faint)" }}>
            No projects yet.
          </div>
        )}
        <DndContext sensors={projectSensors} collisionDetection={closestCorners} onDragEnd={(e) => {
          const { active, over } = e;
          if (!over || active.id === over.id) return;
          const oldIndex = props.projects.findIndex((p) => p.id === active.id);
          const newIndex = props.projects.findIndex((p) => p.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return;
          void props.onReorder(arrayMove(props.projects, oldIndex, newIndex).map((p) => p.id));
        }}>
          <SortableContext items={props.projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {props.projects.map((p, index) => (
              <SortableProjectItem
                key={p.id}
                project={p}
                index={index}
                active={p.id === props.activeId}
                home={props.home}
                showShortcuts={props.showShortcuts}
                onSelect={props.onSelect}
                onRemove={props.onRemove}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="sidebar-foot">
        {props.collapsed ? (
          <>
            <button className="btn block icon-only" onClick={() => props.setShowPicker(true)} aria-label="Add project" title="Add project">
              <Plus size={16} aria-hidden="true" />
            </button>
            {props.showPicker && <Portal>
              <div className="modal-overlay" onClick={() => props.setShowPicker(false)}>
                <div className="modal project-picker-modal" onClick={(e) => e.stopPropagation()}>
                  <ProjectPicker
                    recentProjects={props.projects}
                    onSelect={props.onAdd}
                    autoFocus
                    placeholder="search projects or paste a path…"
                  />
                  <button className="btn ghost block sm" style={{ marginTop: 6 }} onClick={() => props.setShowPicker(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </Portal>}
          </>
        ) : props.showPicker ? (
          <div>
            <ProjectPicker
              recentProjects={props.projects}
              onSelect={props.onAdd}
              autoFocus
              openUpward
              placeholder="search projects or paste a path…"
            />
            <button className="btn ghost block sm" style={{ marginTop: 6 }} onClick={() => props.setShowPicker(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn block" onClick={() => props.setShowPicker(true)}>
            + Add project
          </button>
        )}
      </div>
      <div className="sidebar-resize-handle" onPointerDown={startResize} title="Resize projects drawer" />
    </aside>
  );
}

function SortableProjectItem(props: { project: Project; index: number; active: boolean; home: string; showShortcuts: boolean; onSelect: (id: string) => void; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.project.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`project-item ${props.active ? "active" : ""}`}
      onClick={() => props.onSelect(props.project.id)}
      title={tildeify(props.project.path, props.home)}
      {...attributes}
      {...listeners}
    >
      {props.showShortcuts && props.index < 9 ? (
        <span className={`project-shortcut-icon ${props.active ? "active" : ""}`} aria-hidden="true">
          ⌘{props.index + 1}
        </span>
      ) : (
        <ProjectIcon id={props.project.id} name={props.project.name} path={props.project.path} active={props.active} />
      )}
      <span className="name">{props.project.name}</span>
      <Tooltip content="Remove project">
        <button
          className="remove"
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove(props.project.id);
          }}
          aria-label="Remove project"
        >
          ×
        </button>
      </Tooltip>
    </div>
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function ProjectIcon({ id, name, path, active }: { id: string; name: string; path: string; active?: boolean }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const src = `/api/project-favicon?id=${encodeURIComponent(id)}&cwd=${encodeURIComponent(path)}&v=${version}`;
  const fallback = useMemo(() => {
    const label = (name || path.split("/").filter(Boolean).at(-1) || "?").replace(/^[._-]+/, "").charAt(0).toUpperCase() || "?";
    const hue = hashString(path || name) % 360;
    return {
      label,
      style: {
        ["--project-hue" as string]: String(hue),
      } as CSSProperties,
    };
  }, [name, path]);

  async function saveIcon(file: File) {
    if (!file.type.startsWith("image/")) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.set("icon", file);
      const res = await fetch(`/api/projects/${id}`, { method: "PATCH", body: form });
      if (!res.ok) throw new Error(await res.text());
      setStatus("loading");
      setVersion((v) => v + 1);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="project-icon-button"
        title="Change project icon"
        aria-label={`Change ${name} icon`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="project-icon-shadow" aria-hidden="true" />
        {status !== "loaded" && (
          <span className={`project-icon-placeholder ${active ? "active" : ""}`} style={fallback.style} aria-hidden="true">
            {fallback.label}
          </span>
        )}
        <img
          src={src}
          alt=""
          className={`project-icon ${status === "loaded" ? "loaded" : ""} ${active ? "active" : ""} ${status === "loaded" ? "" : "hidden"}`}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      </button>
      {open && <Portal>
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal project-icon-modal" onClick={(e) => e.stopPropagation()}>
            <header className="preset-modal-header">
              <h2>Change project icon</h2>
              <button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button>
            </header>
            <label
              className={`project-icon-drop ${saving ? "saving" : ""}`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void saveIcon(file); }}
            >
              <input type="file" accept="image/*" disabled={saving} onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) void saveIcon(file); }} />
              <span>{saving ? "Saving…" : "Drag & drop an image here, or click to choose"}</span>
            </label>
          </div>
        </div>
      </Portal>}
    </>
  );
}

export function EmptyState(props: { projects: Project[]; onAdd: (path: string) => void }) {
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>Add your first project</h1>
        <p>Choose from the list of recent projects or paste a path to a new project.</p>
        <ProjectPicker
          recentProjects={props.projects}
          onSelect={props.onAdd}
          autoFocus
          placeholder="search projects or paste a path…"
        />
      </div>
    </div>
  );
}

export function ColumnView(props: {
  id: Column;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  prompts: Prompt[];
  presets: AgentPreset[];
  onDelete: (id: string) => void;
  onEdit: (id: string, patch: { text?: string; modelProfile?: ModelProfile; presetId?: string }) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onOpenTerminal: (prompt: Prompt) => void;
  onSummarize?: (id: string) => void;
  summarizingIds?: Set<string>;
  openTerminalIds: Set<string>;
  activeTerminalId?: string | null;
  composer: React.ReactNode;
  issueSection?: React.ReactNode;
  issueItems?: Array<{ id: string; issue: import("./IssueCard.js").BoardIssue }>;
  itemCount?: number;
  home: string;
  activeId?: string | null;
  overId?: string | null;
  collapsed?: boolean;
  compact?: boolean;
  onToggleCollapse?: () => void;
  isArchivedCol?: boolean;
  onClearDone?: () => void;
  isClearingDone?: boolean;
  onRefreshIssues?: () => void;
  loadingIssues?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: props.id });
  const issueIds = (props.issueItems ?? []).map((item) => item.id);
  const promptIds = props.prompts.map((p) => p.id);
  const itemIds = [...issueIds, ...promptIds];
  const totalCount = props.itemCount ?? props.prompts.length;
  const isIssueCol = props.id === "GITHUB" || props.id === "LINEAR";
  const dragIndex = props.activeId ? itemIds.indexOf(props.activeId) : -1;
  const overIndex = props.overId ? itemIds.indexOf(props.overId) : -1;
  const isOverColumn = props.overId === props.id || itemIds.includes(props.overId ?? "");
  const showIndicator = props.activeId && dragIndex === -1 && isOverColumn;

  const Icon = props.icon;

  if (props.compact) {
    return (
      <div ref={setNodeRef} className={`column column-compact ${isOverColumn ? "drop-active" : ""}`}>
        <Tooltip content={props.title}>
          <div className="column-compact-head" aria-label={`${props.title} column`}>
            <Icon className="column-icon" />
            <span className="count-chip">{totalCount}</span>
          </div>
        </Tooltip>
        <div className="column-compact-items" aria-label={`${props.title} prompts`}>
          {props.prompts.map((prompt) => {
            const preset = props.presets.find((item) => item.id === prompt.presetId);
            const terminalOpen = !!prompt.tmuxSession && props.openTerminalIds.has(prompt.tmuxSession);
            const terminalActive = !!prompt.tmuxSession && prompt.tmuxSession === props.activeTerminalId;
            const label = prompt.tmuxSession || truncate(prompt.summary?.trim() || prompt.text, 80) || "Prompt";
            return (
              <Tooltip key={prompt.id} content={label}>
                <button
                  type="button"
                  className={`column-compact-item ${prompt.tmuxSession ? "terminal" : "prompt"} ${terminalOpen ? "open" : ""} ${terminalActive ? "active" : ""}`}
                  aria-label={label}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (prompt.tmuxSession) props.onOpenTerminal(prompt);
                  }}
                >
                  {prompt.tmuxSession ? <SquareTerminal size={15} /> : preset ? <PresetIcon preset={preset} size={14} /> : <span className="column-compact-dot" aria-hidden="true" />}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  }

  if (props.collapsed) {
    const canExpand = !!props.onToggleCollapse;
    const inner = (
      <div
        ref={setNodeRef}
        className={`column column-collapsed ${!canExpand ? "column-collapsed-frozen" : ""} ${isOverColumn ? "drop-active" : ""}`}
        onClick={props.onToggleCollapse}
      >
        <div className="column-collapsed-inner">
          <Icon className="column-icon collapsed" />
          <span className="column-collapsed-title">{props.title}</span>
          {totalCount > 0 && (
            <span className="count-chip">{totalCount}</span>
          )}
          {canExpand && <ChevronRight className="column-collapsed-chevron" />}
        </div>
      </div>
    );
    return canExpand ? (
      <Tooltip content={`Expand ${props.title}`}>{inner}</Tooltip>
    ) : inner;
  }

  return (
    <div ref={setNodeRef} className={`column ${isOverColumn ? "drop-active" : ""}`}>
      <div className="column-head" style={{ cursor: "pointer" }} onClick={props.onToggleCollapse}>
        <Icon className="column-icon" />
        <span className="column-title">{props.title}</span>
        <span className="count-chip">{totalCount}</span>
        {props.onClearDone && props.prompts.length > 0 && (
          <Tooltip content={props.isClearingDone ? "Clearing DONE prompts…" : "Clear DONE prompts"}>
            <button
              type="button"
              className="btn ghost sm"
              aria-label={props.isClearingDone ? "Clearing DONE prompts" : "Clear DONE prompts"}
              disabled={props.isClearingDone}
              onClick={(e) => {
                e.stopPropagation();
                props.onClearDone?.();
              }}
            >
              {props.isClearingDone ? <span className="btn-spinner" aria-hidden="true" /> : <Trash2 style={{ width: 14, height: 14 }} />}
              {props.isClearingDone ? "Clearing…" : "Clear"}
            </button>
          </Tooltip>
        )}
        {props.onRefreshIssues && (
          <Tooltip content={props.loadingIssues ? "Refreshing issues…" : "Refresh issues"}>
            <button
              type="button"
              className="btn ghost sm icon-only column-refresh-btn"
              disabled={props.loadingIssues}
              aria-label={props.loadingIssues ? "Refreshing issues" : "Refresh issues"}
              onClick={(e) => {
                e.stopPropagation();
                props.onRefreshIssues?.();
              }}
            >
              <RefreshCw size={15} className={props.loadingIssues ? "spin" : ""} />
            </button>
          </Tooltip>
        )}
        {props.onToggleCollapse && <ChevronLeft className="column-collapse-icon" />}
      </div>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className={`column-body ${itemIds.length === 0 && !props.issueSection ? "column-body-empty" : ""}`}>
          {props.issueSection && itemIds.length === 0 && (
            <div className="issue-section">{props.issueSection}</div>
          )}
          {(props.issueItems ?? []).map((item, i) => (
            <div key={item.id} data-prompt-id={item.id}>
              {showIndicator && overIndex === i && <div className="drop-indicator" />}
              <SortableIssueCard issue={item.issue} />
            </div>
          ))}
          {itemIds.length === 0 && !props.issueSection && (
            <div className="column-empty-state" style={{ padding: "10px 4px", fontSize: 12, color: "var(--text-faint)" }}>
              {isIssueCol ? "No issues." : props.id === "PROMPTS" ? "Add a prompt below." : "Drop a prompt here."}
            </div>
          )}
          {props.prompts.map((p, i) => (
            <div key={p.id} data-prompt-id={p.id}>
              {showIndicator && overIndex === issueIds.length + i && <div className="drop-indicator" />}
              <Card
                prompt={p}
                presets={props.presets}
                onDelete={props.onDelete}
                onEdit={props.onEdit}
                onArchive={props.onArchive}
                onUnarchive={props.onUnarchive}
                onOpenTerminal={props.onOpenTerminal}
                onSummarize={props.onSummarize}
                isSummarizing={props.summarizingIds?.has(p.id)}
                isTerminalOpen={!!p.tmuxSession && props.openTerminalIds.has(p.tmuxSession)}
                isActiveTerminal={!!p.tmuxSession && p.tmuxSession === props.activeTerminalId}
                home={props.home}
                isArchivedCol={props.isArchivedCol}
              />
            </div>
          ))}
          {showIndicator && (overIndex === -1 || overIndex >= itemIds.length) && <div className="drop-indicator" />}
        </div>
      </SortableContext>
      {props.composer}
    </div>
  );
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

function getDroppedImagePaths(dt: DataTransfer): string[] {
  const electron = (window as typeof window & {
    electron?: { getPathForFile?: (file: File) => string };
  }).electron;

  const fromElectron = Array.from(dt.files)
    .filter((file) => file.type.startsWith("image/") || IMAGE_RE.test(file.name))
    .map((file) => electron?.getPathForFile?.(file) ?? "")
    .filter(Boolean);

  if (fromElectron.length > 0) return fromElectron;

  const uriList = dt.getData("text/uri-list");
  if (!uriList) return [];
  return uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.startsWith("file://"))
    .map((uri) => {
      try {
        return decodeURIComponent(new URL(uri).pathname);
      } catch {
        return "";
      }
    })
    .filter((path) => path && IMAGE_RE.test(path));
}

function SortablePresetItem({ preset, active, isDefault, onSelect }: { preset: AgentPreset; active: boolean; isDefault: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`preset-modal-list-item ${active ? "active" : ""}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <div className="preset-modal-list-item-header">
        <span className="preset-modal-list-name">{preset.name}{isDefault ? " ★" : ""}</span>
        <PresetIcon preset={preset} size={14} />
      </div>
      <span className="preset-modal-list-binary">{preset.binary}</span>
    </button>
  );
}

function presetKindForBinary(binary: string): AgentPreset["kind"] {
  if (binary === "pi" || binary === "claude" || binary === "opencode") return binary;
  return "custom";
}

function defaultArgsForBinary(binary: string): string {
  if (binary === "opencode") return "--model {{model}} --prompt {{prompt}}";
  if (binary === "pi" || binary === "claude") return "--model {{model}} {{prompt}}";
  return "{{prompt}}";
}

function thinkingLevelsForKind(kind: AgentPreset["kind"]): PiModel[] {
  const levels = kind === "pi"
    ? ["off", "minimal", "low", "medium", "high", "xhigh"]
    : kind === "claude"
      ? ["low", "medium", "high", "xhigh", "max"]
      : kind === "opencode"
        ? ["minimal", "high", "max"]
        : [];
  return levels.map((level) => ({ id: level, model: level, provider: "thinking" }));
}

export function PresetSettings(props: { presets: AgentPreset[]; defaultPresetId: string; helperPresetId: string; onSetDefault: (id: string) => void; onSetHelper: (id: string) => void; piModels: PiModel[]; claudeModels: PiModel[]; opencodeModels: PiModel[]; onChange: (presets: AgentPreset[]) => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const setOpen = (v: boolean) => { if (props.onOpenChange) props.onOpenChange(v); else setInternalOpen(v); };
  const [selectedId, setSelectedId] = useState<string | null>(props.presets[0]?.id ?? null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  function update(id: string, patch: Partial<AgentPreset>) {
    props.onChange(props.presets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset));
  }
  function addPreset() {
    const id = `custom-${Date.now()}`;
    props.onChange([...props.presets, { id, name: "Custom", kind: "custom", binary: "codex", argsTemplate: "{{prompt}}", model: "", promptTemplate: "{{prompt}}" }]);
    setSelectedId(id);
  }
  function removePreset(id: string) {
    const next = props.presets.filter((preset) => preset.id !== id);
    props.onChange(next);
    setSelectedId(next[0]?.id ?? null);
  }

  const selected = props.presets.find((preset) => preset.id === selectedId) ?? props.presets[0] ?? null;
  const selectedKind: AgentPreset["kind"] = selected ? presetKindForBinary(selected.binary) : "custom";
  const selectedModels = selectedKind === "claude" ? props.claudeModels : selectedKind === "opencode" ? props.opencodeModels : props.piModels;

  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}>Presets</button>
      {open && <Portal>
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal preset-modal" onClick={(e) => e.stopPropagation()}>
            <header className="preset-modal-header">
              <h2>Agent presets</h2>
              <button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button>
            </header>
            <div className="preset-modal-body">
              <aside className="preset-modal-list">
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={(e) => {
                  const { active, over } = e;
                  if (!over || active.id === over.id) return;
                  const oldIndex = props.presets.findIndex((p) => p.id === active.id);
                  const newIndex = props.presets.findIndex((p) => p.id === over.id);
                  if (oldIndex === -1 || newIndex === -1) return;
                  props.onChange(arrayMove(props.presets, oldIndex, newIndex));
                }}>
                  <SortableContext items={props.presets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    {props.presets.map((preset) => (
                      <SortablePresetItem
                        key={preset.id}
                        preset={preset}
                        active={preset.id === selected?.id}
                        isDefault={preset.id === props.defaultPresetId}
                        onSelect={() => setSelectedId(preset.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <button className="btn ghost sm" onClick={addPreset}>+ New preset</button>
              </aside>
              {selected ? (
                <form className="preset-modal-form" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    <span>Name</span>
                    <input value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value })} />
                  </label>
                  <label>
                    <span className="preset-modal-label-row">
                      Binary
                      <Tooltip content="Supported agents get automatic defaults for model lists and argument templates. Other binaries still work, but setup is manual.">
                        <span>
                          <Info className="preset-modal-info" aria-label="Binary preset info" />
                        </span>
                      </Tooltip>
                    </span>
                    <input value={selected.binary} onChange={(e) => {
                      const binary = e.target.value;
                      const kind = presetKindForBinary(binary);
                      update(selected.id, { binary, kind, argsTemplate: defaultArgsForBinary(binary) });
                    }} placeholder="pi, claude, opencode, codex, …" />
                  </label>
                  <label>
                    <span>Model</span>
                    {selectedKind === "custom" ? (
                      <input value={selected.model ?? ""} onChange={(e) => update(selected.id, { model: e.target.value })} placeholder="optional, available as {{model}}" />
                    ) : (
                      <ModelPicker models={selectedModels} value={selected.model ?? ""} onChange={(model) => update(selected.id, { model })} />
                    )}
                  </label>
                  {selectedKind !== "custom" && (
                    <label className="preset-modal-compact-field">
                      <span>Thinking</span>
                      <ModelPicker models={thinkingLevelsForKind(selectedKind)} value={selected.thinking ?? ""} onChange={(thinking) => update(selected.id, { thinking })} searchPlaceholder="Search thinking…" />
                    </label>
                  )}

                  <label>
                    <span>Args template</span>
                    <input value={selected.argsTemplate} onChange={(e) => update(selected.id, { argsTemplate: e.target.value })} placeholder="--model {{model}} {{prompt}}" />
                  </label>
                  <label>
                    <span>Prompt template</span>
                    <textarea rows={5} value={selected.promptTemplate ?? "{{prompt}}"} onChange={(e) => update(selected.id, { promptTemplate: e.target.value })} placeholder="Use {{prompt}} for the card text." />
                  </label>
                  <label className="preset-modal-default">
                    <input type="checkbox" checked={selected.id === props.defaultPresetId} onChange={(e) => { if (e.target.checked) props.onSetDefault(selected.id); }} />
                    <span>Use as default for new prompts</span>
                  </label>
                  <label className="preset-modal-default">
                    <input type="checkbox" checked={selected.id === props.helperPresetId} onChange={(e) => { if (e.target.checked) props.onSetHelper(selected.id); }} />
                    <span>Use for Fractal AI helpers</span>
                  </label>
                  <div className="preset-modal-form-actions">
                    {props.presets.length > 1 && (
                      <button type="button" className="btn danger sm" onClick={() => removePreset(selected.id)}>Delete preset</button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="preset-modal-empty">No presets yet.</div>
              )}
            </div>
          </div>
        </div>
      </Portal>}
    </>
  );
}

type FileMention = { path: string; name: string };

type ActiveMention = { start: number; query: string };

export function Composer(props: { value: string; onChange: (v: string) => void; imagePaths: string[]; onImagePathsChange: (paths: string[]) => void; onSubmit: () => void; isSubmitting?: boolean; presets: AgentPreset[]; presetId: string; onPresetChange: (v: string) => void; onCreatePreset: () => void; projectId?: string | null }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<FileMention[]>([]);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);

  useEffect(() => {
    if (!props.projectId) {
      setFiles([]);
      return;
    }
    const controller = new AbortController();
    void api<{ files: FileMention[] }>(`/api/projects/${props.projectId}/files`, { signal: controller.signal })
      .then((data) => setFiles(data.files ?? []))
      .catch(() => { if (!controller.signal.aborted) setFiles([]); });
    return () => controller.abort();
  }, [props.projectId]);

  const mention = useMemo(() => activeMention(props.value, caret), [props.value, caret]);
  const mentionItems = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return files
      .filter((file) => !query || file.path.toLowerCase().includes(query))
      .slice(0, 50);
  }, [files, mention]);
  const showMentionPicker = !!mention && mention.start !== dismissedMentionStart && mentionItems.length > 0;

  useEffect(() => {
    setHighlight((value) => Math.min(Math.max(value, 0), Math.max(mentionItems.length - 1, 0)));
  }, [mentionItems.length]);

  function syncCaret(target: HTMLTextAreaElement) {
    setCaret(target.selectionStart ?? 0);
  }

  function commitMention(file: FileMention) {
    if (!mention) return;
    const insert = `@${file.path}`;
    const after = props.value.slice(caret);
    const spacer = after.length === 0 || /^\s/.test(after) ? "" : " ";
    const next = props.value.slice(0, mention.start) + insert + spacer + after;
    const nextCaret = mention.start + insert.length + spacer.length;
    props.onChange(next);
    setCaret(nextCaret);
    setHighlight(0);
    setDismissedMentionStart(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);

    const paths = getDroppedImagePaths(e.dataTransfer);
    if (paths.length === 0) return;

    props.onImagePathsChange([...new Set([...props.imagePaths, ...paths])]);

    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function onDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }

  return (
    <div
      className={`composer ${dragOver ? "drag-over" : ""}`}
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div className="composer-input-wrap">
        <textarea
          ref={textareaRef}
          className="input"
          placeholder="Describe a task for pi and/or drop images…"
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
            syncCaret(e.target);
            setDismissedMentionStart(null);
          }}
          onClick={(e) => syncCaret(e.currentTarget)}
          onKeyUp={(e) => syncCaret(e.currentTarget)}
          onSelect={(e) => syncCaret(e.currentTarget)}
          onKeyDown={(e) => {
            if (showMentionPicker && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Tab" || e.key === "Escape")) {
              e.preventDefault();
              if (e.key === "ArrowDown") setHighlight((value) => Math.min(mentionItems.length - 1, value + 1));
              else if (e.key === "ArrowUp") setHighlight((value) => Math.max(0, value - 1));
              else if (e.key === "Escape") setDismissedMentionStart(mention?.start ?? null);
              else commitMention(mentionItems[highlight]);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              if (!props.isSubmitting) props.onSubmit();
            }
          }}
        />
        {showMentionPicker && (
          <div className="picker-list composer-file-list" role="listbox">
            <div className="picker-group">
              <div className="picker-group-title">Project files</div>
              {mentionItems.map((file, index) => (
                <div
                  key={file.path}
                  className={`picker-item ${index === highlight ? "active" : ""}`}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitMention(file);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                >
                  <span className="picker-name">{file.name}</span>
                  <span className="picker-path">{file.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {props.imagePaths.length > 0 && (
        <div className="image-attachments">
          {props.imagePaths.map((path) => (
            <LocalImageAttachment
              key={path}
              path={path}
              onRemove={() => props.onImagePathsChange(props.imagePaths.filter((p) => p !== path))}
            />
          ))}
        </div>
      )}
      <div className="composer-actions">
        <PresetPicker presets={props.presets} value={props.presetId} onChange={props.onPresetChange} onCreate={props.onCreatePreset} />
        <div style={{ flex: 1 }} />
        <Tooltip content={props.presets.length === 0 ? "Create a preset first" : "Add prompt"}>
          <span>
            <button
              className="btn primary sm composer-submit"
              onClick={props.onSubmit}
              disabled={props.isSubmitting || ((!props.value.trim() && props.imagePaths.length === 0) || props.presets.length === 0)}
              aria-label={props.isSubmitting ? "Adding prompt" : "Add prompt"}
            >
              {props.isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
              {props.isSubmitting ? "Adding…" : "Add"}
            </button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

function activeMention(value: string, caret: number): ActiveMention | null {
  if (caret < 0) return null;
  const before = value.slice(0, caret);
  const match = before.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2] };
}

function trimMid(s: string, n = 28): string {
  return s.length > n ? "…" + s.slice(-n) : s;
}
export function tildeify(abs: string, home: string): string {
  if (!abs || !home) return abs;
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// CSS for drop indicator added to global.css
// .drop-indicator { height: 3px; background: var(--accent); border-radius: 2px; margin: 4px 0; }

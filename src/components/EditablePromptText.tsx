import { useEffect, useRef } from "react";

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeEditableText(element: HTMLElement): string {
  return element.innerText.replace(/\u00a0/g, " ");
}

export default function EditablePromptText(props: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    if (editor.innerText !== props.value) editor.innerText = props.value;
  }, [props.value]);

  useEffect(() => {
    if (!props.autoFocus) return;
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      placeCaretAtEnd(editor);
    });
  }, [props.autoFocus]);

  return (
    <div
      ref={editorRef}
      className={`editable-prompt-text ${props.className ?? ""}`.trim()}
      style={props.style}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={props.ariaLabel ?? "Prompt text"}
      data-placeholder={props.placeholder ?? "Prompt text"}
      onInput={(e) => props.onChange(normalizeEditableText(e.currentTarget))}
      onBlur={(e) => props.onChange(normalizeEditableText(e.currentTarget))}
      onKeyDown={props.onKeyDown}
    />
  );
}

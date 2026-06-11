import { useEffect, useRef, useState } from "react";
import { api } from "~/lib/client/api.js";
import type { UrlPreview } from "~/lib/client/types.js";

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/;
const QUOTED_IMAGE_PATH_RE =
  /(["'])((?:~|\/)[^"']+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif))\1/gi;
const UNQUOTED_IMAGE_PATH_RE =
  /(?:^|\s)((?:~|\/)[^\n\r\t"']+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif))(?=$|\s)/gi;

export function extractImagePaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(QUOTED_IMAGE_PATH_RE)) paths.add(match[2]);
  for (const match of text.matchAll(UNQUOTED_IMAGE_PATH_RE)) paths.add(match[1].trim());
  return [...paths];
}

export function parseImagePaths(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const paths = JSON.parse(value);
    return Array.isArray(paths)
      ? paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function UrlPreviewLink({ url, children }: { url: string; children?: React.ReactNode }) {
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  function openPreview() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        const width = Math.min(420, window.innerWidth * 0.7);
        const height = 128;
        const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
        const hasRoomAbove = rect.top > height + 16;
        setPopoverStyle({
          left,
          top: hasRoomAbove ? rect.top - height - 8 : rect.bottom + 8,
          width,
        });
      }
      setShowPreview(true);
    }, 250);
  }

  function closePreview() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  }

  useEffect(() => {
    if (!showPreview || preview || previewError) return;
    const controller = new AbortController();
    void api<UrlPreview>(`/api/url-preview?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
      .then(setPreview)
      .catch((e) => {
        if (!controller.signal.aborted) setPreviewError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [preview, previewError, showPreview, url]);

  return (
    <span
      ref={wrapRef}
      className="url-preview-wrap"
      onMouseEnter={openPreview}
      onMouseLeave={closePreview}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {children ?? url}
      </a>
      {showPreview && (
        <span className="url-preview-popover" style={popoverStyle ?? undefined} aria-hidden="true">
          {!preview && !previewError && (
            <>
              <span className="url-preview-image url-preview-skeleton" />
              <span className="url-preview-content">
                <span className="url-preview-skeleton url-preview-skeleton-site" />
                <span className="url-preview-skeleton url-preview-skeleton-title" />
                <span className="url-preview-skeleton url-preview-skeleton-description" />
                <span className="url-preview-skeleton url-preview-skeleton-url" />
              </span>
            </>
          )}
          {previewError && <span className="url-preview-loading">Preview unavailable</span>}
          {preview && (
            <>
              {preview.image && (
                <img className="url-preview-image" src={preview.image} alt="" loading="lazy" />
              )}
              <span className="url-preview-content">
                <span className="url-preview-site">
                  {preview.favicon && <img src={preview.favicon} alt="" loading="lazy" />}
                  {preview.siteName}
                </span>
                <span className="url-preview-title">{preview.title}</span>
                {preview.description && (
                  <span className="url-preview-description">{preview.description}</span>
                )}
                <span className="url-preview-url">{preview.url}</span>
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

export function LocalImageAttachment({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const [exists, setExists] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const src = `/api/local-image?path=${encodeURIComponent(path)}`;

  function togglePreview() {
    setPopoverStyle({ left: 0, top: 0, width: 0, height: 0 });
    setShowPreview((value) => !value);
  }

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!showPreview) return;
      if (wrapRef.current?.contains(e.target as Node)) return;
      setShowPreview(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showPreview]);

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    const isWide = naturalWidth > naturalHeight;
    setPopoverStyle(
      isWide ? { width: "85vw", maxWidth: "85vw" } : { height: "85vh", maxHeight: "85vh" },
    );
  }

  if (!exists) return null;

  return (
    <span ref={wrapRef} className="image-attachment-wrap">
      <a
        className="image-attachment"
        href={src}
        target="_blank"
        rel="noreferrer"
        title={path}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          togglePreview();
        }}
      >
        <img src={src} alt={basename(path)} loading="lazy" onError={() => setExists(false)} />
        <span>{basename(path)}</span>
      </a>
      {onRemove && (
        <button
          type="button"
          className="image-attachment-remove"
          aria-label={`Remove ${basename(path)}`}
          title="Remove attachment"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
      {showPreview && (
        <span
          className="image-attachment-popover"
          style={popoverStyle ?? undefined}
          aria-hidden="true"
        >
          <img src={src} alt={basename(path)} loading="lazy" onLoad={handleLoad} />
        </span>
      )}
    </span>
  );
}

export function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;
    const url = rawUrl.replace(TRAILING_URL_PUNCTUATION_RE, "");
    const trailing = rawUrl.slice(url.length);

    if (matchIndex > lastIndex) parts.push(text.slice(lastIndex, matchIndex));
    parts.push(<UrlPreviewLink key={`${matchIndex}-${url}`} url={url} />);
    if (trailing) parts.push(trailing);
    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

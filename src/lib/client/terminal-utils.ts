type ElectronGlobals = typeof window & {
  electron?: {
    getPathForFile?: (file: File) => string;
  };
};

function shellQuote(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

export function getFilePaths(dt: DataTransfer): string[] {
  const electron = (window as ElectronGlobals).electron;
  const fromFiles = Array.from(dt.files)
    .map((file) => electron?.getPathForFile?.(file) ?? "")
    .filter(Boolean);

  if (fromFiles.length > 0) return fromFiles;

  return dt.getData("text/uri-list")
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
    .filter(Boolean);
}

export function filePathsAsTerminalPaste(paths: string[]): string {
  return paths.map(shellQuote).join(" ");
}

function decodeBase64Utf8(data: string): string {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function writeClipboard(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text);
}

export function handleOsc52(data: string): boolean | Promise<boolean> {
  const separator = data.indexOf(";");
  if (separator === -1) return false;

  const payload = data.slice(separator + 1);
  // OSC 52 read requests use "?"; this app only grants terminal -> clipboard writes.
  if (!payload || payload === "?") return true;

  return writeClipboard(decodeBase64Utf8(payload)).then(
    () => true,
    () => false,
  );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UrlPreviewLink } from "./PromptMedia.js";

export default function MarkdownText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) =>
          href ? <UrlPreviewLink url={href}>{children}</UrlPreviewLink> : children,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

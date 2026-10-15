import { memo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IconCheck, IconCopy } from "./Icons";

function CodeBlock({ children, lang }: { children: ReactNode; lang: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang || "code"}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(ref.current?.innerText ?? "");
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        pre({ children }) {
          // children is the <code> element; read its language class
          const child = Array.isArray(children) ? children[0] : children;
          const cls: string = (child as { props?: { className?: string } })?.props?.className ?? "";
          const lang = /language-([\w+-]+)/.exec(cls)?.[1] ?? "";
          return <CodeBlock lang={lang}>{children}</CodeBlock>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href && /^https?:/i.test(href)) openUrl(href);
              }}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default memo(Markdown);

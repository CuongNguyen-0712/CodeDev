import { Children } from "react";
import ReactMarkdown from "react-markdown";

import CodeBlock from "@/components/ui/codeBlock";

// The code block's header and colours live under .lesson-prose (as in the blog and quiz text).
import "@/styles/learning/[id]/lesson.css";

const ALLOWED = ["p", "br", "code", "pre"];
// http(s) only, so no other scheme can become a link; trailing punctuation stays text.
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]*[^\s<>".,:;!?'")\]]/g;

function linkify(text, keyPrefix) {
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(URL_PATTERN)) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        parts.push(
            <a key={`${keyPrefix}-${match.index}`} href={match[0]} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
                {match[0]}
            </a>
        );
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

const components = {
    // Soft line breaks stay visible: Shift+Enter in the composer is a new line here too.
    p: ({ children }) => (
        <p className="whitespace-pre-wrap break-words">
            {Children.map(children, (child, i) => (typeof child === "string" ? linkify(child, i) : child))}
        </p>
    ),
    // The block <code> renders its own wrapper, so drop react-markdown's <pre>.
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
        const raw = String(children);
        const language = /language-([\w+#-]+)/.exec(className || "")?.[1];
        // Fenced blocks always end in a newline, so decide before stripping it.
        if (!language && !raw.includes("\n")) {
            return <code className="rounded-sm border border-current/20 px-1 font-mono text-[0.85em]">{children}</code>;
        }
        return (
            <div className="lesson-prose my-1 min-w-0 text-left">
                <CodeBlock value={{ language: language || "text", filename: null, code: raw.replace(/\n$/, "") }} />
            </div>
        );
    },
};

/**
 * A chat message's text. User input: only paragraphs, line breaks and code survive (raw HTML shows as
 * escaped text, since there is no rehype-raw; every other element is unwrapped to its text), so markdown
 * links and images never render.
 * Bare http(s) URLs become links that open in a new tab.
 */
export default function MessageBody({ body }) {
    return (
        <div className="flex min-w-0 flex-col gap-2 text-sm">
            <ReactMarkdown allowedElements={ALLOWED} unwrapDisallowed components={components}>
                {body || ""}
            </ReactMarkdown>
        </div>
    );
}

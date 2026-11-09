import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "@/components/ui/codeBlock";
import { isAllowedMediaUrl } from "@/lib/media/mediaOrigins.mjs";

// Same typography as a lesson body (.lesson-prose), including the code block header.
import "@/styles/learning/[id]/lesson.css";

// Only "#..." and "/x" stay on the site; "//host" and "/\host" are protocol-relative to the browser.
// Markdown percent-encodes a backslash ("/%5Chost"), which is refused too, in case anything decodes it.
const INTERNAL_HREF = /^(#|\/(?![/\\]|%5c))/i;
export const isInternalHref = (href) => INTERNAL_HREF.test(href || "");

const styled = (Tag, className) => function Styled({ children }) {
    return <Tag className={className}>{children}</Tag>;
};

// User-generated Markdown: no rehype-raw (raw HTML is dropped) and the default urlTransform (blocks javascript:), so this is the XSS boundary.
// No "use client": renders in Server Components and the editor preview; callers pass `origins` (server: mediaOrigins(), browser: NEXT_PUBLIC_MEDIA_ORIGINS).
export default function BlogMarkdown({ body, origins }) {
    const components = {
        h1: styled("h1", "lesson_h1"),
        h2: styled("h2", "lesson_h2"),
        h3: styled("h3", "lesson_h3"),
        h4: styled("h4", "lesson_h4"),
        p: styled("p", "lesson_p"),
        ul: styled("ul", "lesson_ul"),
        ol: ({ start, children }) => <ol className="lesson_ol" start={start}>{children}</ol>,
        blockquote: styled("blockquote", "lesson_quote"),
        strong: styled("strong", "lesson_strong"),
        em: styled("em", "lesson_em"),
        del: styled("del", "lesson_strike"),
        // The block <code> renders its own wrapper, so drop react-markdown's <pre>.
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children }) => {
            const raw = String(children);
            const language = /language-([\w+#-]+)/.exec(className || "")?.[1];
            // Fenced blocks always end in a newline, so decide before stripping it.
            if (!language && !raw.includes("\n")) return <code className="lesson_inline_code">{children}</code>;
            const code = raw.replace(/\n$/, "");
            // Markdown fences carry no file name; CodeBlock derives one from the language, like a lesson block without one.
            return <CodeBlock value={{ language, filename: null, code }} />;
        },
        a: ({ href, children }) =>
            isInternalHref(href) ? (
                <a href={href} className="lesson_link">{children}</a>
            ) : (
                <a href={href} target="_blank" rel="nofollow ugc noopener" className="lesson_link">{children}</a>
            ),
        img: ({ src, alt }) =>
            isAllowedMediaUrl(src, origins) ? (
                <figure className="lesson_image_wrapper">
                    <img src={src} alt={alt || ""} loading="lazy" decoding="async" className="lesson_image h-auto" />
                </figure>
            ) : null,
    };

    return (
        <div className="lesson-prose">
            <div className="portable_text_container">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {body || ""}
                </ReactMarkdown>
            </div>
        </div>
    );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "@/components/ui/codeBlock";
import { isAllowedMediaUrl } from "@/lib/media/mediaOrigins.mjs";
import { rehypeHeadingIds } from "@/lib/blog/headings.mjs";

// Same typography as a lesson body (.lesson-prose), including the code block header.
import "@/styles/learning/[id]/lesson.css";

// Only "#..." and "/x" stay on the site; "//host" and "/\host" are protocol-relative to the browser.
// Markdown percent-encodes a backslash ("/%5Chost"), which is refused too, in case anything decodes it.
const INTERNAL_HREF = /^(#|\/(?![/\\]|%5c))/i;
export const isInternalHref = (href) => INTERNAL_HREF.test(href || "");

const styled = (Tag, className) => function Styled({ children }) {
    return <Tag className={className}>{children}</Tag>;
};

// h2/h3 keep the id rehypeHeadingIds gave them (table-of-contents anchors).
const anchored = (Tag, className) => function Anchored({ id, children }) {
    return <Tag id={id} className={`${className} scroll-mt-20`}>{children}</Tag>;
};

// An image renders a <figure>, which a <p> may not contain (hydration error), so such a paragraph becomes a <div>.
const hasImage = (node) => node?.children?.some((child) => child.type === "element" && child.tagName === "img");

// User-generated Markdown: no rehype-raw (raw HTML is dropped) and the default urlTransform (blocks javascript:), so this is the XSS boundary.
// No "use client": renders in Server Components and the editor preview; callers pass `origins` (server: mediaOrigins(), browser: NEXT_PUBLIC_MEDIA_ORIGINS).
// `className` adds to the prose root, e.g. a larger reading size on the post page (utilities win over lesson.css's components layer).
export default function BlogMarkdown({ body, origins, className }) {
    const components = {
        h1: styled("h1", "lesson_h1"),
        h2: anchored("h2", "lesson_h2"),
        h3: anchored("h3", "lesson_h3"),
        h4: styled("h4", "lesson_h4"),
        p: ({ node, children }) => hasImage(node)
            ? <div className="lesson_p">{children}</div>
            : <p className="lesson_p">{children}</p>,
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
                // Learner uploads come in any size: never upscale past the file's own width.
                <figure className="lesson_image_wrapper items-center">
                    <img src={src} alt={alt || ""} loading="lazy" decoding="async" className="lesson_image h-auto w-auto max-w-full" />
                </figure>
            ) : null,
    };

    return (
        <div className={className ? `lesson-prose ${className}` : "lesson-prose"}>
            <div className="portable_text_container">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHeadingIds]} components={components}>
                    {body || ""}
                </ReactMarkdown>
            </div>
        </div>
    );
}

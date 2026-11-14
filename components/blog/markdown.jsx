import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "@/components/ui/codeBlock";
import { isAllowedMediaUrl } from "@/lib/media/mediaOrigins.mjs";
import { parseCodeFence } from "@/lib/blog/codeFence.mjs";
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

// The editor inserts uploads as ![image](url); that word is a placeholder, not a caption.
export const hasCaption = (alt) => Boolean(alt?.trim()) && alt.trim().toLowerCase() !== "image";

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
        // h5 and h6 had no style at all and read as body text; they share the smallest heading's look.
        h5: styled("h5", "lesson_h4"),
        h6: styled("h6", "lesson_h4"),
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
        code: ({ node, className, children }) => {
            // An empty fence has no children: String(undefined) printed "undefined" in the block.
            const raw = String(children ?? "");
            // The fence line can name the file: ```js app.js, ```js title="app.js" or ```app.js.
            const { language, filename } = parseCodeFence(className, node?.data?.meta);
            // Fenced blocks always end in a newline, so decide before stripping it.
            if (!language && !raw.includes("\n")) return <code className="lesson_inline_code">{children}</code>;
            const code = raw.replace(/\n$/, "");
            // Without a file name CodeBlock derives main.<extension> from the language, like a lesson block.
            return <CodeBlock value={{ language, filename, code }} />;
        },
        a: ({ href, children }) =>
            isInternalHref(href) ? (
                <a href={href} className="lesson_link">{children}</a>
            ) : (
                <a href={href} target="_blank" rel="nofollow ugc noopener" className="lesson_link">{children}</a>
            ),
        img: ({ src, alt }) =>
            isAllowedMediaUrl(src, origins) ? (
                // Learner uploads come in any size: never upscale past the file's own width, centre a small one.
                // No frame: the image itself carries the rounded corners and a hairline border.
                <figure className="lesson_image_wrapper">
                    <img src={src} alt={alt || ""} loading="lazy" decoding="async" className="mx-auto h-auto w-auto max-w-full rounded-lg border" />
                    {/* The caption repeats the alt text for sighted readers; "image" is only the editor's placeholder. */}
                    {hasCaption(alt) && <figcaption className="lesson_image_caption" aria-hidden="true">{alt}</figcaption>}
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

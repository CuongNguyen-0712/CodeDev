import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "@/components/ui/codeBlock";
import { isAllowedMediaUrl } from "@/lib/media/mediaOrigins.mjs";

// User-generated Markdown: no rehype-raw (raw HTML is dropped) and the default urlTransform (blocks javascript:), so this is the XSS boundary.
// No "use client": renders in Server Components and the editor preview; callers pass `origins` (server: mediaOrigins(), browser: NEXT_PUBLIC_MEDIA_ORIGINS).
export default function BlogMarkdown({ body, origins }) {
    const components = {
        // The block <code> renders its own wrapper, so drop react-markdown's <pre>.
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children }) => {
            const raw = String(children);
            const language = /language-([\w+#-]+)/.exec(className || "")?.[1];
            // Fenced blocks always end in a newline, so decide before stripping it.
            if (!language && !raw.includes("\n")) return <code>{children}</code>;
            const code = raw.replace(/\n$/, "");
            return <CodeBlock value={{ language, code }} />;
        },
        a: ({ href, children }) =>
            /^(https?:)?\/\//i.test(href || "") ? (
                <a href={href} target="_blank" rel="nofollow ugc noopener">{children}</a>
            ) : (
                <a href={href}>{children}</a>
            ),
        img: ({ src, alt }) =>
            isAllowedMediaUrl(src, origins) ? (
                <figure className="lesson_image_wrapper">
                    <img src={src} alt={alt || ""} loading="lazy" decoding="async" className="lesson_image h-auto" />
                </figure>
            ) : null,
    };

    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {body || ""}
        </ReactMarkdown>
    );
}

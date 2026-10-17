"use client";

import React, { useState, useEffect } from "react";
import { PortableText } from "@portabletext/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { syntaxTheme } from "@/lib/syntaxTheme";
import createImageUrlBuilder from "@sanity/image-url";

import {
    LuCheck,
    LuCircleAlert,
    LuCircleCheck,
    LuCopy,
    LuExternalLink,
    LuFileText,
    LuInfo,
    LuTriangleAlert,
    LuZap,
} from "react-icons/lu";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4sw0c7mz";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const imageBuilder = (projectId && dataset) ? createImageUrlBuilder({ projectId, dataset }) : null;

function urlForImage(source) {
    if (!imageBuilder || !source?.asset) return null;
    return imageBuilder.image(source).auto("format").fit("max").url();
}

const extensionByLanguage = {
    javascript: "js",
    js: "js",
    html: "html",
    css: "css",
    bash: "sh",
    sh: "sh",
    shell: "sh",
    zsh: "sh",
    typescript: "ts",
    ts: "ts",
    python: "py",
    py: "py",
    java: "java",
    c: "c",
    cpp: "cpp",
    "c++": "cpp",
    csharp: "cs",
    "c#": "cs",
    go: "go",
    golang: "go",
    rust: "rs",
    rs: "rs",
    php: "php",
    sql: "sql",
    postgresql: "sql",
    mysql: "sql",
    ruby: "rb",
    rb: "rb",
    swift: "swift",
    kotlin: "kt",
    kt: "kt",
    dart: "dart",
    r: "r",
    scala: "scala",
    elixir: "ex",
    ex: "ex",
    haskell: "hs",
    hs: "hs",
    json: "json",
    yaml: "yml",
    yml: "yml",
    xml: "xml",
    markdown: "md",
    md: "md",
};

const syntaxLanguageMap = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rs: "rust",
    golang: "go",
    "c++": "cpp",
    "c#": "csharp",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    ex: "elixir",
    hs: "haskell",
    kt: "kotlin",
    rb: "ruby",
};

function normalizeLanguage(lang) {
    const raw = String(lang || "javascript").toLowerCase().trim();
    return syntaxLanguageMap[raw] || raw;
}

function getFallbackFilename(language) {
    const normalized = String(language || "text").toLowerCase().trim();
    const extension = extensionByLanguage[normalized] || "txt";
    return `main.${extension}`;
}

function CodeBlock({ value }) {
    const { language, filename, code } = value || {};

    const [copied, setCopied] = useState(false);
    const normalizedLang = normalizeLanguage(language);
    const languageLabel = String(language || "text").toUpperCase();
    const fileLabel = filename || getFallbackFilename(language);

    const handleCopy = async () => {
        if (!code || copied) return;

        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <div className="code_block">
            <div className="code_block_header">
                <div className="code_meta">
                    <span className="code_icon">
                        <LuFileText fontSize={14} />
                    </span>
                    <span className="code_filename">{fileLabel}</span>
                    <span className="code_language">{languageLabel}</span>
                </div>

                <button
                    type="button"
                    className={`copy_code_button ${copied ? "copied" : ""}`}
                    onClick={handleCopy}
                    disabled={!code}
                    aria-label={copied ? "Copied to clipboard" : "Copy code"}
                    title={copied ? "Copied to clipboard" : "Copy code"}
                >
                    {
                        copied ?
                            <LuCheck fontSize={13} />
                            :
                            <LuCopy fontSize={14} />
                    }
                </button>
            </div>

            {/* The wrapper scrolls (not the <pre>) so keyboard users can focus and scroll long lines. */}
            <div
                className="code_content_wrapper"
                tabIndex={0}
                role="region"
                aria-label={`${fileLabel} code`}
            >
                <SyntaxHighlighter
                    language={normalizedLang}
                    style={syntaxTheme}
                    useInlineStyles={true}
                    showLineNumbers={Boolean(code && code.split("\n").length > 3)}
                    lineNumberStyle={{
                        minWidth: "2.2em",
                        paddingRight: "1.2em",
                        color: "var(--editor-gutter)",
                        textAlign: "right",
                        userSelect: "none",
                    }}
                    customStyle={{
                        margin: 0,
                        overflow: "visible",
                        width: "max-content",
                        minWidth: "100%",
                        padding: "14px 16px",
                        background: "transparent",
                        fontSize: "13px",
                        lineHeight: "1.65",
                        fontFamily: "var(--font-code)",
                    }}
                    codeTagProps={{
                        style: {
                            fontFamily: "var(--font-code)",
                        },
                    }}
                >
                    {code || ""}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

function Callout({ value }) {
    const { type, content, title } = value || {};
    const normalizedType = String(type || "info").toLowerCase();

    const config = {
        info: {
            icon: <LuInfo />,
            title: title || "Note",
            className: "callout_info",
        },
        warning: {
            icon: <LuTriangleAlert />,
            title: title || "Important Warning",
            className: "callout_warning",
        },
        success: {
            icon: <LuCircleCheck />,
            title: title || "Best Practice / Key Takeaway",
            className: "callout_success",
        },
        error: {
            icon: <LuCircleAlert />,
            title: title || "Common Pitfall",
            className: "callout_error",
        },
        danger: {
            icon: <LuCircleAlert />,
            title: title || "Danger",
            className: "callout_error",
        },
        tip: {
            icon: <LuZap />,
            title: title || "Pro Tip",
            className: "callout_tip",
        },
    };

    const current = config[normalizedType] || config.info;

    return (
        <div className={`callout ${current.className}`}>
            <div className="callout_header">
                <span className="callout_icon">{current.icon}</span>
                {current.title && <span className="callout_title">{current.title}</span>}
            </div>
            <div className="callout_content">
                {typeof content === "string" ? (
                    content
                ) : Array.isArray(content) ? (
                    <PortableTextRenderer value={content} />
                ) : (
                    content
                )}
            </div>
        </div>
    );
}

function ImageBlock({ value }) {
    const { alt, caption } = value || {};
    const imageUrl = urlForImage(value) || value?.asset?.url || value?.url;

    if (!imageUrl) return null;

    return (
        <figure className="lesson_image_wrapper">
            <img
                src={imageUrl}
                alt={alt || "Lesson illustrative figure"}
                loading="lazy"
                className="lesson_image"
            />
            {caption && <figcaption className="lesson_image_caption">{caption}</figcaption>}
        </figure>
    );
}

// Image hosted on Cloudinary (lesson diagrams); width/height reserve space to avoid layout shift.
function CloudinaryImage({ value }) {
    const { url, alt, caption, width, height } = value || {};
    if (!url || !url.startsWith("https://res.cloudinary.com/")) return null;

    return (
        <figure className="lesson_image_wrapper">
            <img
                src={url}
                alt={alt || ""}
                width={width || undefined}
                height={height || undefined}
                loading="lazy"
                decoding="async"
                className="lesson_image h-auto"
            />
            {caption && <figcaption className="lesson_image_caption">{caption}</figcaption>}
        </figure>
    );
}

function VideoEmbed({ value }) {
    const { url, title } = value || {};
    if (!url) return null;

    // Support YouTube embed conversion
    let embedUrl = url;
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    const isIframe = embedUrl.includes("youtube.com") || embedUrl.includes("vimeo.com");

    return (
        <div className="lesson_video_container">
            {isIframe ? (
                <iframe
                    src={embedUrl}
                    title={title || "Lesson Video"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="lesson_video_iframe"
                />
            ) : (
                <video controls className="lesson_video_player" src={url}>
                    Your browser does not support the video tag.
                </video>
            )}
        </div>
    );
}

// `types`: extra block renderers supplied by the page (e.g. `challengeEmbed` in a lesson).
// Unknown block types without a renderer are skipped.
export default function PortableTextRenderer({ value, types = null }) {
    if (!value || (Array.isArray(value) && value.length === 0)) {
        return null;
    }

    return (
        <PortableText
            value={value}
            onMissingComponent={false}
            components={{
                types: {
                    codeBlock: ({ value }) => <CodeBlock value={value} />,
                    callout: ({ value }) => <Callout value={value} />,
                    image: ({ value }) => <ImageBlock value={value} />,
                    cloudinaryImage: ({ value }) => <CloudinaryImage value={value} />,
                    video: ({ value }) => <VideoEmbed value={value} />,
                    challengeEmbed: () => null,
                    ...types,
                },
                marks: {
                    strong: ({ children }) => <strong className="lesson_strong">{children}</strong>,
                    em: ({ children }) => <em className="lesson_em">{children}</em>,
                    code: ({ children }) => <code className="lesson_inline_code">{children}</code>,
                    underline: ({ children }) => <u className="lesson_underline">{children}</u>,
                    "strike-through": ({ children }) => <del className="lesson_strike">{children}</del>,
                    link: ({ value, children }) => {
                        const href = value?.href || "#";
                        const isExternal = href.startsWith("http://") || href.startsWith("https://");
                        return (
                            <a
                                href={href}
                                target={isExternal ? "_blank" : undefined}
                                rel={isExternal ? "noopener noreferrer" : undefined}
                                className="lesson_link"
                            >
                                {children}
                                {isExternal && <LuExternalLink className="lesson_external_icon" />}
                            </a>
                        );
                    },
                },
                block: {
                    h1: ({ children }) => <h1 className="lesson_h1">{children}</h1>,
                    h2: ({ children }) => <h2 className="lesson_h2">{children}</h2>,
                    h3: ({ children }) => <h3 className="lesson_h3">{children}</h3>,
                    h4: ({ children }) => <h4 className="lesson_h4">{children}</h4>,
                    normal: ({ children }) => <p className="lesson_p">{children}</p>,
                    blockquote: ({ children }) => <blockquote className="lesson_quote">{children}</blockquote>,
                },
                list: {
                    bullet: ({ children }) => <ul className="lesson_ul">{children}</ul>,
                    number: ({ children }) => <ol className="lesson_ol">{children}</ol>,
                },
                listItem: {
                    bullet: ({ children }) => <li className="lesson_li_bullet">{children}</li>,
                    number: ({ children }) => <li className="lesson_li_number">{children}</li>,
                },
            }}
        />
    );
}

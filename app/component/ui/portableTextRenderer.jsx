"use client";

import { useState, useEffect } from "react";
import { PortableText } from "@portabletext/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import { MdOutlineContentCopy } from "react-icons/md";
import { FaCheck } from "react-icons/fa6";

const extensionByLanguage = {
    javascript: "js",
    html: "html",
    css: "css",
    bash: "sh",
    typescript: "ts",
    python: "py",
    java: "java",
    c: "c",
    cpp: "cpp",
    go: "go",
    rust: "rs",
    php: "php",
    sql: "sql",
    ruby: "rb",
    swift: "swift",
    kotlin: "kt",
    dart: "dart",
    r: "r",
    scala: "scala",
    elixir: "ex",
    haskell: "hs",
};

function getFallbackFilename(language) {
    const normalized = String(language || "text").toLowerCase();
    const extension = extensionByLanguage[normalized] || "txt";
    return `snippet.${extension}`;
}

function CodeBlock({ value }) {
    const { language, filename, code } = value || {};

    const [copied, setCopied] = useState(false);
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
        const timer = setTimeout(() => setCopied(false), 1200);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <div className="code_block">
            <div className="code_block_header">
                <div className="code_meta">
                    <span className="code_filename">{fileLabel}</span>
                    <span className="code_language">{languageLabel}</span>
                </div>

                <button
                    type="button"
                    className="copy_code_button"
                    onClick={handleCopy}
                    disabled={!code}
                    aria-label={copied ? "Copied" : "Copy code"}
                    title={copied ? "Copied" : "Copy code"}
                >
                    {copied ? <FaCheck fontSize={14} /> : <MdOutlineContentCopy fontSize={14} />}
                </button>
            </div>

            <div className="code_content_wrapper">
                <SyntaxHighlighter 
                    language={language || "text"}
                    useInlineStyles={true}
                    customStyle={{
                        margin: 0,
                        padding: '16px',
                        background: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.6',
                    }}
                >
                    {code || ""}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

function Callout({ value }) {
    const { type, content } = value || {};
    const icons = {
        info: "💡",
        warning: "⚠️",
        success: "✅"
    };

    return (
        <div className={`callout callout_${type || 'info'}`}>
            <span className="callout_icon">{icons[type] || icons.info}</span>
            <div className="callout_content">{content}</div>
        </div>
    );
}

export default function PortableTextRenderer({ value }) {
    return (
        <div className="portable_text_container">
            <PortableText
                value={value}
                components={{
                    types: {
                        codeBlock: ({ value }) => <CodeBlock value={value} />,
                        callout: ({ value }) => <Callout value={value} />,
                    },
                    block: {
                        h1: ({ children }) => <h1 className="lesson_h1">{children}</h1>,
                        h2: ({ children }) => <h2 className="lesson_h2">{children}</h2>,
                        h3: ({ children }) => <h3 className="lesson_h3">{children}</h3>,
                        normal: ({ children }) => <p className="lesson_p">{children}</p>,
                        blockquote: ({ children }) => <blockquote className="lesson_quote">{children}</blockquote>,
                    },
                    list: {
                        bullet: ({ children }) => <ul className="lesson_ul">{children}</ul>,
                        number: ({ children }) => <ol className="lesson_ol">{children}</ol>,
                    },
                }}
            />
        </div>
    );
}

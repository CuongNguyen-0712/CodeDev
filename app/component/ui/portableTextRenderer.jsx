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
                    {copied ? <FaCheck fontSize={16} /> : <MdOutlineContentCopy fontSize={16} />}
                </button>
            </div>

            <SyntaxHighlighter language={language || "text"}>
                {code || ""}
            </SyntaxHighlighter>
        </div>
    );
}

export default function PortableTextRenderer({ value }) {
    return (
        <PortableText
            value={value}
            components={{
                types: {
                    codeBlock: ({ value }) => <CodeBlock value={value} />,
                },
            }}
        />
    );
}

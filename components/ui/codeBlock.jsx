"use client";

import { useState, useEffect } from "react";
import { SyntaxHighlighter } from "@/lib/syntaxHighlighter";
import { syntaxTheme } from "@/lib/syntaxTheme";
import { LuCheck, LuCopy, LuFileText } from "react-icons/lu";

// Code block of a lesson (and of quiz text). Styles: .code_block in styles/learning/[id]/lesson.css,
// scoped under .lesson-prose.
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
    nginx: "conf",
    dockerfile: "dockerfile",
    docker: "dockerfile",
    yaml: "yml",
    yml: "yml",
    hcl: "tf",
    terraform: "tf",
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

export default function CodeBlock({ value }) {
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
                // group, not region: a lesson has many code blocks and same-named landmarks clutter the landmark list.
                role="group"
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

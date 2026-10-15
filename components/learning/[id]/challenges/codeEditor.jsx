'use client';

import { useId, useMemo, useRef, useState, useEffect } from "react";
import { SiPython, SiJavascript, SiTypescript } from "react-icons/si";
import { LuAlignLeft, LuFileCode } from "react-icons/lu";

import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

const INDENT = "  ";

function LanguageIcon({ language = "", fileName = "" }) {
    const l = (language || "").toLowerCase();
    const f = (fileName || "").toLowerCase();
    const className = "size-3.5 shrink-0 text-editor-muted";
    if (l.includes("py") || f.endsWith(".py")) return <SiPython className={className} aria-hidden="true" />;
    if (l.includes("type") || f.endsWith(".ts") || f.endsWith(".tsx")) return <SiTypescript className={className} aria-hidden="true" />;
    if (l.includes("js") || f.endsWith(".js") || f.endsWith(".jsx")) return <SiJavascript className={className} aria-hidden="true" />;
    return <LuFileCode className={className} aria-hidden="true" />;
}

export default function CodeEditor({
    value = "",
    onChange,
    onSave,
    onRun,
    onFormat,
    fileName = "solution.js",
    language = "javascript",
    readOnly = false,
    ariaLabel = "Code editor",
    actions = null,
    status = null,
}) {
    const hintId = useId();
    const textareaRef = useRef(null);
    const gutterRef = useRef(null);
    const tabReleasedRef = useRef(false);

    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

    const lines = useMemo(() => value.split("\n"), [value]);
    const lineCount = Math.max(1, lines.length);

    const updateCursorPos = () => {
        const el = textareaRef.current;
        if (!el) return;
        const selStart = el.selectionStart || 0;
        const textBefore = value.slice(0, selStart);
        const linesBefore = textBefore.split("\n");
        const curLine = linesBefore.length;
        const curCol = linesBefore[linesBefore.length - 1].length + 1;
        setCursorPos({ line: curLine, col: curCol });
    };

    useEffect(() => {
        updateCursorPos();
    }, [value]);

    const applyEdit = (next, selectionStart, selectionEnd = selectionStart) => {
        onChange(next);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
                el.selectionStart = selectionStart;
                el.selectionEnd = selectionEnd;
                updateCursorPos();
            }
        });
    };

    const handleKeyDown = (event) => {
        const el = event.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        const mod = event.ctrlKey || event.metaKey;

        if (mod && event.key.toLowerCase() === "s") {
            event.preventDefault();
            onSave?.();
            return;
        }

        if (mod && event.key === "Enter") {
            event.preventDefault();
            onRun?.();
            return;
        }

        if (event.key === "Escape") {
            tabReleasedRef.current = true;
            return;
        }

        if (readOnly) return;

        if (event.key === "Tab") {
            if (tabReleasedRef.current) {
                tabReleasedRef.current = false;
                return;
            }

            event.preventDefault();
            const lineStart = value.lastIndexOf("\n", start - 1) + 1;

            if (event.shiftKey) {
                const block = value.slice(lineStart, end);
                const outdented = block.replace(/^ {1,2}/gm, "");
                const removedFirst = block.match(/^ {1,2}/)?.[0].length || 0;
                const next = value.slice(0, lineStart) + outdented + value.slice(end);
                applyEdit(next, Math.max(lineStart, start - removedFirst), end - (block.length - outdented.length));
                return;
            }

            if (start !== end && value.slice(start, end).includes("\n")) {
                const block = value.slice(lineStart, end);
                const indented = block.replace(/^/gm, INDENT);
                const next = value.slice(0, lineStart) + indented + value.slice(end);
                applyEdit(next, start + INDENT.length, end + (indented.length - block.length));
                return;
            }

            applyEdit(value.slice(0, start) + INDENT + value.slice(end), start + INDENT.length);
            return;
        }

        tabReleasedRef.current = false;

        if (event.key === "Enter" && !mod) {
            event.preventDefault();
            const lineStart = value.lastIndexOf("\n", start - 1) + 1;
            const currentIndent = value.slice(lineStart, start).match(/^[ \t]*/)[0];
            const opensBlock = /[{[(:]\s*$/.test(value.slice(lineStart, start));
            const insert = "\n" + currentIndent + (opensBlock ? INDENT : "");
            applyEdit(value.slice(0, start) + insert + value.slice(end), start + insert.length);
        }
    };

    const syncScroll = (event) => {
        if (gutterRef.current) {
            gutterRef.current.scrollTop = event.currentTarget.scrollTop;
        }
    };

    const handleFormat = () => {
        if (onFormat) {
            onFormat();
            return;
        }
        // Basic indentation format fallback
        const linesArr = value.split("\n");
        let indentLevel = 0;
        const formatted = linesArr.map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return "";
            if (/^[}\])]/.test(trimmed)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            const res = INDENT.repeat(indentLevel) + trimmed;
            if (/[{[(]\s*$/.test(trimmed)) {
                indentLevel++;
            }
            return res;
        }).join("\n");
        onChange(formatted);
    };

    const displayFile = fileName || (language === "python" ? "main.py" : "solution.js");

    return (
        <div className={cn("flex flex-col", readOnly && "opacity-80")}>
            {/* Toolbar */}
            <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-editor-border bg-editor-panel px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                    <LanguageIcon language={language} fileName={displayFile} />
                    <span className="truncate font-mono text-xs text-editor-foreground">{displayFile}</span>
                </span>
                {status}
                <div className="ml-auto flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={handleFormat}
                        disabled={readOnly}
                        className="text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
                    >
                        <LuAlignLeft />
                        <span className="max-sm:sr-only">Format</span>
                    </Button>
                    {actions}
                </div>
            </div>

            {/* Editor canvas with line numbers */}
            <div className="relative flex h-80 min-h-0 bg-editor font-mono text-[13px] leading-6 focus-within:ring-2 focus-within:ring-editor-accent/40 focus-within:ring-inset sm:h-96">
                <div
                    ref={gutterRef}
                    aria-hidden="true"
                    className="w-11 shrink-0 overflow-hidden border-r border-editor-border/60 py-3 pr-2.5 text-right text-editor-gutter select-none"
                >
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i} className={cn("tabular", i + 1 === cursorPos.line && "text-editor-foreground")}>
                            {i + 1}
                        </div>
                    ))}
                </div>

                <textarea
                    ref={textareaRef}
                    className="h-full min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-3 whitespace-pre text-editor-foreground caret-editor-accent outline-none selection:bg-editor-accent/25 focus-visible:outline-none"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        updateCursorPos();
                    }}
                    onKeyUp={updateCursorPos}
                    onClick={updateCursorPos}
                    onSelect={updateCursorPos}
                    onKeyDown={handleKeyDown}
                    onScroll={syncScroll}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    wrap="off"
                    readOnly={readOnly}
                    aria-label={ariaLabel}
                    aria-describedby={hintId}
                />
            </div>

            {/* Status bar */}
            <div className="flex h-7 items-center gap-3 border-t border-editor-border bg-editor-panel px-3 font-mono text-[11px] text-editor-muted">
                <span id={hintId} className="truncate">
                    Ctrl+S save &middot; Ctrl+Enter run &middot; Esc, then Tab to leave the editor
                </span>
                <span className="ml-auto shrink-0 tabular">Ln {cursorPos.line}, Col {cursorPos.col}</span>
                <span className="shrink-0 capitalize max-sm:hidden">{language || "code"}</span>
            </div>
        </div>
    );
}

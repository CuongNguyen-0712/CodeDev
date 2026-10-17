'use client';

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { SiPython, SiJavascript, SiTypescript } from "react-icons/si";
import { LuAlignLeft, LuFileCode, LuKeyboard } from "react-icons/lu";

import { Button } from "@/components/shadcn/button";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { syntaxTheme } from "@/lib/syntaxTheme";
import { cn } from "@/lib/utils";

const INDENT = "  ";
// Must match the canvas: leading-6 and the p-3 padding of the textarea and the highlight layer.
// The line height stays 24px at every font size, so the active-line math holds on phones too.
const LINE_HEIGHT = 24;
const PADDING = 12;

const OPENERS = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);
const QUOTES = new Set(['"', "'", "`"]);

const HISTORY_LIMIT = 200;
// Keystrokes closer together than this are undone as one step, like VS Code.
const UNDO_GROUP_MS = 600;

// VS Code default keybindings this editor supports ("Mod" is Ctrl, or Cmd on macOS).
const SHORTCUTS = [
    { label: "Run sample tests", keys: ["Mod+Enter"] },
    { label: "Save draft", keys: ["Mod+S"] },
    { label: "Toggle line comment", keys: ["Mod+/"] },
    { label: "Undo / redo", keys: ["Mod+Z", "Mod+Shift+Z"] },
    { label: "Move line up / down", keys: ["Alt+Up", "Alt+Down"] },
    { label: "Copy line up / down", keys: ["Shift+Alt+Up", "Shift+Alt+Down"] },
    { label: "Delete line", keys: ["Mod+Shift+K"] },
    { label: "Insert line above", keys: ["Mod+Shift+Enter"] },
    { label: "Select line", keys: ["Mod+L"] },
    { label: "Indent / outdent", keys: ["Tab", "Shift+Tab"] },
    { label: "Indent / outdent line", keys: ["Mod+]", "Mod+["] },
    { label: "Format code", keys: ["Shift+Alt+F"] },
    { label: "Leave the editor", keys: ["Esc", "Tab"], sequence: true },
];

function LanguageIcon({ language = "", fileName = "" }) {
    const l = (language || "").toLowerCase();
    const f = (fileName || "").toLowerCase();
    const className = "size-3.5 shrink-0 text-editor-muted";
    if (l.includes("py") || f.endsWith(".py")) return <SiPython className={className} aria-hidden="true" />;
    if (l.includes("type") || f.endsWith(".ts") || f.endsWith(".tsx")) return <SiTypescript className={className} aria-hidden="true" />;
    if (l.includes("js") || f.endsWith(".js") || f.endsWith(".jsx")) return <SiJavascript className={className} aria-hidden="true" />;
    return <LuFileCode className={className} aria-hidden="true" />;
}

// ------------------------------------------------------------------ text edits
// Each edit takes the text and selection and returns { text, start, end }, or null for no-op.

/** Start of the first and end of the last line touched by the selection. */
function lineBounds(text, start, end) {
    const from = text.lastIndexOf("\n", start - 1) + 1;
    // A selection ending right after a newline does not include the next line (VS Code rule).
    const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const newline = text.indexOf("\n", last);
    return { from, to: newline === -1 ? text.length : newline };
}

function replaceRange(text, from, to, insert) {
    return text.slice(0, from) + insert + text.slice(to);
}

function toggleComment(text, start, end, token) {
    const { from, to } = lineBounds(text, start, end);
    const lines = text.slice(from, to).split("\n");
    const filled = lines.filter((line) => line.trim());
    if (filled.length === 0) return null;

    const commented = filled.every((line) => line.trimStart().startsWith(token));
    const indent = Math.min(...filled.map((line) => line.match(/^\s*/)[0].length));

    const next = lines.map((line) => {
        if (!line.trim()) return line;
        if (commented) {
            const at = line.indexOf(token);
            const rest = line.slice(at + token.length);
            return line.slice(0, at) + (rest.startsWith(" ") ? rest.slice(1) : rest);
        }
        return line.slice(0, indent) + token + " " + line.slice(indent);
    });

    const block = next.join("\n");
    const firstDelta = next[0].length - lines[0].length;
    const delta = block.length - (to - from);
    const nextStart = Math.max(from, start + firstDelta);

    return {
        text: replaceRange(text, from, to, block),
        start: nextStart,
        end: start === end ? nextStart : end + delta,
    };
}

function indentLines(text, start, end, outdent) {
    const { from, to } = lineBounds(text, start, end);
    const block = text.slice(from, to);

    if (outdent) {
        const removedFirst = block.match(/^ {1,2}/)?.[0].length || 0;
        const next = block.replace(/^ {1,2}/gm, "");
        return {
            text: replaceRange(text, from, to, next),
            start: Math.max(from, start - removedFirst),
            end: Math.max(from, end - (block.length - next.length)),
        };
    }

    const next = block.replace(/^/gm, INDENT);
    return {
        text: replaceRange(text, from, to, next),
        start: start + INDENT.length,
        end: end + (next.length - block.length),
    };
}

function moveLines(text, start, end, direction) {
    const { from, to } = lineBounds(text, start, end);
    const block = text.slice(from, to);

    if (direction < 0) {
        if (from === 0) return null;
        const prevFrom = text.lastIndexOf("\n", from - 2) + 1;
        const prev = text.slice(prevFrom, from - 1);
        const shift = -(prev.length + 1);
        return {
            text: text.slice(0, prevFrom) + block + "\n" + prev + text.slice(to),
            start: start + shift,
            end: end + shift,
        };
    }

    if (to >= text.length) return null;
    const nextNewline = text.indexOf("\n", to + 1);
    const nextTo = nextNewline === -1 ? text.length : nextNewline;
    const following = text.slice(to + 1, nextTo);
    const shift = following.length + 1;
    return {
        text: text.slice(0, from) + following + "\n" + block + text.slice(nextTo),
        start: start + shift,
        end: end + shift,
    };
}

function copyLines(text, start, end, direction) {
    const { from, to } = lineBounds(text, start, end);
    const block = text.slice(from, to);

    if (direction < 0) {
        // The cursor stays on the upper copy.
        return { text: replaceRange(text, from, from, block + "\n"), start, end };
    }

    const shift = block.length + 1;
    return { text: replaceRange(text, to, to, "\n" + block), start: start + shift, end: end + shift };
}

function deleteLines(text, start, end) {
    const { from, to } = lineBounds(text, start, end);
    const column = start - from;

    let cutFrom = from;
    let cutTo = to;
    if (to < text.length) cutTo = to + 1;
    else if (from > 0) cutFrom = from - 1;

    const next = text.slice(0, cutFrom) + text.slice(cutTo);
    const lineStart = cutFrom === from ? from : next.lastIndexOf("\n", cutFrom - 1) + 1;
    const lineEndIndex = next.indexOf("\n", lineStart);
    const lineEnd = lineEndIndex === -1 ? next.length : lineEndIndex;
    const caret = Math.min(lineStart + column, lineEnd);

    return { text: next, start: caret, end: caret };
}

function insertLineAbove(text, start) {
    const from = text.lastIndexOf("\n", start - 1) + 1;
    const indent = text.slice(from).match(/^[ \t]*/)[0];
    const caret = from + indent.length;
    return { text: replaceRange(text, from, from, indent + "\n"), start: caret, end: caret };
}

function breakLine(text, start, end) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const before = text.slice(lineStart, start);
    const indent = before.match(/^[ \t]*/)[0];
    const prev = text[start - 1];

    // Enter between a bracket pair opens an indented block: {|} -> {\n  |\n}
    if (start === end && OPENERS[prev] && text[end] === OPENERS[prev]) {
        const insert = "\n" + indent + INDENT + "\n" + indent;
        const caret = start + 1 + indent.length + INDENT.length;
        return { text: replaceRange(text, start, end, insert), start: caret, end: caret };
    }

    const opensBlock = /[{[(:]\s*$/.test(before);
    const insert = "\n" + indent + (opensBlock ? INDENT : "");
    const caret = start + insert.length;
    return { text: replaceRange(text, start, end, insert), start: caret, end: caret };
}

function formatIndentation(text) {
    let level = 0;
    return text.split("\n").map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        if (/^[}\])]/.test(trimmed)) level = Math.max(0, level - 1);
        const formatted = INDENT.repeat(level) + trimmed;
        if (/[{[(]\s*$/.test(trimmed)) level++;
        return formatted;
    }).join("\n");
}

function ShortcutKeys({ combo, isMac }) {
    const names = { Mod: isMac ? "Cmd" : "Ctrl", Alt: isMac ? "Option" : "Alt", Up: "Up", Down: "Down" };
    return (
        <KbdGroup>
            {combo.split("+").map((part, index) => (
                <Kbd key={index} className="bg-muted font-mono text-[11px]">{names[part] || part}</Kbd>
            ))}
        </KbdGroup>
    );
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

    // Undo history is kept here: programmatic edits would otherwise wipe the browser's own stack.
    const historyRef = useRef({ undo: [], redo: [], at: 0 });
    const lastValueRef = useRef(value);
    const selectionRef = useRef({ start: 0, end: 0 });

    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [scroll, setScroll] = useState({ top: 0, left: 0 });
    const [isMac, setIsMac] = useState(false);

    const lineCount = Math.max(1, value.split("\n").length);
    const commentToken = /py/i.test(language || "") ? "#" : "//";

    useEffect(() => {
        setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || ""));
    }, []);

    const updateCursorPos = () => {
        const el = textareaRef.current;
        if (!el) return;
        const selStart = el.selectionStart || 0;
        selectionRef.current = { start: selStart, end: el.selectionEnd || 0 };
        const linesBefore = el.value.slice(0, selStart).split("\n");
        setCursorPos({ line: linesBefore.length, col: linesBefore[linesBefore.length - 1].length + 1 });
    };

    // Changes made outside the editor (reset, restore a submission) become one undo step.
    useEffect(() => {
        if (value !== lastValueRef.current) {
            const history = historyRef.current;
            history.undo.push({ value: lastValueRef.current, ...selectionRef.current });
            if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
            history.redo = [];
            history.at = 0;
            lastValueRef.current = value;
        }
        updateCursorPos();
    }, [value]);

    const record = (force) => {
        const history = historyRef.current;
        const now = Date.now();
        history.redo = [];
        if (!force && now - history.at < UNDO_GROUP_MS) {
            history.at = now;
            return;
        }
        history.undo.push({ value: lastValueRef.current, ...selectionRef.current });
        if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
        history.at = force ? 0 : now;
    };

    const select = (start, end = start, direction = "none") => {
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.setSelectionRange(start, end, direction);
            updateCursorPos();
        });
    };

    const commit = (next, start, end = start) => {
        record(true);
        lastValueRef.current = next;
        onChange(next);
        select(start, end);
    };

    const apply = (edit) => {
        if (edit) commit(edit.text, edit.start, edit.end);
    };

    const travel = (from, to) => {
        const history = historyRef.current;
        const step = history[from].pop();
        if (!step) return;
        const el = textareaRef.current;
        history[to].push({ value: lastValueRef.current, start: el?.selectionStart || 0, end: el?.selectionEnd || 0 });
        history.at = 0;
        lastValueRef.current = step.value;
        onChange(step.value);
        select(step.start, step.end);
    };

    const handleFormat = () => {
        if (readOnly) return;
        if (onFormat) {
            onFormat();
            return;
        }
        const formatted = formatIndentation(value);
        if (formatted !== value) {
            const caret = Math.min(textareaRef.current?.selectionStart || 0, formatted.length);
            commit(formatted, caret);
        }
    };

    const handleKeyDown = (event) => {
        const el = event.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        selectionRef.current = { start, end };
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key;
        const lower = key.length === 1 ? key.toLowerCase() : key;

        // Commands that work in read-only mode too.
        if (mod && lower === "s") {
            event.preventDefault();
            onSave?.();
            return;
        }

        if (mod && key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onRun?.();
            return;
        }

        if (key === "Escape") {
            tabReleasedRef.current = true;
            return;
        }

        if (key === "Home" && !mod && !event.altKey) {
            // Smart Home: first non-blank character, then column 1.
            event.preventDefault();
            const backward = el.selectionDirection === "backward";
            const caret = backward ? start : end;
            const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
            const firstChar = lineStart + value.slice(lineStart).match(/^[ \t]*/)[0].length;
            const target = caret === firstChar ? lineStart : firstChar;
            if (event.shiftKey) {
                const anchor = backward ? end : start;
                el.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target), target < anchor ? "backward" : "forward");
            } else {
                el.setSelectionRange(target, target);
            }
            updateCursorPos();
            return;
        }

        if (mod && lower === "l" && !event.shiftKey) {
            event.preventDefault();
            const { from, to } = lineBounds(value, start, end);
            el.setSelectionRange(from, Math.min(value.length, to + 1));
            updateCursorPos();
            return;
        }

        if (readOnly) {
            if (mod && (lower === "z" || lower === "y")) event.preventDefault();
            return;
        }

        if (mod && lower === "z") {
            event.preventDefault();
            if (event.shiftKey) travel("redo", "undo");
            else travel("undo", "redo");
            return;
        }

        if (mod && lower === "y") {
            event.preventDefault();
            travel("redo", "undo");
            return;
        }

        if (mod && (key === "/" || event.code === "Slash")) {
            event.preventDefault();
            apply(toggleComment(value, start, end, commentToken));
            return;
        }

        if (mod && event.shiftKey && lower === "k") {
            event.preventDefault();
            apply(deleteLines(value, start, end));
            return;
        }

        if (mod && event.shiftKey && key === "Enter") {
            event.preventDefault();
            apply(insertLineAbove(value, start));
            return;
        }

        const bracket = event.code === "BracketLeft" || key === "[" ? "[" : event.code === "BracketRight" || key === "]" ? "]" : null;
        if (mod && bracket) {
            event.preventDefault();
            apply(indentLines(value, start, end, bracket === "["));
            return;
        }

        if (event.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
            event.preventDefault();
            const direction = key === "ArrowUp" ? -1 : 1;
            apply(event.shiftKey ? copyLines(value, start, end, direction) : moveLines(value, start, end, direction));
            return;
        }

        if (event.altKey && event.shiftKey && (event.code === "KeyF" || lower === "f")) {
            event.preventDefault();
            handleFormat();
            return;
        }

        if (key === "Tab" && !mod) {
            if (tabReleasedRef.current) {
                tabReleasedRef.current = false;
                return;
            }

            event.preventDefault();
            const multiLine = start !== end && value.slice(start, end).includes("\n");
            if (event.shiftKey || multiLine) {
                apply(indentLines(value, start, end, event.shiftKey));
            } else {
                commit(replaceRange(value, start, end, INDENT), start + INDENT.length);
            }
            return;
        }

        tabReleasedRef.current = false;

        if (key === "Enter" && !mod) {
            event.preventDefault();
            apply(breakLine(value, start, end));
            return;
        }

        if (key === "Backspace" && !mod && !event.altKey && start === end && start > 0) {
            const prev = value[start - 1];
            const next = value[start];

            // Delete an empty auto-closed pair in one go: (|) -> |
            if (OPENERS[prev] === next || (QUOTES.has(prev) && prev === next)) {
                event.preventDefault();
                commit(replaceRange(value, start - 1, start + 1, ""), start - 1);
                return;
            }

            // In leading whitespace, step back to the previous indent stop.
            const lineStart = value.lastIndexOf("\n", start - 1) + 1;
            const before = value.slice(lineStart, start);
            if (before.length >= INDENT.length && /^ +$/.test(before)) {
                event.preventDefault();
                const width = before.length % INDENT.length || INDENT.length;
                commit(replaceRange(value, start - width, start, ""), start - width);
            }
            return;
        }

        if (mod || event.altKey || key.length !== 1) return;

        const prev = value[start - 1] || "";
        const next = value[end] || "";
        const selected = value.slice(start, end);

        // Typing a closer that is already there steps over it.
        if ((CLOSERS.has(key) || QUOTES.has(key)) && start === end && next === key) {
            event.preventDefault();
            el.setSelectionRange(start + 1, start + 1);
            updateCursorPos();
            return;
        }

        const closer = OPENERS[key] || (QUOTES.has(key) ? key : null);
        if (!closer) return;

        // Wrap the selection: "text" -> ("text")
        if (selected) {
            event.preventDefault();
            commit(replaceRange(value, start, end, key + selected + closer), start + 1, end + 1);
            return;
        }

        const beforeBoundary = !next || /[\s)\]};,.:]/.test(next);
        const quoteAllowed = !QUOTES.has(key) || !/[\w\\]/.test(prev);
        if (beforeBoundary && quoteAllowed) {
            event.preventDefault();
            commit(replaceRange(value, start, end, key + closer), start + 1);
        }
    };

    const handleChange = (event) => {
        const next = event.target.value;
        const inputType = event.nativeEvent?.inputType || "";
        record(/Paste|Drop|Cut|Delete(Word|Line)/.test(inputType));
        lastValueRef.current = next;
        onChange(next);
        updateCursorPos();
    };

    const handleScroll = (event) => {
        const { scrollTop, scrollLeft } = event.currentTarget;
        if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
        setScroll({ top: scrollTop, left: scrollLeft });
    };

    // Re-highlight only when the text changes, not on every caret move or scroll.
    const highlighted = useMemo(() => (
        <SyntaxHighlighter
            language={language || "javascript"}
            style={syntaxTheme}
            PreTag="div"
            customStyle={{ margin: 0, padding: PADDING, background: "transparent", overflow: "visible" }}
        >
            {/* Trailing newline keeps the last empty line measurable, as in the textarea. */}
            {value + "\n"}
        </SyntaxHighlighter>
    ), [value, language]);

    const displayFile = fileName || (language === "python" ? "main.py" : "solution.js");
    const modLabel = isMac ? "Cmd" : "Ctrl";

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
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Keyboard shortcuts"
                                title="Keyboard shortcuts"
                                className="text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
                            >
                                <LuKeyboard />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
                            <p className="border-b px-3 py-2 text-sm font-medium">Keyboard shortcuts</p>
                            <dl className="max-h-80 overflow-y-auto px-3 py-2 text-xs">
                                {SHORTCUTS.map((shortcut) => (
                                    <div key={shortcut.label} className="flex items-center justify-between gap-3 py-1">
                                        <dt className="text-muted-foreground">{shortcut.label}</dt>
                                        <dd className="flex shrink-0 items-center gap-1">
                                            {shortcut.keys.map((combo, index) => (
                                                <span key={combo} className="flex items-center gap-1">
                                                    {index > 0 && (
                                                        <span className="text-muted-foreground" aria-hidden="true">
                                                            {shortcut.sequence ? "then" : "/"}
                                                        </span>
                                                    )}
                                                    <ShortcutKeys combo={combo} isMac={isMac} />
                                                </span>
                                            ))}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </PopoverContent>
                    </Popover>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={handleFormat}
                        disabled={readOnly}
                        title="Format code (Shift+Alt+F)"
                        className="text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
                    >
                        <LuAlignLeft />
                        <span className="max-sm:sr-only">Format</span>
                    </Button>
                    {actions}
                </div>
            </div>

            {/* Editor canvas: line numbers, highlight layer, transparent textarea on top.
                Height follows the stable small viewport (svh), so the on-screen keyboard
                does not resize it. Phones get 16px text: globals.css forces 16px on
                textareas up to 425px (iOS focus zoom), and both layers must match. */}
            <div className="relative flex h-[clamp(15rem,50svh,36rem)] min-h-0 bg-editor font-mono text-[13px] leading-6 [font-variant-ligatures:none] focus-within:ring-2 focus-within:ring-editor-accent/40 focus-within:ring-inset max-[425px]:text-base">
                <div
                    ref={gutterRef}
                    aria-hidden="true"
                    className="w-11 shrink-0 overflow-hidden border-r border-editor-border/60 py-3 pr-2.5 text-right text-editor-gutter select-none max-[425px]:w-10 max-[425px]:pr-2 max-[425px]:text-[13px]"
                >
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i} className={cn("tabular", i + 1 === cursorPos.line && "text-editor-foreground")}>
                            {i + 1}
                        </div>
                    ))}
                </div>

                <div className="relative min-w-0 flex-1 overflow-hidden">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                        <div
                            className="absolute inset-x-0 bg-syntax-line"
                            style={{
                                height: LINE_HEIGHT,
                                transform: `translateY(${PADDING + (cursorPos.line - 1) * LINE_HEIGHT - scroll.top}px)`,
                            }}
                        />
                        <div
                            className="relative w-max min-w-full"
                            style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
                        >
                            {highlighted}
                        </div>
                    </div>

                    <textarea
                        ref={textareaRef}
                        className="absolute inset-0 size-full resize-none overflow-auto bg-transparent p-3 whitespace-pre text-transparent caret-editor-accent outline-none [tab-size:4] [-webkit-text-fill-color:transparent] selection:bg-syntax-selection focus-visible:outline-none"
                        value={value}
                        onChange={handleChange}
                        onKeyUp={updateCursorPos}
                        onClick={updateCursorPos}
                        onSelect={updateCursorPos}
                        onKeyDown={handleKeyDown}
                        onScroll={handleScroll}
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
            </div>

            {/* Status bar */}
            <div className="flex h-7 items-center gap-3 border-t border-editor-border bg-editor-panel px-3 font-mono text-[11px] text-editor-muted">
                {/* Touch screens rarely have these keys: the hint stays for screen readers only. */}
                <span id={hintId} className="truncate max-sm:sr-only">
                    {modLabel}+Enter run &middot; {modLabel}+/ comment &middot; Alt+Up/Down move line &middot; Esc, then Tab to leave the editor
                </span>
                <span className="ml-auto shrink-0 tabular">Ln {cursorPos.line}, Col {cursorPos.col}</span>
                <span className="shrink-0 capitalize max-sm:hidden">{language || "code"}</span>
            </div>
        </div>
    );
}

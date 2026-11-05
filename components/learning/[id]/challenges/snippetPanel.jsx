'use client';

import { useRef, useState } from "react";
import { LuCheck, LuChevronDown, LuChevronRight, LuPlus } from "react-icons/lu";

import { cn } from "@/lib/utils";

import { PIECE_MIME } from "./codeEditor";

/**
 * Code pieces of a piece-assembly challenge (content/README.md "Pieces"), cut from the solution
 * and shuffled per learner, some of them wrong on purpose. Clicking a piece inserts it at the
 * editor's caret (a caret on a `[ ] ...` line replaces that line), or at the start of the
 * function body before the editor was used; on desktop a piece can also be dragged onto a line.
 * Where it goes is the learner's choice. The box on the left marks it as used.
 * layout "grid": under the editor, two columns from sm (the normal lesson view).
 * layout "column": one scrolling column beside the editor (the expanded workspace).
 * Below lg the list is collapsible (tap only).
 */
export default function SnippetPanel({ snippets, used, onToggle, onInsert, disabled = false, layout = "grid", className, style }) {
    const [open, setOpen] = useState(false);
    const [shown, setShown] = useState(null); // id of the piece whose whole code is shown
    const ghostRef = useRef(null);
    const listId = "snippet-list";

    // Drag image: a small chip with the piece's first line, not a picture of the whole row.
    const startDrag = (event, snippet) => {
        event.dataTransfer.setData(PIECE_MIME, snippet.id);
        event.dataTransfer.setData("text/plain", snippet.code);
        event.dataTransfer.effectAllowed = "copy";
        const ghost = ghostRef.current;
        if (ghost && event.dataTransfer.setDragImage) {
            ghost.textContent = String(snippet.code).split("\n").find((line) => line.trim())?.trim() || snippet.label;
            event.dataTransfer.setDragImage(ghost, 12, 14);
        }
    };

    return (
        <section aria-label="Code pieces" className={cn("flex min-h-0 flex-col bg-editor", className)} style={style}>
            {/* min-h-10: the same height as the editor toolbar next to it. */}
            <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-editor-border bg-editor-panel px-3 font-mono text-[11px] text-editor-muted">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    aria-controls={listId}
                    className="-ml-1 flex min-h-9 items-center gap-1.5 rounded-sm px-1 text-editor-foreground hover:bg-editor-raised lg:pointer-events-none"
                >
                    <LuChevronRight className={cn("size-3.5 transition-transform lg:hidden", open && "rotate-90")} aria-hidden="true" />
                    Pieces
                </button>
                <span className="ml-auto tabular">{used.size}/{snippets.length} used</span>
            </div>

            <ul
                id={listId}
                className={cn(
                    "list-none overflow-y-auto",
                    layout === "grid" ? "max-h-[26rem] sm:grid sm:grid-cols-2" : "min-h-0 flex-1",
                    !open && "max-lg:hidden"
                )}
            >
                {snippets.map((snippet) => {
                    const isUsed = used.has(snippet.id);
                    const isShown = shown === snippet.id;
                    const firstLine = String(snippet.code).split("\n").find((line) => line.trim()) || "";
                    const codeId = `piece-code-${snippet.id}`;
                    return (
                        <li key={snippet.id} className={cn("border-b border-editor-border/60", layout === "grid" ? "sm:odd:border-r" : "last:border-b-0")}>
                            <div className="flex items-stretch">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isUsed}
                                    aria-label={`Mark "${snippet.label}" as used`}
                                    onClick={() => onToggle(snippet.id)}
                                    className="flex w-10 shrink-0 items-start justify-center pt-[9px] hover:bg-editor-raised lg:w-9"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "flex size-4 items-center justify-center rounded-sm border",
                                            isUsed ? "border-editor-success bg-editor-success text-editor" : "border-editor-muted"
                                        )}
                                    >
                                        {isUsed && <LuCheck className="size-3" />}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onInsert(snippet)}
                                    disabled={disabled}
                                    draggable={!disabled}
                                    onDragStart={(event) => startDrag(event, snippet)}
                                    title={`Insert into its placeholder, or drag it onto a line:\n${snippet.code}`}
                                    className="group flex min-h-11 min-w-0 flex-1 items-start gap-2 py-2 pr-3 text-left hover:bg-editor-raised disabled:cursor-default disabled:hover:bg-transparent lg:min-h-9"
                                >
                                    <span className="min-w-0 flex-1 space-y-0.5">
                                        <span className={cn("block text-xs leading-snug text-editor-foreground", isUsed && "text-editor-muted line-through")}>
                                            {snippet.label}
                                        </span>
                                        {snippet.note && <span className="block text-[11px] leading-snug text-editor-muted">{snippet.note}</span>}
                                        {!isShown && <code className="block truncate font-mono text-[11px] text-editor-muted">{firstLine}</code>}
                                    </span>
                                    <LuPlus className="mt-0.5 size-3.5 shrink-0 text-editor-muted group-hover:text-editor-foreground" aria-hidden="true" />
                                    <span className="sr-only">Insert</span>
                                </button>
                                {/* Pieces for one placeholder can share a label: the whole code tells them apart. */}
                                <button
                                    type="button"
                                    onClick={() => setShown(isShown ? null : snippet.id)}
                                    aria-expanded={isShown}
                                    aria-controls={codeId}
                                    aria-label={`${isShown ? "Hide" : "Show"} the code of "${snippet.label}"`}
                                    title={isShown ? "Hide the code" : "Show the whole piece"}
                                    className="flex w-9 shrink-0 items-start justify-center pt-2.5 text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
                                >
                                    <LuChevronDown className={cn("size-3.5 transition-transform", isShown && "rotate-180")} aria-hidden="true" />
                                </button>
                            </div>
                            {isShown && (
                                <pre id={codeId} className="mx-3 mb-2 max-h-56 overflow-auto rounded-sm border border-editor-border bg-editor-panel p-2 font-mono text-[11px] leading-relaxed text-editor-foreground">
                                    {snippet.code}
                                </pre>
                            )}
                        </li>
                    );
                })}
            </ul>
            {/* Off-screen but rendered: setDragImage needs a laid-out element. */}
            <div
                ref={ghostRef}
                aria-hidden="true"
                className="pointer-events-none fixed top-0 -left-[9999px] max-w-80 truncate rounded-md border border-editor-accent bg-editor-raised px-2.5 py-1.5 font-mono text-xs text-editor-foreground shadow-lg"
            />
        </section>
    );
}

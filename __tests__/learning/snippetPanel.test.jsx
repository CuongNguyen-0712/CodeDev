// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";

import SnippetPanel from "@/components/learning/[id]/challenges/snippetPanel";
import CodeEditor, { PIECE_MIME, caretFromPoint } from "@/components/learning/[id]/challenges/codeEditor";
import { entryBodyStart } from "@/lib/challenges/entry";

afterEach(cleanup);

const snippets = [
    { id: "read", label: "Read the port", code: "const port = Number(env.PORT);" },
    { id: "check", label: "Reject a bad port", code: "if (!port) throw new Error('PORT');", note: "Fill in the range check" },
];

describe("SnippetPanel", () => {
    it("inserts a snippet and toggles its used mark", () => {
        const onInsert = vi.fn();
        const onToggle = vi.fn();
        const { rerender } = render(<SnippetPanel snippets={snippets} used={new Set()} onToggle={onToggle} onInsert={onInsert} />);

        expect(screen.getByText("0/2 used")).toBeTruthy();
        fireEvent.click(screen.getByText("Read the port"));
        expect(onInsert).toHaveBeenCalledWith(snippets[0]);

        const box = screen.getByRole("checkbox", { name: 'Mark "Reject a bad port" as used' });
        expect(box.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(box);
        expect(onToggle).toHaveBeenCalledWith("check");

        rerender(<SnippetPanel snippets={snippets} used={new Set(["check"])} onToggle={onToggle} onInsert={onInsert} />);
        expect(box.getAttribute("aria-checked")).toBe("true");
        expect(screen.getByText("1/2 used")).toBeTruthy();
    });

    it("does not insert while disabled", () => {
        const onInsert = vi.fn();
        render(<SnippetPanel snippets={snippets} used={new Set()} onToggle={() => {}} onInsert={onInsert} disabled />);
        fireEvent.click(screen.getByText("Read the port"));
        expect(onInsert).not.toHaveBeenCalled();
    });
});

describe("CodeEditor insertAtCursor", () => {
    it("inserts at the fallback position before the editor was focused", () => {
        const ref = createRef();
        const onChange = vi.fn();
        const value = "function f() {\n}\n";
        render(<CodeEditor ref={ref} value={value} onChange={onChange} />);

        expect(ref.current.insertAtCursor("x();", value.indexOf("}"))).toEqual({ line: 2 });
        expect(onChange).toHaveBeenCalledWith("function f() {\n  x();\n}\n");
    });

    it("inserts at the caret once the editor was used", () => {
        const ref = createRef();
        const onChange = vi.fn();
        const value = "a();\n\nb();\n";
        render(<CodeEditor ref={ref} value={value} onChange={onChange} />);

        const textarea = screen.getByRole("textbox");
        fireEvent.focus(textarea);
        textarea.setSelectionRange(5, 5);
        fireEvent.select(textarea);

        ref.current.insertAtCursor("mid();", 0);
        expect(onChange).toHaveBeenCalledWith("a();\nmid();\nb();\n");
    });

    it("ignores inserts while read-only", () => {
        const ref = createRef();
        const onChange = vi.fn();
        render(<CodeEditor ref={ref} value="x" onChange={onChange} readOnly />);
        expect(ref.current.insertAtCursor("y", 0)).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("piece assembly", () => {
    const base = "function f(env) {\n  // [ ] Read the port\n  // [ ] Return it\n}\n";

    it("never picks the place from the piece: no caret means the start of the function body", () => {
        const ref = createRef();
        const onChange = vi.fn();
        render(<CodeEditor ref={ref} value={base} onChange={onChange} />);

        // The piece belongs to "Return it", but without a caret it lands at the body start,
        // above the first line, and every placeholder stays.
        expect(ref.current.insertAtCursor("return port;", entryBodyStart(base))).toEqual({ line: 2 });
        expect(onChange).toHaveBeenCalledWith("function f(env) {\n  return port;\n  // [ ] Read the port\n  // [ ] Return it\n}\n");
    });

    it("fills the placeholder line the caret is on", () => {
        const ref = createRef();
        const onChange = vi.fn();
        render(<CodeEditor ref={ref} value={base} onChange={onChange} />);
        const textarea = screen.getByRole("textbox");
        fireEvent.focus(textarea);
        const onReturnLine = base.indexOf("// [ ] Return it") + 3;
        textarea.setSelectionRange(onReturnLine, onReturnLine);
        fireEvent.select(textarea);

        expect(ref.current.insertAtCursor("return port;", 0)).toEqual({ line: 3 });
        expect(onChange).toHaveBeenCalledWith("function f(env) {\n  // [ ] Read the port\n  return port;\n}\n");
    });

    it("drops a dragged piece on the line under the pointer and reports its id", () => {
        const onChange = vi.fn();
        const onDropSnippet = vi.fn();
        render(<CodeEditor value={base} onChange={onChange} onDropSnippet={onDropSnippet} />);
        const textarea = screen.getByRole("textbox");
        textarea.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400 });
        const data = { [PIECE_MIME]: "read", "text/plain": "const port = 80;" };
        const dataTransfer = { types: Object.keys(data), getData: (type) => data[type], dropEffect: "none" };

        // Line 4 (index 3): "}" -> the piece goes above it, one level deeper.
        // jsdom has no DragEvent: set the pointer position on the event by hand.
        const drop = createEvent.drop(textarea, { dataTransfer });
        Object.defineProperties(drop, { clientX: { value: 12 }, clientY: { value: 12 + 24 * 3 + 2 } });
        fireEvent(textarea, drop);
        expect(onChange).toHaveBeenCalledWith("function f(env) {\n  // [ ] Read the port\n  // [ ] Return it\n  const port = 80;\n}\n");
        expect(onDropSnippet).toHaveBeenCalledWith("read", { line: 4 });
    });

    it("replaces the placeholder line a piece is dropped on, whatever its label", () => {
        const onChange = vi.fn();
        render(<CodeEditor value={base} onChange={onChange} />);
        const textarea = screen.getByRole("textbox");
        textarea.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400 });
        const data = { [PIECE_MIME]: "result", "text/plain": "return port;" };
        const drop = createEvent.drop(textarea, { dataTransfer: { types: Object.keys(data), getData: (type) => data[type] } });
        // Line 2 (index 1): "  // [ ] Read the port"
        Object.defineProperties(drop, { clientX: { value: 12 + 8 * 8 }, clientY: { value: 12 + 24 + 2 } });
        fireEvent(textarea, drop);
        expect(onChange).toHaveBeenCalledWith("function f(env) {\n  return port;\n  // [ ] Return it\n}\n");
    });

    it("leaves other drags to the browser", () => {
        const onChange = vi.fn();
        render(<CodeEditor value={base} onChange={onChange} />);
        const dataTransfer = { types: ["text/plain"], getData: () => "x" };
        fireEvent.drop(screen.getByRole("textbox"), { clientX: 20, clientY: 20, dataTransfer });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("maps a point to a text index on the monospace grid, with scrolling and clamping", () => {
        const el = { value: "ab\ncdef\ng", scrollTop: 24, scrollLeft: 0, getBoundingClientRect: () => ({ top: 100, left: 50 }) };
        // y: first visible row is line 1 (scrolled one line); x: 3 columns in, clamped to "cdef".length
        expect(caretFromPoint(el, 50 + 12 + 3 * 8, 100 + 12 + 2, 8)).toBe(3 + 3);
        expect(caretFromPoint(el, 50 + 12 + 40 * 8, 100 + 12 + 2, 8)).toBe(3 + 4);
        expect(caretFromPoint(el, 0, 9999, 8)).toBe(8);
    });

    it("sets the piece id and its code when a row is dragged", () => {
        render(<SnippetPanel snippets={snippets} used={new Set()} onToggle={() => {}} onInsert={() => {}} />);
        const set = vi.fn();
        const setDragImage = vi.fn();
        fireEvent.dragStart(screen.getByText("Read the port").closest("button"), { dataTransfer: { setData: set, setDragImage, effectAllowed: "" } });
        expect(set).toHaveBeenCalledWith(PIECE_MIME, "read");
        expect(set).toHaveBeenCalledWith("text/plain", "const port = Number(env.PORT);");
        // A small chip with the first code line is dragged, not the whole row.
        const [ghost] = setDragImage.mock.calls[0];
        expect(ghost.textContent).toBe("const port = Number(env.PORT);");
        expect(ghost.closest("li")).toBeNull();
    });
});

describe("piece code preview", () => {
    it("shows and hides the whole code of a piece", () => {
        const pieces = [{ id: "a", label: "Same", code: "one();\ntwo();" }, { id: "b", label: "Same", code: "one();\nthree();" }];
        render(<SnippetPanel snippets={pieces} used={new Set()} onToggle={() => {}} onInsert={() => {}} />);
        const [showA] = screen.getAllByRole("button", { name: 'Show the code of "Same"' });
        fireEvent.click(showA);
        expect(showA.getAttribute("aria-expanded")).toBe("true");
        expect(document.getElementById("piece-code-a").textContent).toBe("one();\ntwo();");
        fireEvent.click(screen.getByRole("button", { name: 'Hide the code of "Same"' }));
        expect(document.getElementById("piece-code-a")).toBeNull();
    });
});

describe("undo and redo buttons", () => {
    it("step back and forward through inserted pieces", () => {
        const ref = createRef();
        let value = "function f() {\n}\n";
        const onChange = vi.fn((next) => { value = next; });
        const { rerender } = render(<CodeEditor ref={ref} value={value} onChange={onChange} />);
        const undo = screen.getByRole("button", { name: "Undo" });
        const redo = screen.getByRole("button", { name: "Redo" });
        expect(undo.disabled).toBe(true);

        ref.current.insertAtCursor("x();", value.indexOf("}"));
        rerender(<CodeEditor ref={ref} value={value} onChange={onChange} />);
        expect(value).toBe("function f() {\n  x();\n}\n");
        expect(undo.disabled).toBe(false);

        fireEvent.click(undo);
        rerender(<CodeEditor ref={ref} value={value} onChange={onChange} />);
        expect(value).toBe("function f() {\n}\n");
        expect(redo.disabled).toBe(false);

        fireEvent.click(redo);
        rerender(<CodeEditor ref={ref} value={value} onChange={onChange} />);
        expect(value).toBe("function f() {\n  x();\n}\n");
    });
});

import CodeBlock from "@/components/ui/codeBlock";
import { parseQuizText, splitInlineCode } from "@/lib/challenges/quizText";
import { cn } from "@/lib/utils";

function InlineText({ text }) {
    return splitInlineCode(text).map((part, i) => part.code
        ? <code key={i} className="rounded-sm border bg-muted px-1 py-px font-mono text-[0.85em]">{part.value}</code>
        : <span key={i}>{part.value}</span>);
}

/**
 * Quiz question, option or explanation text with its code kept readable.
 * `inline`: rendered inside a <button> (an option), so only phrasing elements are used and
 * fenced code is shown as monospace text instead of the lesson code block.
 */
export default function QuizText({ text, inline = false, className }) {
    const segments = parseQuizText(text);
    const Wrapper = inline ? "span" : "div";

    return (
        <Wrapper className={cn(inline ? "block space-y-1.5" : "space-y-2", className)}>
            {segments.map((segment, i) => {
                if (segment.kind === "code" && !inline) {
                    return (
                        <div key={i} className="lesson-prose">
                            <CodeBlock value={{ language: segment.lang || "text", code: segment.code }} />
                        </div>
                    );
                }
                if (segment.kind === "code" || segment.kind === "pre") {
                    return inline ? (
                        <span key={i} className="block overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre">{segment.code}</span>
                    ) : (
                        <pre key={i} className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs leading-relaxed font-normal">{segment.code}</pre>
                    );
                }
                const Text = inline ? "span" : "p";
                return (
                    <Text key={i} className={cn("block whitespace-pre-wrap", segment.strong && "font-medium")}>
                        <InlineText text={segment.text} />
                    </Text>
                );
            })}
        </Wrapper>
    );
}

import { readFileSync } from "node:fs";

// CodeDev tutor chat: long chats failed with "context_length_exceeded", and an earlier fix trimmed the
// oldest messages first, which removed the system prompt - and with it the rule "never give a full solution".
// Write fitContext(req): choose which messages to send so the request fits the model's context window.
//
//   budget = req.contextLimit - req.reservedOutputTokens   (tokens left for the input)
//
//   1. Always send the system prompt and the newest message (the last one in req.history).
//      If those two alone need more than the budget, return { error: "does_not_fit" }.
//   2. Then walk the older messages from newest to oldest and keep each one while the total still
//      fits (total <= budget). Stop at the first message that does not fit: it and every older message
//      are dropped, so the chat sent to the model never has a hole in the middle.
//   3. Never split a message: a message is sent whole or not at all.
//   4. Return { sent, dropped, inputTokens }:
//        sent        the system prompt id, then the kept messages' ids in chronological order (oldest first)
//        dropped     the dropped messages' ids in chronological order
//        inputTokens the sum of the tokens of everything sent
//
//   Invalid input returns { error: "invalid_input" } (check this before rule 1):
//     - contextLimit, reservedOutputTokens, system.tokens or any message's tokens is not a whole
//       number >= 0 (Number.isInteger);
//     - reservedOutputTokens >= contextLimit;
//     - history is empty, or its last message does not have role "user".
//
// Token counts are precomputed per message (they already include the message's formatting overhead).
// Do not change the types or the test runner.

type ChatMessage = { id: string; role: "user" | "assistant"; tokens: number };

type ContextRequest = {
    contextLimit: number; // the model's context window, in tokens
    reservedOutputTokens: number; // tokens kept free for the answer (the request's max output tokens)
    system: { id: string; tokens: number };
    history: ChatMessage[]; // oldest first; the last message is the learner's new question
};

type ContextPlan =
    | { sent: string[]; dropped: string[]; inputTokens: number }
    | { error: "invalid_input" | "does_not_fit" };

function fitContext(req: ContextRequest): ContextPlan {
    return { sent: [], dropped: [], inputTokens: 0 };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { requests: ContextRequest[] }. Output: the ContextPlan of each request, as JSON.
const { requests }: { requests: ContextRequest[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(requests.map((r) => fitContext(r))));

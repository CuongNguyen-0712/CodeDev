import { readFileSync } from "node:fs";

// CodeDev support agent: token, cost, time and tool budgets.
//
// One BudgetTracker serves the support agent for many sessions. The agent loop (in the test runner)
// asks it before every model call and before every tool call, and tells it what each call used.
// Write the tracker:
//
// startSession(userId, day)     a new session starts now (clock.now()). Per-session usage starts at 0;
//                               the daily spend of userId on that day (UTC "YYYY-MM-DD") carries over
//                               from earlier sessions.
// beforeModelCall(model, inputTokens)
//                               decide BEFORE the call, from an estimate, whether it may run. The output
//                               is not known yet, so estimate it as config.maxOutputTokens (the cap sent
//                               with every call: the real output never exceeds it):
//                                 estimated tokens = inputTokens + maxOutputTokens
//                                 estimated cost   = inputTokens * inputPerMTok + maxOutputTokens * outputPerMTok
//                               (prices are USD per million tokens, which is the same number as micro-USD
//                               per token, so every cost here is an integer number of micro-USD).
//                               Return the first limit the call could exceed, in this order, or null:
//                                 "unknown_model"  no price for this model: fail closed, do not guess
//                                 "max_tokens"     session tokens used + estimated tokens > session.maxTokens
//                                 "max_cost"       session cost + estimated cost > session.maxCostMicros
//                                 "daily_cost"     user's spend today + estimated cost > dailyCostMicrosPerUser
//                                 "max_wall_ms"    elapsed session time + modelCallMsEstimate > session.maxWallMs
//                               Reaching a limit exactly is allowed; only going over it is not.
// recordModelCall(model, usage) add the actual input and output tokens and their actual cost to the
//                               session and to the user's daily spend.
// beforeToolCall(tool)          "tool_calls:<tool>" when this call would make the session's calls of that
//                               tool exceed session.maxToolCalls[tool]; tools not listed are unlimited.
// recordToolCall(tool)          count the call.
// report()                      the current session: model calls, input and output tokens, cost, elapsed
//                               time on the clock, calls per tool (only tools that were called), and the
//                               remaining budgets - tokens, cost, time, today's spend for this user, and
//                               calls left for every tool listed in session.maxToolCalls. A remaining
//                               budget never goes below 0.
// Do not change the types, the clock or the test runner.

type Price = { inputPerMTok: number; outputPerMTok: number };
type Config = {
    prices: Record<string, Price>;
    maxOutputTokens: number;
    modelCallMsEstimate: number;
    session: { maxTokens: number; maxCostMicros: number; maxWallMs: number; maxToolCalls: Record<string, number> };
    dailyCostMicrosPerUser: number;
};
type Usage = { inputTokens: number; outputTokens: number };
type Report = {
    modelCalls: number;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    wallMs: number;
    toolCalls: Record<string, number>;
    remaining: { tokens: number; costMicros: number; wallMs: number; dailyCostMicros: number; toolCalls: Record<string, number> };
};
type Clock = { now(): number };

class BudgetTracker {
    private readonly daily = new Map<string, number>();
    private dayKey = "";
    private startedAt = 0;
    private modelCalls = 0;
    private inputTokens = 0;
    private outputTokens = 0;
    private costMicros = 0;
    private toolCalls: Record<string, number> = {};

    private readonly config: Config;
    private readonly clock: Clock;

    constructor(config: Config, clock: Clock) {
        this.config = config;
        this.clock = clock;
    }

    startSession(userId: string, day: string): void {
        this.dayKey = userId;
        this.startedAt = this.clock.now();
        this.modelCalls = 0;
        this.inputTokens = 0;
        this.outputTokens = 0;
        this.costMicros = 0;
        this.toolCalls = {};
    }

    beforeModelCall(model: string, inputTokens: number): string | null {
        const price = this.config.prices[model];
        if (!price) return "unknown_model";
        const { session, maxOutputTokens } = this.config;
        const tokens = inputTokens + maxOutputTokens;
        const cost = inputTokens * price.inputPerMTok + maxOutputTokens * price.outputPerMTok;
        if (this.inputTokens + this.outputTokens + tokens > session.maxTokens) return "max_tokens";
        if (this.costMicros + cost > session.maxCostMicros) return "max_cost";
        if (this.spentToday() + cost > this.config.dailyCostMicrosPerUser) return "daily_cost";
        if (this.elapsed() + this.config.modelCallMsEstimate > session.maxWallMs) return "max_wall_ms";
        return null;
    }

    recordModelCall(model: string, usage: Usage): void {
        const price = this.config.prices[model];
        const cost = usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok;
        this.modelCalls++;
        this.inputTokens += usage.inputTokens;
        this.outputTokens += usage.outputTokens;
        this.costMicros += cost;
        this.daily.set(this.dayKey, this.spentToday() + cost);
    }

    beforeToolCall(tool: string): string | null {
        const limit = this.config.session.maxToolCalls[tool];
        if (limit !== undefined && (this.toolCalls[tool] ?? 0) + 1 > limit) return `tool_calls:${tool}`;
        return null;
    }

    recordToolCall(tool: string): void {
        this.toolCalls[tool] = (this.toolCalls[tool] ?? 0) + 1;
    }

    report(): Report {
        const { session } = this.config;
        const left = (limit: number, used: number): number => Math.max(0, limit - used);
        const toolsLeft: Record<string, number> = {};
        for (const [tool, limit] of Object.entries(session.maxToolCalls)) toolsLeft[tool] = left(limit, this.toolCalls[tool] ?? 0);
        return {
            modelCalls: this.modelCalls,
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
            costMicros: this.costMicros,
            wallMs: this.elapsed(),
            toolCalls: { ...this.toolCalls },
            remaining: {
                tokens: left(session.maxTokens, this.inputTokens + this.outputTokens),
                costMicros: left(session.maxCostMicros, this.costMicros),
                wallMs: left(session.maxWallMs, this.elapsed()),
                dailyCostMicros: left(this.config.dailyCostMicrosPerUser, this.spentToday()),
                toolCalls: toolsLeft,
            },
        };
    }

    private spentToday(): number {
        return this.daily.get(this.dayKey) ?? 0;
    }

    private elapsed(): number {
        return this.clock.now() - this.startedAt;
    }
}

// ---------------------------------------------------------------- fake clock, fake model + test runner (do not change)
// Each scripted turn says which model the agent calls, how many input tokens the request has (known
// before the call), how many output tokens the model would like to write (the fake model stops at
// maxOutputTokens) and how long the call takes; then either a tool call (with its duration) or the
// final answer. All times are on a fake clock that starts at the session's start time.
type Turn = { model: string; input: number; output: number; ms: number; tool?: string; toolMs?: number; final?: boolean };
type Session = { id: string; user: string; start: string; turns: Turn[] };

let fakeNow = 0;
const clock: Clock = { now: () => fakeNow };

const input: { config: Config; sessions: Session[] } = JSON.parse(readFileSync(0, "utf8"));
const tracker = new BudgetTracker(input.config, clock);
const output = input.sessions.map((session) => {
    fakeNow = Date.parse(session.start);
    tracker.startSession(session.user, session.start.slice(0, 10));
    let stoppedBy: string | null = null;
    let answered = false;
    for (const turn of session.turns) {
        stoppedBy = tracker.beforeModelCall(turn.model, turn.input);
        if (stoppedBy) break;
        fakeNow += turn.ms;
        tracker.recordModelCall(turn.model, { inputTokens: turn.input, outputTokens: Math.min(turn.output, input.config.maxOutputTokens) });
        if (turn.final) {
            answered = true;
            break;
        }
        if (turn.tool) {
            stoppedBy = tracker.beforeToolCall(turn.tool);
            if (stoppedBy) break;
            fakeNow += turn.toolMs ?? 0;
            tracker.recordToolCall(turn.tool);
        }
    }
    return { session: session.id, user: session.user, answered, stoppedBy, ...tracker.report() };
});
console.log(JSON.stringify(output, null, 1));

import { readFileSync } from "node:fs";

// CodeDev course page incident: "use client" was put at the top of the page, so the chart library
// and the whole course page became client code. Plan the boundary per component instead.
//
// planBoundaries(root) walks the component tree depth-first (a parent before its children, children
// in the order given) and returns a BoundaryPlan:
//   runsOn     "client" when the component uses "state", "effect", "eventHandler" or "browserApi",
//              or when its parent runs on the client (everything a client component imports is
//              client code); otherwise "server".
//   useClient  the components whose file needs "use client": client components whose parent runs on
//              the server, and the root if it runs on the client. Nothing below a boundary gets it.
//   badProps   for each "use client" component except the root, every prop its server parent passes
//              that cannot cross the boundary, as "<Component>.<prop> (<kind>)", in prop order.
//              Can cross: "string", "number", "boolean", "null", "array", "plainObject", "date"
//              (React 19 serializes Date), "jsx" (rendered elements, e.g. children) and "serverAction".
//              Cannot cross: "function", "classInstance", and any kind not listed above.
//              Props between two client components are never reported.
//   conflicts  client components that use "secret" or "database" (that code would ship to the browser).
//   clientKb   the sum of ownKb + libKb of every client component, rounded to 1 decimal.
// Invalid input: a missing uses, props or children means empty; a missing ownKb or libKb, or one that
// is not a finite number >= 0, counts as 0. Features other than the six above are ignored.
//
// Do not change the types or the test runner.

type Feature = "state" | "effect" | "eventHandler" | "browserApi" | "secret" | "database";

type PropKind =
    | "string" | "number" | "boolean" | "null" | "array" | "plainObject" | "date" | "jsx"
    | "serverAction" | "function" | "classInstance";

type ComponentNode = {
    name: string;
    uses?: Feature[];
    ownKb?: number; // the component's own code, gzipped
    libKb?: number; // a heavy library it imports (a chart library, an editor...), gzipped
    props?: Record<string, PropKind>; // props its parent passes to it
    children?: ComponentNode[]; // components it imports and renders
};

type BoundaryPlan = {
    components: { name: string; runsOn: "server" | "client" }[];
    useClient: string[];
    badProps: string[];
    conflicts: string[];
    clientKb: number;
};

const CLIENT_FEATURES: Feature[] = ["state", "effect", "eventHandler", "browserApi"];
const SERVER_ONLY_FEATURES: Feature[] = ["secret", "database"];
const CAN_CROSS: string[] = ["string", "number", "boolean", "null", "array", "plainObject", "date", "jsx", "serverAction"];

function kb(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function planBoundaries(root: ComponentNode): BoundaryPlan {
    const plan: BoundaryPlan = { components: [], useClient: [], badProps: [], conflicts: [], clientKb: 0 };
    let total = 0;

    function visit(node: ComponentNode, parentOnClient: boolean | null): void {
        const uses = node.uses ?? [];
        const onClient = parentOnClient === true || uses.some((f) => CLIENT_FEATURES.includes(f));
        plan.components.push({ name: node.name, runsOn: onClient ? "client" : "server" });
        if (onClient) {
            total += kb(node.ownKb) + kb(node.libKb);
            if (true) {
                plan.useClient.push(node.name);
                if (parentOnClient === false) {
                    for (const [prop, kind] of Object.entries(node.props ?? {})) {
                        if (!CAN_CROSS.includes(kind)) plan.badProps.push(`${node.name}.${prop} (${kind})`);
                    }
                }
            }
            if (uses.some((f) => SERVER_ONLY_FEATURES.includes(f))) plan.conflicts.push(node.name);
        }
        for (const child of node.children ?? []) visit(child, onClient);
    }

    visit(root, null);
    plan.clientKb = Math.round(total * 10) / 10;
    return plan;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: the root of a component tree. Output: the boundary plan.
const root: ComponentNode = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(planBoundaries(root)));

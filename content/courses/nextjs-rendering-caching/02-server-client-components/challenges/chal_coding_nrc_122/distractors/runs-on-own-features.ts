// @piece runs-on: Decide where this component runs
const uses = node.uses ?? [];
const onClient = uses.some((f) => CLIENT_FEATURES.includes(f));
plan.components.push({ name: node.name, runsOn: onClient ? "client" : "server" });

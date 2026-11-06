// @piece yield-over-budget: Give the main thread back once the slice used its budget
if (env.now() - sliceStart >= env.budgetMs) {
    await env.yield();
}

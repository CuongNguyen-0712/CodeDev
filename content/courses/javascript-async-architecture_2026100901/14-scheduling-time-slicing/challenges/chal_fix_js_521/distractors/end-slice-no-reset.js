// @piece end-slice: Hand the main thread back once the budget is spent
if (remaining > 0 && host.now() - sliceStart >= budgetMs) {
  await host.yieldToMain();
}

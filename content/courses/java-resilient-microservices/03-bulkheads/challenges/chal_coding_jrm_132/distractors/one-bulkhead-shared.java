// @piece one-bulkhead-each: Which bulkhead guards a dependency
return bulkheads.computeIfAbsent("http-client", d -> new Bulkhead(limits.get(dependency)));

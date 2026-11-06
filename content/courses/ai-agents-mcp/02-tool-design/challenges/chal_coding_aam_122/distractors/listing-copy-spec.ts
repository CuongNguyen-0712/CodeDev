// @piece listing: The tools as the model receives them
return [...registry.values()].map((spec) => {
    const properties: Record<string, Record<string, unknown>> = {};
    for (const [p, s] of Object.entries(spec.parameters.properties)) {
        properties[p] = { ...s };
    }
    return {
        name: spec.name,
        description: (spec.description ?? "").trim(),
        parameters: { type: "object", properties, required: [...spec.parameters.required], additionalProperties: false },
    };
});

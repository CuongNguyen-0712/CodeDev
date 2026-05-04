export const validate = (schema, data) => {
    const result = schema.safeParse(data);

    if (result.success) return { success: true };

    return {
        success: false,
        errors: result.error.flatten().fieldErrors
    };
};
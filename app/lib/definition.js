export function SignInDefinition({ name, pass }) {
    const error = {};
    if (!name?.trim()) error.name = 'Username is required';
    if (!pass) error.pass = 'Password is required';
    else if (pass.length < 8) error.pass = 'Password must be at least 8 characters';

    return Object.keys(error).length > 0 ? { success: false, error } : { success: true };
}

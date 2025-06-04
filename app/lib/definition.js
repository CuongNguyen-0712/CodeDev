export function SignInDefinition(data) {
    const { name, pass } = data

    const error = {}

    if (!name || name.length === 0) {
        error.name = 'Username is required'
    }

    if (!pass || pass.length === 0) {
        error.pass = 'Password is required'
    }
    else {
        if (pass.length < 8) {
            error.pass = 'Password must be at least 8 characters'
        }
    }

    return Object.keys(error).length > 0 ? { success: false, error } : { success: true }
}
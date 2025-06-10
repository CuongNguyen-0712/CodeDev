export function SignInDefinition({ name, pass }) {
    const errors = {};
    if (!name?.trim()) errors.name = 'Username is required';
    if (!pass) errors.pass = 'Password is required';
    else if (pass.length < 8) errors.pass = 'Password must be at least 8 characters';

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true };
}

export function SignUpDefinition(data) {
    const errors = {};
    const { surname, name, email, phone, username, password, re_password, agree } = data;

    if (surname.trim().length === 0) {
        errors.surname = 'Surname is required';
    }

    if (name.trim().length === 0) {
        errors.name = 'Name is required';
    }

    if (email.trim().length === 0) {
        errors.email = 'Email is required';
    }
    else if (!email.includes('@') || !email.includes('.com')) {
        errors.email = 'Email must be contains @ and .com';
    }

    if (phone.trim().length === 0) {
        errors.phone = 'Phone is required';
    }
    else if (phone.trim().length !== 10) {
        errors.phone = 'Phone must be 10 digits';
    }
    else if (!(/^-?\d+$/.test(phone.trim()))) {
        errors.phone = 'Phone must be number';
    }

    if (username.trim().length === 0) {
        errors.username = 'Username is required';
    }

    if (password.trim().length === 0) {
        errors.password = 'Password is required';
    }
    else if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
    }

    if (re_password.trim().length === 0) {
        errors.re_password = 'Re-password is required';
    }
    else if (re_password !== password) {
        errors.re_password = 'Re-password must be same with password';
    }

    if (!agree) errors.agree = 'You must agree to the terms and conditions'

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true };
}

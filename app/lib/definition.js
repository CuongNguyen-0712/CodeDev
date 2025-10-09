export function SignInDefinition(data) {
    const errors = {};
    if (!data?.name?.trim()) errors.name = 'Username is required';
    if (!data?.pass) errors.pass = 'Password is required';
    else if (data?.pass?.length < 8) errors.pass = 'Must be at least 8 characters';

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true };
}

export function SignUpDefinition(data) {
    const errors = {};
    const { surname, name, email, phone, username, password, re_password, agree } = data;

    if (surname?.trim().length === 0) {
        errors.surname = 'Surname is required';
    }

    if (name?.trim().length === 0) {
        errors.name = 'Name is required';
    }

    if (email?.trim().length === 0) {
        errors.email = 'Email is required';
    }
    else if (!email?.includes('@') || !email?.includes('.com')) {
        errors.email = 'Email must be contains @ and .com';
    }

    if (phone?.trim().length === 0) {
        errors.phone = 'Phone is required';
    }
    else if (phone?.trim().length !== 10) {
        errors.phone = 'Phone must be 10 digits';
    }
    else if (!(/^-?\d+$/.test(phone?.trim()))) {
        errors.phone = 'Phone must be number';
    }

    if (username?.trim().length === 0) {
        errors.username = 'Username is required';
    }

    if (password?.trim().length === 0) {
        errors.password = 'Password is required';
    }
    else if (password?.length < 8) {
        errors.password = 'Must be at least 8 characters';
    }

    if (re_password?.trim().length === 0) {
        errors.re_password = 'Re-password is required';
    }
    else if (re_password !== password) {
        errors.re_password = 'Re-password must be same with password';
    }

    if (!agree) errors.agree = true;

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true };
}

export function CreateTeamDefinition(data) {
    const errors = {}
    const { name, size } = data

    if (!name || name.trim().length === 0) {
        errors.name = 'Name is required'
    }

    if (!size) {
        errors.size = 'Size is required'
    }
    else if (!Number.isInteger(Number(size))) {
        errors.size = 'Size must be number'
    }
    else if (size <= 0 || size > 10) {
        errors.size = 'Size must be between 1 and 10'
    }

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true }
}

export function FeedbackDefinition(data) {
    const errors = {};
    const { title, feedback, email } = data;

    if (!title || title.trim().length === 0) {
        errors.title = 'Title is required';
    }

    if (!feedback || feedback.trim().length === 0) {
        errors.feedback = 'Feedback is required';
    }

    if (!email || email.trim().length === 0) {
        errors.email = 'Email is required';
    }
    else if (!email.includes('@') || !email.includes('.')) {
        errors.email = 'Email must be contains @ and .';
    }
    else if (!email.endsWith('.com')) {
        errors.email = 'Email must contain .com';
    }

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true };
}

export function UpdateInfoDefinition({ data, dataUpdate }) {
    const errors = {};

    if ((dataUpdate.surname ?? '').trim().length === 0) errors.surname = 'Surname is required';
    else if ((data.surname.trim() === (dataUpdate.surname ?? '').trim())) errors.surname = 'No change in surname';

    if ((dataUpdate.name ?? '').trim().length === 0) errors.name = 'Name is required';
    else if (data.name.trim() === (dataUpdate.name ?? '').trim()) errors.name = 'No change in name';

    if ((dataUpdate.email ?? '').trim().length === 0) errors.email = 'Email is required';
    else if (dataUpdate.email && (!dataUpdate.email?.includes('@') || !dataUpdate.email?.includes('.com'))) errors.email = 'Email must be contains @ and .com';
    else if (data.email.trim() === (dataUpdate.email ?? '').trim()) errors.email = 'No change in email';

    if ((dataUpdate.phone ?? '').trim().length === 0) errors.phone = 'Phone is required';
    else if ((dataUpdate.phone ?? '').trim().length !== 10) errors.phone = 'Phone must be 10 digits';
    else if (!(/^-?\d+$/.test((dataUpdate.phone ?? '').trim()))) errors.phone = 'Phone must be number';
    else if (data.phone.trim() === (dataUpdate.phone ?? '').trim()) errors.phone = 'No change in phone';

    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true };
}
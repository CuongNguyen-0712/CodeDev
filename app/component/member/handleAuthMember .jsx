import { useState } from "react"

import { IoClose } from "react-icons/io5";

export default function AuthMember({handleAccess, handleDeline, code}) {

    const [value, setValue] = useState('');

    const handleAuthValue = (e) => {
        e.preventDefault();
        const value = e.target.value;

        const validValue = value.replace(/[^0-9]/g, '');

        if (validValue.length < 4) {
            setValue(validValue);
        }
        else if (validValue === code) {
            setValue('');
            handleAccess();
        }
        else {
            setValue('');
        }
    }

    const handleCancel = (e) => {
        e.preventDefault();
        setValue('');
        handleDeline();
    }

    return (
        <form id="auth-form">
            <span>Enter password to continue:</span>
            <input
                type="password"
                value={value}
                autoFocus
                autoComplete="current-code"
                onChange={handleAuthValue}
            />
            <button onClick={handleCancel}>
                <IoClose />
            </button>
        </form>
    )
}
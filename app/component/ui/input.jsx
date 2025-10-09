import { useState } from "react";

import { IoIosCloseCircle } from "react-icons/io";
import { VscEye, VscEyeClosed } from "react-icons/vsc";

export function InputGroup({ name, label, type, value, onChange, error, icon, reset, read, tabIndex = 0, isPassword = false }) {

    const [shown, setShown] = useState(false);
    const handleClear = () => {
        reset(name);
    }

    return (
        <div className={`field-input ${value ? 'has-content' : ''}`}>
            <input
                type={shown ? 'text' : type}
                name={name}
                value={value}
                onChange={onChange}
                autoComplete="off"
                readOnly={read}
                tabIndex={tabIndex}
            />
            <label htmlFor={name}>{label}</label>
            {icon}
            <IoIosCloseCircle
                className='clear'
                color="var(--color_gray)"
                fontSize={18}
                onClick={handleClear}
            />
            {
                error &&
                <p>{error}</p>
            }
            {
                isPassword &&
                <button
                    type='button'
                    className="eye_password"
                    onClick={() => setShown(!shown)}
                >
                    {
                        shown ?
                            <VscEyeClosed fontSize={16} color="var(--color_black)" />
                            :
                            <VscEye fontSize={16} color="var(--color_blue)" />
                    }
                </button>
            }
        </div>
    )
}
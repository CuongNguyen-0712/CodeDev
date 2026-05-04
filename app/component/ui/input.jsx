import { useState } from "react";

import { IoMdCloseCircle } from "react-icons/io";
import { IoIosCloseCircle } from "react-icons/io";
import { VscEye, VscEyeClosed } from "react-icons/vsc";
import { BsTextareaResize } from "react-icons/bs";

export function InputGroup({ name, label, type, value, onChange, error, icon, reset, read, tabIndex = 0, isPassword = false, inputMode }) {

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
                inputMode={inputMode}
                autoComplete="off"
                readOnly={read}
                tabIndex={tabIndex}
            />
            <label htmlFor={name}>{label}</label>
            {icon}
            {
                !read &&
                <button
                    type="button"
                    className='clear'
                    tabIndex={-1}
                    onClick={handleClear}
                >
                    <IoIosCloseCircle
                        color="var(--color_gray)"
                        fontSize={18}
                    />
                </button>
            }
            {
                error &&
                <p>
                    <IoMdCloseCircle fontSize={16} />
                    {error}
                </p>
            }
            {
                isPassword &&
                <button
                    type='button'
                    className="eye_password"
                    onClick={() => setShown(!shown)}
                    tabIndex={1}
                >
                    {
                        shown ?
                            <VscEyeClosed fontSize={16} color="var(--color_black)" />
                            :
                            <VscEye fontSize={16} color="var(--color_primary)" />
                    }
                </button>
            }
        </div>
    )
}

export function TextAreaGroup({ label, name, value, onChange, rows = 2, cols, error }) {
    return (
        <div className={`area_input ${value ? 'has-content' : ''}`}>
            <label htmlFor={name}>
                <BsTextareaResize fontSize={16} className="label_icon" />
                {label}
            </label>
            <textarea
                cols={cols}
                rows={rows}
                name={name}
                value={value}
                onChange={onChange}
            />
            {
                error &&
                <p>
                    <IoMdCloseCircle fontSize={16} />
                    {error}
                </p>
            }
        </div>
    )
}
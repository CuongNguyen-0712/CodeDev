import React from "react";

const CreateMember = ({ id, code, name, gender, phone, email }) => {

    return (
        <>
            <h2 className="member-number">Member {id}</h2>

            <li className="member-info">
                Mã sinh viên: {code}<br />
                Tên: {name}<br />
                Giới tính: {gender}<br />
                Số điện thoại: {phone}<br />
                Email: {email}<br />
            </li>
        </>
    )
}

export default CreateMember;
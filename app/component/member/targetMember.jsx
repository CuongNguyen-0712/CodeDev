import { useState } from "react";

import { FaLinkedinIn, FaFacebookF, FaInstagram, FaTiktok } from "react-icons/fa6";
import { IoIosHeart, IoMdStar, IoMdClose, IoIosMore, IoIosClose } from "react-icons/io";

export default function TargetMember({ member, handle, handleFavor, handleRating, setFavor, setRating }) {

    const [change, setChange] = useState(false);
    const [comment, setComment] = useState('');

    return (
        <>
            <div className="heading-target">
                <div className="heading-container">
                    <div className="header">
                        {
                            !change ?
                                <img src={member.avatar} alt="Cần thêm ảnh" />
                                :
                                <div className="link">
                                    <span>
                                        <a target="_blank" href={member.facebook}>
                                            <FaFacebookF />
                                        </a>
                                    </span>
                                    <span>
                                        <a target="_blank" href={member.instagram}>
                                            <FaInstagram />
                                        </a>
                                    </span>
                                    <span>
                                        <a target="_blank" href={member.tiktok}>
                                            <FaTiktok />
                                        </a>
                                    </span>
                                    <span>
                                        <a target="_blank" href={member.linkedln}>
                                            <FaLinkedinIn />
                                        </a>
                                    </span>
                                </div>
                        }
                    </div>
                    <ul className="options">
                        <li onClick={() => handleFavor(member.id)} className={`${setFavor.filter((item) => item === member.id).length > 0 ? "active" : ""}`} >
                            <IoIosHeart />
                        </li>
                        <li onClick={() => handleRating(member.id)} className={`${setRating.filter((item) => item === member.id).length > 0 ? "active" : ""}`}>
                            <IoMdStar />
                        </li>
                        <li onClick={() => setChange(!change)} className={`${change ? "active" : ""}`}>
                            {change ? <IoIosClose /> : <IoIosMore />}
                        </li>
                    </ul>
                </div>
            </div>
            <div className="container-info">
                <span className="bio">
                    {member.bio ? member.bio : "No bio"}
                </span>
                <ul>
                    <li>
                        <span>ID: </span>
                        {member.code}
                    </li>
                    <li>
                        <span>Name: </span>
                        {member.name}
                    </li>
                    <li>
                        <span>Gender: </span>
                        {member.gender}
                    </li>
                    <li>
                        <span>Phone: </span>
                        {member.phone}
                    </li>
                    <li>
                        <span>Email: </span>
                        {member.email}
                    </li>
                </ul>
            </div>
            <div className="comment-frame">
                <div className="comment-show">

                </div>
                <div className="frame-input">
                    <input
                        type="text"
                        value={comment}
                        name="new-comment"
                        autoFocus
                        placeholder="Throw new comment..."
                        className="comment-input"
                        onChange={(e) => setComment(e.target.value)}
                    />
                    {
                        comment ?
                            <span onClick={() => setComment('')}>
                                <IoIosClose />
                            </span>
                            :
                            null
                    }
                </div>
            </div>
            <button className="untarget" onClick={handle}>
                <IoMdClose />
            </button>
        </>
    )
}
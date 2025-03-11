import { useEffect } from "react";

import CustomLink from "./customLink";

import { FaCaretDown, FaFacebookF, FaInstagramSquare, FaTiktok } from "react-icons/fa";
import { IoPersonAddSharp } from "react-icons/io5";
import { IoChatbubbleEllipsesSharp } from "react-icons/io5";

export default function TargetMember({ target, handle, targetMember }) {

    const { code, name, gender, phone, email, bio, facebook, instagram, tiktok } = targetMember;

    useEffect(() => {
        if (!target) {
            handle();
        }
    }, [targetMember])

    return (
        <div className={`target-container ${target ? 'target' : ''}`}>
            <div className="target-heading">
                <div className="handle-interact">
                    <span>
                        <IoPersonAddSharp />
                    </span>
                    <span>
                        <IoChatbubbleEllipsesSharp />
                    </span>
                </div>
                <p>
                    ID: {code}
                </p>
                <span onClick={() => handle()}>
                    <FaCaretDown />
                </span>
            </div>
            <div className="target-content">
                <div className="target-info">
                    <div className="heading-target">
                        <h3>Basic infomation</h3>
                        <div className="info-frame">
                            <div className="info">
                                <h4>Name</h4>
                                <span>{name}</span>
                            </div>
                            <div className="info">
                                <h4>Gender</h4>
                                <span>{gender}</span>
                            </div>
                        </div>
                    </div>
                    <div className="info-contact">
                        <h3>Contact information</h3>
                        <div className="info-frame">
                            <div className="info">
                                <h4>Phone</h4>
                                <span>{phone ? phone : "Nothing"}</span>
                            </div>
                            <div className="info">
                                <h4>Email</h4>
                                <span>{email ? email : "Nothing"}</span>
                              </div>
                        </div>
                    </div>
                    <div className="target-bio">
                        <h3>Introduction</h3>
                        <p>{bio ? bio : "Nothing"}</p>
                    </div>
                </div>
                <div className="social-link">
                    <CustomLink href={facebook} children={<FaFacebookF />} />
                    <CustomLink href={instagram} children={<FaInstagramSquare />} />
                    <CustomLink href={tiktok} children={<FaTiktok />} />
                </div>
            </div>
        </div>
    )
}
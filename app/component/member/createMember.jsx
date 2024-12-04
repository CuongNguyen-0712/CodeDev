import { useState, useEffect } from "react";

import Image from "next/image";

import { IoSettingsSharp } from "react-icons/io5";
import { FaFilter, FaUserFriends } from "react-icons/fa";
import { IoMdStar } from "react-icons/io";

import axios from "axios";
export default function CreateMember({ handle, targetMember }) {

    const [member, setMember] = useState({
        defaultMember: [],
        filterMember: [],
    })

    const fecthDataMember = async () => {
        try {
            const res = await axios.get('/data/memberList.json');
            const data = res.data;
            setMember({
                defaultMember: data,
                filterMember: data
            })
        } catch (error) {
            console.log(error)
        }
    }

    useEffect(() => {
        fecthDataMember();
    }, [])

    return (
        <>
            <div className="member-heading">
                <div className="member-intro">
                    <h1>Welcome CuongCoder</h1>
                    <span>Connect with other member and make new friends</span>
                </div>
                <div className="member-feature">
                    <span>
                        <FaUserFriends />
                    </span>
                    <span onClick={() => handle()}>
                        <FaFilter />
                    </span>
                    <span>
                        <IoSettingsSharp />
                    </span>
                </div>
            </div>
            <div className="members">
                <div className="member-container">
                    {member.defaultMember.map((mem, index) => (
                        <ul key={index} className="member">
                            <div className="base-info">
                                <div className="avatar">
                                    <Image src={`/public/`} alt='' width={80} height={80} />
                                </div>
                                <div className="base-main">
                                    <span>{mem.code}</span>
                                    <span>{mem.name}</span>
                                    <span>{mem.rating} <IoMdStar style={{ color: 'yellow' }} /></span>
                                    <span>Following: ...</span>
                                    <span>Follower: ...</span>
                                </div>
                            </div>
                            <div className="handleMember">
                                <button onClick={() => targetMember(mem)}>
                                    Detail
                                </button>
                            </div>
                        </ul>
                    ))}
                </div>
            </div>
        </>
    )
}
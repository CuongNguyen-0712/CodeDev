import { FaFilter, FaUserFriends } from "react-icons/fa";
import { IoSettingsSharp } from "react-icons/io5";

export default function CreateMember({ handle }) {
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
                </div>
            </div>
        </>
    )
}
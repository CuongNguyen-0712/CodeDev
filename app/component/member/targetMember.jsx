import { FaCaretDown } from "react-icons/fa";
import { IoPersonAddSharp } from "react-icons/io5";
import { IoChatbubbleEllipsesSharp } from "react-icons/io5";

export default function TargetMember({ target, handle }) {
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
                    ID: 
                </p>
                <span onClick={() => handle()}>
                    <FaCaretDown />
                </span>
            </div>
            <div className="target-content">

            </div>
        </div>
    )
}
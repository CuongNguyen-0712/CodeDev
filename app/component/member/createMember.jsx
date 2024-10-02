import { RiAccountPinBoxFill } from "react-icons/ri";

export default function CreateMember({ handle, target, members}) {


    return (
        <div className = "container-member">
            {members.map((member) => (
                <div className={`member ${member.id === target ? "target" : ""}`} key={member.id} onClick={() => handle(member)}>
                    <span>
                        <RiAccountPinBoxFill />
                    </span>
                    <ul>
                        <li>{member.code}</li>
                        <li>{member.name}</li>
                    </ul>
                </div>
            ))}
        </div>
    )
}
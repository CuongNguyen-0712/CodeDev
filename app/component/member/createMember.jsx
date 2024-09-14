import { MdNumbers, MdDriveFileRenameOutline, MdTransgender } from "react-icons/md";
import { FaUserLock } from "react-icons/fa";

const CreateMember = ({ id, code, name, gender, handle, isSecret, secretCode }) => {
    const handleSetTarget = () => {
        handle(id, secretCode);
    }

    return (
        <>
            <div className="info-heading">
                <img src="" />
                {
                    !isSecret &&
                    <button className="show-more" onClick={handleSetTarget}>
                        <FaUserLock />
                    </button>
                }
            </div>
            <ul className="info">
                <li>
                    <i><MdNumbers /></i>
                    <span>{code}</span>
                </li>
                <li>
                    <i><MdDriveFileRenameOutline /></i>
                    <span>{name}</span>
                </li>
                <li>
                    <i><MdTransgender /></i>
                    <span>{gender}</span>
                </li>
            </ul>
        </>
    )
}

export default CreateMember;
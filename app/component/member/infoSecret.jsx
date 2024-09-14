import { FaSquarePhone } from "react-icons/fa6";
import { MdEmail } from "react-icons/md";
import { FaFacebookF, FaTiktok } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";

export default function CustomInfoSecret({ infoSecret }) {
    const { email, phone, facebook, instagram, tiktok } = infoSecret;

    return (
        <>
            <div className="secret-wrapper">
                <ul className="info-secret">
                    <li>
                        <i><MdEmail /></i>
                        <span>{email}</span>
                    </li>
                    <li>
                        <i><FaSquarePhone /></i>
                        <span>{phone}</span>
                    </li>
                </ul>
                <ul className="linkln">
                    <li>
                        <a href={facebook} target="_blank" rel="noopener noreferrer">
                            <FaFacebookF />
                        </a>
                    </li>
                    <li>
                        <a href={instagram} target="_blank" rel="noopener noreferrer">
                            <RiInstagramFill />
                        </a>
                    </li>
                    <li>
                        <a href={tiktok} target="_blank" rel="noopener noreferrer">
                            <FaTiktok />
                        </a>
                    </li>
                </ul>
            </div>
        </>
    )
}
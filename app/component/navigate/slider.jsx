import Link from "next/link"

import { useRouterActions } from "@/app/router/useRouterActions"

import { usePathname } from "next/navigation";

import { FaHome } from "react-icons/fa";
import { CgProfile } from "react-icons/cg";
import { IoMdSettings } from "react-icons/io";
import { MdHelpCenter } from "react-icons/md";

export default function Slider() {
    const { navigate } = useRouterActions()
    const pathname = usePathname()

    return (
        <section id="slider">
            <button
                className="return_btn"
                onClick={() => navigate({ path: 'home' })}
            >
                <FaHome fontSize={16} />
                <span>
                    Back to home
                </span>
            </button>
            <div className="menu_scroll">
                <div className="menu_btns">
                    <Link
                        className={`menu_btn ${pathname === "/profile" ? "active" : ""}`}
                        href="/profile"
                    >
                        <CgProfile fontSize={16} />
                        Profile
                    </Link>
                    <Link
                        className={`menu_btn ${pathname === "/settings" ? "active" : ""}`}
                        href="/settings"
                    >
                        <IoMdSettings fontSize={16} />
                        Settings
                    </Link>
                    <Link
                        className={`menu_btn ${pathname === "/help" ? "active" : ""}`}
                        href="/help"
                    >
                        <MdHelpCenter fontSize={16} />
                        Help
                    </Link>
                </div>
            </div>
        </section>
    )
}
'use client';

import Link from "next/link";
import { useRouterActions } from "@/router/useRouterActions";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { FaHome, FaStar } from "react-icons/fa";
import { CgProfile } from "react-icons/cg";
import { IoMdSettings } from "react-icons/io";
import { MdHelpCenter } from "react-icons/md";

import "@/styles/slider.css";

const links = [
    {
        label: 'Profile',
        icon: <CgProfile />,
        link: '/profile'
    },
    {
        label: 'Settings',
        icon: <IoMdSettings />,
        link: '/settings'
    },
    {
        label: 'Help Center',
        icon: <MdHelpCenter />,
        link: '/help'
    }
]

export default function Slider() {
    const { navigate } = useRouterActions();
    const pathname = usePathname();
    const { data: session } = useSession();

    const user = session?.user || {
        name: "Alex Rivera",
        email: "alex.rivera@codedev.io",
        image: "/image/static/no_image.png",
        role: "Fullstack Engineer"
    };

    return (
        <aside id="slider">
            <div className="slider_brand">
                <img
                    src={'/image/static/logo.svg'}
                    alt="CodeDev"
                    height={30}
                    width={30}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/image/static/no_image.png";
                    }}
                />
                <Link href="/home" className="brand_name">
                    CodeDev
                </Link>
            </div>

            {/* TOP USER MINI-CARD */}
            <div className="slider_user_card">
                <div className="avatar_container">
                    <img
                        src={user.image || "/image/static/no_image.png"}
                        alt={user.name || "User Avatar"}
                        className="avatar_img"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "/image/static/no_image.png";
                        }}
                    />
                    <div className="avatar_badge">
                        <span>4.9</span>
                        <FaStar fontSize={9} />
                    </div>
                </div>
                <h4>{user.name || "Developer"}</h4>
                <p>{user.role || "Software Engineer"}</p>
            </div>

            {/* NAVIGATION MENU */}
            <div className="menu_scroll">
                <div className="menu_btns">
                    <button
                        type="button"
                        className="return_btn"
                        onClick={() => navigate({ path: "home" })}
                    >
                        <FaHome fontSize={16} />
                        <span>Home</span>
                    </button>

                    {links.map((item, index) => (
                        <Link
                            key={index}
                            className={`menu_btn ${pathname === item.link ? 'active' : ''}`}
                            href={item.link}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* BOTTOM PROMO / MEMBERSHIP WIDGET */}
            <div className="slider_bottom_widget">
                <h4>20 Days Left</h4>
                <p>Extend your pro membership & access all master roadmaps.</p>
                <button
                    type="button"
                    className="widget_action_btn"
                    onClick={() => navigate({ path: "course" })}
                >
                    Check Now
                </button>
            </div>
        </aside>
    );
}
import { useState, useEffect, cloneElement } from "react"
import { useSearchParams, usePathname } from "next/navigation"

import Navbar from "../home/navbar"
import Feedback from "../home/feedback"
import Manage from "../home/manage"
import Search from "../home/search"

import { useRouterActions } from "@/app/router/router";
import { LoadingRedirect } from "../ui/loading"

import { MdOutlineRoute, MdHome, MdClose } from "react-icons/md";
import { FaCode } from "react-icons/fa6";
import { VscProject } from "react-icons/vsc";

export default function Layout({ children }) {
    const params = useSearchParams();
    const path = usePathname();

    const { navigateToHome, navigateToCourse, navigateToProject } = useRouterActions();

    const [state, setState] = useState({
        redirect: false,
        overlay: false,
    })

    const navigationList = [
        {
            path: '/home',
            icon: <MdHome />,
            navigate: navigateToHome
        },
        {
            path: '/course',
            icon: <FaCode />,
            navigate: navigateToCourse
        },
        {
            path: '/project',
            icon: <VscProject />,
            navigate: navigateToProject
        }
    ]

    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        const overlayParams = ['manage', 'feedback', 'search'];
        const isOverlay = overlayParams.some(key => params.get(key));

        setState((prev) => ({
            ...prev,
            overlay: isOverlay,
        }));

        document.body.style.overflow = isOverlay ? 'hidden' : 'unset'
    }, [params]);

    const handleNavigate = ({ navigate }) => {
        setState(prev => ({ ...prev, redirect: true, overlay: false }));
        navigate();
    }

    return (
        <main id="home" className={state.overlay ? 'overlay' : ''}>
            {state.redirect ?
                <LoadingRedirect />
                :
                <>
                    <div id="header">
                        <Navbar handleOverlay={() => setState(prev => ({ ...prev, overlay: !prev.overlay }))} />
                    </div>
                    <div id="container">
                        {cloneElement(children, { redirect: () => setState(prev => ({ ...prev, redirect: true })) })}
                    </div>
                    {
                        params.get('feedback') &&
                        <div className="feedback_container">
                            <Feedback />
                        </div>
                    }
                    {
                        params.get('manage') &&
                        <div className="manage_container">
                            <Manage redirect={() => setState(prev => ({ ...prev, overlay: false, redirect: true }))} />
                        </div>
                    }
                    {
                        params.get('search') &&
                        <div className="search_container">
                            <Search redirect={() => setState(prev => ({ ...prev, overlay: false, redirect: true }))} />
                        </div>
                    }
                    <div id="navigate_handler" style={hidden ? { height: '40px' } : { height: `${navigationList.filter((item) => item.path !== path).length * 50 + 40}px` }}>
                        {
                            navigationList.filter((item) => item.path !== path).map((item, index) => (
                                <button key={index} onClick={() => handleNavigate({ navigate: item.navigate })} className={hidden ? 'hidden' : ''}>
                                    {item.icon}
                                </button>
                            ))
                        }
                        <button id="handler" onClick={() => setHidden(!hidden)}>
                            {hidden ? <MdOutlineRoute /> : <MdClose />}
                        </button>
                    </div>
                </>
            }
        </main >
    )
}
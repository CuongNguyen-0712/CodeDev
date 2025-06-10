import { useState, useEffect, cloneElement } from "react"
import { useSearchParams } from "next/navigation"

import { LoadingRedirect } from "./loading";
import Navbar from "../home/navbar"
import Feedback from "../home/feedback"
import Manage from "../home/manage"
import { useRouterActions } from "@/app/router/router";

import { MdOutlineRoute, MdHome, MdClose } from "react-icons/md";
import { FaCode } from "react-icons/fa6";

export default function Layout({ children }) {
    const params = useSearchParams();

    const { navigateToHome, navigateToCourse } = useRouterActions();

    const [state, setState] = useState({
        redirect: false,
        overlay: false,
    })

    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        document.body.style.overflow = (params.get('manage') || params.get('feedback')) ? 'hidden' : 'auto';
        setState((prev) => ({ ...prev, overlay: (params.get('manage') || params.get('feedback')) }))
    }, [params])

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
                        <Navbar onHome={true} handleOverlay={() => setState(prev => ({ ...prev, overlay: !prev.overlay }))} />
                    </div>
                    <div id="container">
                        {cloneElement(children, { redirect: () => setState(prev => ({ ...prev, redirect: true })) })}
                    </div>
                    {
                        params.get('feedback') &&
                        <div className="feedback-container">
                            <Feedback />
                        </div>
                    }
                    {
                        params.get('manage') &&
                        <div className="manage-container">
                            <Manage redirect={() => setState(prev => ({ ...prev, overlay: false, redirect: true }))} />
                        </div>
                    }
                    <div id="navigate_handler" style={hidden ? { height: '40px' } : { height: '140px' }}>
                        <button onClick={() => handleNavigate({ navigate: navigateToHome })} className={hidden ? 'hidden' : ''}>
                            <MdHome />
                        </button>
                        <button onClick={() => handleNavigate({ navigate: navigateToCourse })} className={hidden ? 'hidden' : ''}>
                            <FaCode />
                        </button>
                        <button id="handler" onClick={() => setHidden(!hidden)}>
                            {hidden ? <MdOutlineRoute /> : <MdClose />}
                        </button>
                    </div>
                </>
            }
        </main >
    )
}
import { useState, useEffect, cloneElement } from "react"
import { useSearchParams } from "next/navigation"

import Navbar from "../home/navbar"
import Feedback from "../home/feedback"
import Manage from "../home/manage"
import Search from "../home/search"

import { LoadingRedirect } from "../ui/loading"

export default function Layout({ children }) {
    const params = useSearchParams();

    const [state, setState] = useState({
        redirect: false,
        overlay: false,
    })

    useEffect(() => {
        const overlayParams = ['manage', 'feedback', 'search'];
        const isOverlay = overlayParams.some(key => params.get(key));

        setState((prev) => ({
            ...prev,
            overlay: isOverlay,
        }));

        document.body.style.overflow = isOverlay ? 'hidden' : 'unset'
    }, [params]);

    return (
        <main id="home" className={state.overlay ? 'overlay' : ''}>
            {state.redirect ?
                <LoadingRedirect />
                :
                <>
                    <div id="header">
                        <Navbar
                            handleRedirect={() => setState(prev => ({ ...prev, redirect: true }))}
                        />
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
                </>
            }
        </main >
    )
}
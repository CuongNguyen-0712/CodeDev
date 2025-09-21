'use client'
import Image from 'next/image'

import { useRouterActions } from './router/router';

import { IoMdArrowBack } from "react-icons/io";

export default function PageNotFound() {

    const { navigateBack, navigateToHome } = useRouterActions();

    return (
        <div id="not_found">
            <Image src={`/image/static/404.png`} alt='404_image' width={300} height={300} />
            <h1>Page not found</h1>
            <p>The page you are looking for does not exist.</p>
            <div className="not_found_button">
                <button id='back_btn' onClick={navigateBack}>
                    <IoMdArrowBack />
                    Go back
                </button>
                <button id='home_btn' onClick={navigateToHome}>
                    Take me home
                </button>
            </div>
        </div>
    )
}
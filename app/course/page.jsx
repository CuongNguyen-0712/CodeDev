'use client'

import { useState } from "react";

import Layout from "../component/feature/layout"
import RouterPush from "../router/router"
import Course from "../component/content/course/course";

export default function Page(){
    const { navigateToCurrent } = RouterPush();

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0,
    });

    return (
        <>
            <Layout children={<Course />}
                size={({ width, height }) => setSizeDevice({width: width, height: height})}
                onReturn={navigateToCurrent}
            />
        </>
    )
}
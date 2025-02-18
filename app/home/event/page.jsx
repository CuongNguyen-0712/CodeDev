'use client'
import { useState } from "react";

import Layout from "../../lib/layout"
import RouterPush from "../../lib/router"
import Event from "../../component/event/event"

export default function Page() {
    const { navigateToHome } = RouterPush();

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0,
    });

    return (
        <Layout
            children={<Event size={sizeDevice} />}
            onReturn={navigateToHome}
            size={({ width, height }) => setSizeDevice({ width: width, height: height })}
        />
    )
}
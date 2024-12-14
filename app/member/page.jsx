'use client'
import { useState } from "react";

import RouterPush from "../router/router";
import Layout from "../component/feature/layout";
import Member from "../component/member/member";

export default function Page() {
    const { navigateToCurrent } = RouterPush();

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0,
    });

    return (
        <Layout
            children={<Member size={sizeDevice} />}
            onReturn={() => navigateToCurrent()}
            size={({ width, height }) => setSizeDevice({width: width, height: height})}
        />
    )
}
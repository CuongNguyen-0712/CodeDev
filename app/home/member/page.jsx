'use client'
import { useState } from "react";

import RouterPush from "../../lib/router";
import Layout from "../../lib/layout";
import Member from "../../component/member/member";

export default function Page() {
    const { navigateToHome } = RouterPush();

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0,
    });

    return (
        <Layout
            children={<Member size={sizeDevice} />}
            onReturn={navigateToHome}
            size={({ width, height }) => setSizeDevice({ width: width, height: height })}
        />
    )
}
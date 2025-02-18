'use client'
import { useState } from "react";

import Form from "../component/auth/form/form"
import LoadingWait from "../lib/loadingWait";

export default function Page() {

    const [isHandling, setIsHandling] = useState(false);

    return (
        <main id="main">
            <Form isHandle={() => setIsHandling(true)} />
            {
                isHandling &&
                <div id="loadAuth">
                    <LoadingWait />
                </div>
            }
        </main>
    )
}
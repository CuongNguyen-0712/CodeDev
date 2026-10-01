import { useEffect, useState } from "react";

export default function useImagesValidator(urls = [], fallback) {
    const [finalUrl, setFinalUrl] = useState(fallback);
    const [status, setStatus] = useState("loading");

    useEffect(() => {
        if (!Array.isArray(urls) || urls.length === 0) {
            setStatus("invalid");
            setFinalUrl(fallback);
            return;
        }

        let isMounted = true;
        setStatus("loading");

        const checkNext = (index) => {
            if (index >= urls.length || !isMounted) {
                setStatus("invalid");
                setFinalUrl(fallback);
                return;
            }

            const url = urls[index];

            try {
                new URL(url);
            } catch {
                return checkNext(index + 1);
            }

            const img = new Image();

            img.onload = () => {
                if (isMounted) {
                    setStatus("valid");
                    setFinalUrl(url);
                }
            };

            img.onerror = () => {
                checkNext(index + 1);
            };

            img.src = url;
        };

        checkNext(0);

        return () => {
            isMounted = false;
        };
    }, [JSON.stringify(urls)]);

    return { finalUrl, status, isValid: status === "valid" };
}

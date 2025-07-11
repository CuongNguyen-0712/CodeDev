import { useEffect, useState, useRef } from "react";

export default function useInfiniteScroll({ hasMore, onLoadMore, threshold = 0.5 }) {
    const [observerNode, setObserverNode] = useState(null);
    const loaderRef = useRef(null);

    useEffect(() => {
        if (!observerNode || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onLoadMore();
                }
            },
            { threshold }
        );

        observer.observe(observerNode);

        return () => {
            observer.disconnect();
        };
    }, [observerNode, hasMore, threshold]);

    const setRef = (node) => {
        loaderRef.current = node;
        setObserverNode(node);
    };

    return { setRef };
}

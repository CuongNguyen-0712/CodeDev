import { useEffect, useState, useRef } from "react";

export default function useInfiniteScroll({ hasMore, onLoadMore, threshold = 0 }) {
    const [observerNode, setObserverNode] = useState(null);
    const ref = useRef(null);

    useEffect(() => {
        if (!observerNode || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onLoadMore();
                }
            },
            {
                threshold,
                rootMargin: `0px 0px 1000px 0px`
            }
        );

        observer.observe(observerNode);

        return () => {
            observer.disconnect();
        };
    }, [observerNode, hasMore, threshold]);

    const setRef = (node) => {
        ref.current = node;
        setObserverNode(node);
    };

    return { setRef };
}

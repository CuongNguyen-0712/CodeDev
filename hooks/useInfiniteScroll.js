import { useEffect, useState, useRef, useCallback } from "react";

export default function useInfiniteScroll({
    hasMore,
    onLoadMore,
    isLoading = false,
    threshold = 0.1,
    root = null,
}) {
    const [observerNode, setObserverNode] = useState(null);
    const onLoadMoreRef = useRef(onLoadMore);
    const isLoadingRef = useRef(isLoading);
    const hasMoreRef = useRef(hasMore);

    useEffect(() => {
        onLoadMoreRef.current = onLoadMore;
    }, [onLoadMore]);

    useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    useEffect(() => {
        if (!observerNode || !hasMore) return;

        const containerElement =
            root || (typeof document !== "undefined" ? document.getElementById("container") : null);

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
                    onLoadMoreRef.current?.();
                }
            },
            {
                root: containerElement,
                rootMargin: "100px",
                threshold,
            }
        );

        observer.observe(observerNode);

        return () => observer.disconnect();
    }, [observerNode, hasMore, threshold, root]);

    const setRef = useCallback((node) => {
        setObserverNode((prev) => (prev === node ? prev : node));
    }, []);

    return { setRef };
}

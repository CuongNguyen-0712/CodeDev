import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false on the server and during hydration, true after: render session-dependent UI only once
// this is true, so a boundary that hydrates after the session arrived still matches the server HTML.
export function useHydrated() {
    return useSyncExternalStore(subscribe, () => true, () => false);
}

import { routeConfig } from "./route.config";
import { policies } from "./policy";

import { match } from "path-to-regexp";

export function hasPermission(user, permission) {
    if (!user)
        return false;

    if (user.role === 'admin' || user.role === 'ADMIN')
        return true;

    if (Array.isArray(user.permissions)) {
        if (user.permissions.includes("*"))
            return true;
        return user.permissions.includes(permission);
    }

    if (typeof user.permissions === "string") {
        return user.permissions === "*" || user.permissions === permission;
    }

    // If permissions array is not set on session token, allow if user is authenticated
    // and let resource-specific policies validate the request
    return true;
}

function findRoute(pathname) {
    return routeConfig.find(route => (
        match(route.path, { decode: decodeURIComponent })(pathname)
    ));
}

export function canAccessRoute(ctx) {
    const route = findRoute(ctx.pathname);

    if (!route)
        return true;

    const permission = `${route.resource}.${route.action}`;

    if (!hasPermission(ctx.user, permission))
        return false;

    const handler =
        policies?.[route.resource]?.[route.action];

    if (!handler)
        return true;

    return handler(ctx);
}
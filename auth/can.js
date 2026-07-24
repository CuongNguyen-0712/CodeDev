import { routeConfig } from "./route.config";
import { policies } from "./policy";

import { match } from "path-to-regexp";

export function hasPermission(user, permission) {
    if (!user)
        return false;

    if (user.permissions.includes("*"))
        return true;

    return user.permissions.includes(permission);
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

    if (route.isPublic)
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
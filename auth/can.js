import { routeConfig } from "./route.config";
import { policies } from "./policy";

export function hasPermission(user, permission) {
    if (!user)
        return false;

    if (user.permissions.includes("*"))
        return true;

    return user.permissions.includes(permission);
}

function findRoute(pathname) {
    const routes = Object.values(routeConfig).flat();
    return routes.find(route => (
        pathname === route.path ||
        pathname.startsWith(`${route.path}/`)
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
import { ACTION } from '../actions'
import { RESOURCE } from '../resource'
import { ACCESS } from '../access'

// Signed-in pages of onboarding / commerce / admin. PRIVATE only requires a session; the admin
// page and every admin API check permissions from the database on the server.
export default [
    {
        path: "/onboarding",
        action: ACTION.UPDATE,
        resource: RESOURCE.SETTINGS,
        access: ACCESS.PRIVATE
    },
    {
        path: "/orders",
        action: ACTION.LIST,
        resource: RESOURCE.SETTINGS,
        access: ACCESS.PRIVATE
    },
    {
        path: "/orders/:id",
        action: ACTION.READ,
        resource: RESOURCE.SETTINGS,
        access: ACCESS.PRIVATE
    },
    {
        path: "/checkout/mock/:orderId",
        action: ACTION.READ,
        resource: RESOURCE.SETTINGS,
        access: ACCESS.PRIVATE
    },
    {
        path: "/admin",
        action: ACTION.READ,
        resource: RESOURCE.ADMIN,
        access: ACCESS.PRIVATE
    },
]


import { ROLES } from './roles';

export const ROUTE_PERMISSIONS = {
    "/app": [
        ROLES.STUDENT,
        ROLES.INSTRUCTOR,
        ROLES.ADMIN,
    ],

    "/instructor": [
        ROLES.INSTRUCTOR,
        ROLES.ADMIN,
    ],

    "/admin": [
        ROLES.ADMIN,
    ],
};
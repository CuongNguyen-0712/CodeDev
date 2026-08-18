import { ACTION } from '../actions';
import { RESOURCE } from '../resource';
import { ACCESS } from '../access';

export default [
    {
        path: "/roadmap",
        action: ACTION.LIST,
        resource: RESOURCE.ROADMAP,
        access: ACCESS.PUBLIC
    },

    {
        path: "/roadmap/:id",
        action: ACTION.READ,
        resource: RESOURCE.ROADMAP,
        access: ACCESS.PUBLIC
    }
]
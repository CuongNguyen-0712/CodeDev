import { ACTION } from '../actions';
import { RESOURCE } from '../resource';

export default [
    {
        path: "/roadmap",
        action: ACTION.LIST,
        resource: RESOURCE.ROADMAP,
        isPublic: true
    },

    {
        path: "/roadmap/:id",
        action: ACTION.READ,
        resource: RESOURCE.ROADMAP,
        isPublic: true
    }
]
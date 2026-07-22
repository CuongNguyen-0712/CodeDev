import { ACTION } from '../actions';
import { RESOURCE } from '../resource';

export default [
    {
        path: "/learning",
        action: ACTION.LIST,
        resource: RESOURCE.LEARNING,
        isPublic: false
    },
    {
        path: "/learning/:id",
        action: ACTION.READ,
        resource: RESOURCE.LEARNING,
        isPublic: false
    }
]
import { ACTION } from '../actions';
import { RESOURCE } from '../resource';
import { ACCESS } from '../access';

export default [
    {
        path: "/learning",
        action: ACTION.LIST,
        resource: RESOURCE.LEARNING,
        access: ACCESS.PRIVATE
    },
    {
        path: "/learning/:id",
        action: ACTION.READ,
        resource: RESOURCE.LEARNING,
        access: ACCESS.PROTECTED
    }
]
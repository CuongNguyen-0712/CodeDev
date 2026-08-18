import { ACTION } from '../actions';
import { RESOURCE } from '../resource';
import { ACCESS } from '../access';

export default [
    {
        path: "/",
        action: ACTION.READ,
        resource: RESOURCE.INDEX,
        access: ACCESS.AUTH
    },
]
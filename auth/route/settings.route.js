import { ACTION } from '../actions';
import { RESOURCE } from '../resource';
import { ACCESS } from '../access';

export default [
    {
        path: "/settings",
        action: ACTION.READ,
        resource: RESOURCE.SETTINGS,
        access: ACCESS.PRIVATE
    },
]
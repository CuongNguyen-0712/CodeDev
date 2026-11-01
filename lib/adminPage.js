import { actorCan } from "@/lib/authz";
import { getAdminActor } from "@/lib/adminActor";

/** True when the viewer of this admin request holds `permission` (the layout already required admin.read). */
export async function adminCan(permission) {
    return actorCan(await getAdminActor(), permission);
}

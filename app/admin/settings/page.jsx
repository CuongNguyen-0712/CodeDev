import { redirect } from "next/navigation";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export default function SettingsIndex() {
    redirect("/admin/settings/general");
}

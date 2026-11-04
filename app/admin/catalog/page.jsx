import { Suspense } from "react";

import CatalogPage from "@/components/admin/catalog/catalogPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Catalog" };

export default function AdminCatalogPage() {
    return <Suspense><CatalogPage /></Suspense>;
}

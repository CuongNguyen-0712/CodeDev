import { Suspense } from "react";

import CatalogPage from "@/components/admin/catalog/catalogPage";

export const metadata = { title: "Catalog" };

export default function AdminCatalogPage() {
    return <Suspense><CatalogPage /></Suspense>;
}

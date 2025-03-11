import { useState } from "react"

import CreateMember from "./createMember"
import TableFilter from "./tableFilter"
import Navbar from "../home/navbar";

import Router from "@/app/router/router";

export default function Social() {
    const { navigateToHome } = Router();

    const [filter, setFilter] = useState(false);
    const [filterValue, setFilterValue] = useState({
        name: [],
        code: [],
    });

    return (
        <main id="main">
            <div id="header">
                <Navbar handleReturn={navigateToHome} />
            </div>
            <CreateMember
                sizeDevice={size}
                onFilter={filter}
                setFilter={() => setFilter(!filter)}
                filterValue={filterValue}
            />
            <TableFilter
                sizeDevice={size}
                onFilter={filter}
                setFilter={() => setFilter(false)}
                handleFilter={(value) => setFilterValue({ name: value.name, code: value.code })}
            />
        </main>
    )
}
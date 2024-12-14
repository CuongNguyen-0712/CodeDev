import { useState } from "react"

import CreateMember from "./createMember"
import TableFilter from "./tableFilter"

export default function Member({ size }) {
    const [filter, setFilter] = useState(false);
    const [filterValue, setFilterValue] = useState({
        name: [],
        code: [],
    });

    return (
        <div className="member-container">
            <CreateMember
                sizeDevice={size}
                onFilter={filter}
                setFilter={() => setFilter(!filter)}
                filterValue={filterValue}
            />
            <TableFilter
                sizeDevice={size}
                onFilter={filter}
                setFilter = {() => setFilter(false)}
                handleFilter={(value) => setFilterValue({ name: value.name, code: value.code })}
            />
        </div>
    )
}
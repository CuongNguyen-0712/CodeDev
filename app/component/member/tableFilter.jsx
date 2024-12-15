import { useState, useRef, useEffect } from "react"

import { IoIosClose } from "react-icons/io";
import { FaSyncAlt, FaSortAmountDown } from "react-icons/fa";

export default function TableFilter({ onFilter, handleFilter, sizeDevice, setFilter }) {
    const refInput = useRef(null)

    const { width } = sizeDevice

    const [value, setValue] = useState('');
    const [message, setMessage] = useState(null);

    const [filterValue, setFilterValue] = useState({
        name: [],
        code: [],
    })

    const handleSearchValue = (e) => {
        e.preventDefault();
        const regex = /^(?=.*[a-zA-Z])(?=.*\d).+$/;
        if (value.length > 0) {
            if (regex.test(value)) {
                setMessage("Please enter only character or number!");
                setTimeout(() => {
                    setMessage(null)
                }, 1000)
            }
            else {
                if (value.charCodeAt(0) >= 46 && value.charCodeAt(0) <= 57) {
                    setFilterValue({
                        ...filterValue,
                        code: [...filterValue.code, value]
                    })
                }
                else {
                    setFilterValue({
                        ...filterValue,
                        name: [...filterValue.name, value]
                    })
                }
                setValue('');
                refInput.current.focus();
            }
        }
        else {
            setMessage("Please enter value to search!");
            setTimeout(() => {
                setMessage(null)
            }, 1000)
        }
    }

    useEffect(() => {
        handleFilter(filterValue)
    }, [filterValue])

    return (
        <div className="table-filter" style={width >= 768 ? { display: 'flex', right: onFilter ? '0px' : '-350px', top: '0' } : { display: 'flex', bottom: onFilter ? '0px' : '-50%', height: '50%', width: '100%' }}>
            <form onSubmit={handleSearchValue} className="form-search">
                <input type="text" value={value} placeholder="Search value..." onChange={(e) => setValue(e.target.value)} ref={refInput} />
                <button type="submit">Add</button>
            </form>
            {message &&
                <div className="alert">
                    <p>{message}</p>
                </div>
            }
            <div className="value-search">
                <h4>Filter by code</h4>
                <div className="code-filter">
                    {filterValue.code.map((item, index) => (
                        <span key={index} className="value">
                            {item}
                            <span onClick={() => setFilterValue({ ...filterValue, code: filterValue.code.filter((item, i) => i !== index) })} >
                                <IoIosClose />
                            </span>
                        </span>
                    ))}
                </div>
                <h4>Filter by name</h4>
                <div className="name-filter">
                    {filterValue.name.map((item, index) => (
                        <span key={index} className="value">
                            {item}
                            <span onClick={() => setFilterValue({ ...filterValue, name: filterValue.name.filter((item, i) => i !== index) })} >
                                <IoIosClose />
                            </span>
                        </span>
                    ))}
                </div>
            </div>
            <div className="footer-filter">
                <button onClick={() => setFilterValue({ name: [], code: [] })}>
                    Clear
                    <FaSyncAlt />
                </button>
                {width < 768 &&
                    <button className='close-filter' onClick={setFilter}>
                        <FaSortAmountDown />
                    </button>
                }
            </div>
        </div>
    )
}
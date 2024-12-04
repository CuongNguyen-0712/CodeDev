import { useState, useRef } from "react"

import { GrStatusGood, GrStatusUnknown, GrStatusWarning } from "react-icons/gr";

export default function TableFilter({ filter }) {

    const [IDValue, setIDValue] = useState({
        id: '',
        status: null,
    });
    const [nameValue, setNameValue] = useState({
        name: '',
        status: null,
    });

    const refScroll = useRef(null);
    const refInputID = useRef(null);
    const refInputName = useRef(null);

    const handleCheckKeyDowwnID = (e) => {
        const key = e.key;
        if (!Number.parseInt(key) && key !== 'Backspace' && key !== '0') {
            e.preventDefault();
        }
    }

    const handleCheckKeyDownName = (e) => {
        const key = e.key;
        if (Number.parseInt(key) && key !== 'Backspace') {
            e.preventDefault();
        }
    }

    const handleStatus = ({ status, value }) => {
        if (status && value !== '') {
            return <GrStatusGood />
        }
        else if (!status && value !== '') {
            return <GrStatusWarning />
        }
        else {
            return <GrStatusUnknown />
        }
    }

    const handleScroll = (e) => {
        refScroll.current.scrollLeft += e.deltaY;
    }

    const gender = [
        {
            id: 0,
            name: 'Male',
        },
        {
            id: 1,
            name: 'Famale',
        },
        {
            id: 2,
            name: 'None',
        }
    ]

    const rate = [
        {

            id: 0,
            rate: 1,
        },
        {
            id: 1,
            rate: 2,
        },
        {
            id: 2,
            rate: 3,
        },
        {
            id: 3,
            rate: 4,
        },
        {
            id: 4,
            rate: 5,
        },
        {
            id: 5,
            rate: 'All',
        }
    ]

    const social = [
        {
            id: 0,
            social: 'Any'
        },
        {
            id: 1,
            social: "All"
        },
        {
            id: 2,
            social: "None"
        }
    ]

    const [checkGender, setGender] = useState(gender.length - 1);
    const [checkRate, setRate] = useState(rate.length - 1);
    const [checkSocial, setSocial] = useState(social.length - 1);

    return (
        <div className={`table-filter ${filter ? 'active' : ''}`} ref={refScroll} onWheel={handleScroll}>
            <ul className="gender">
                <span>Gender</span>
                {gender.map((item, index) => (
                    <li key={index}>
                        <div className="checkbox">
                            <input type="checkbox"
                                checked={checkGender === item.id}
                                onChange={() => setGender(item.id)}
                            />
                            <span className="checkmark"></span>
                        </div>
                        <span>{item.name}</span>
                    </li>
                ))}
            </ul>
            <ul className="rating">
                <span>Rating</span>
                {rate.map((item, index) => (
                    <li key={index}>
                        <div className="checkbox">
                            <input type="checkbox"
                                checked={checkRate === item.id}
                                onChange={() => setRate(item.id)}
                            />
                            <span className="checkmark"></span>
                        </div>
                        <span>{item.rate}</span>
                    </li>
                ))}
            </ul>
            <ul className="search-id">
                <span>
                    ID
                </span>
                <div className="input-value">
                    <input type="text"
                        maxLength={10}
                        ref={refInputID}
                        value={IDValue.id}
                        onKeyDown={handleCheckKeyDowwnID}
                        onChange={(e) => setIDValue((state) => ({ ...state, status: false, id: e.target.value }))}
                    />
                    <span className="status">
                        {handleStatus({ status: IDValue.status, value: IDValue.id })}
                    </span>
                </div>
            </ul>
            <ul className="search-name">
                <span>
                    Name
                </span>
                <div className="input-value">
                    <input type="text"
                        ref={refInputName}
                        value={nameValue.name}
                        onKeyDown={handleCheckKeyDownName}
                        onChange={(e) => setNameValue((state) => ({ ...state, status: false, name: e.target.value }))}
                    />
                    <span className="status">
                        {handleStatus({ status: nameValue.status, value: nameValue.name })}
                    </span>
                </div>
            </ul>
            <ul className="social">
                <span>Social</span>
                {social.map((item, index) => (
                    <li key={index}>
                        <div className="checkbox">
                            <input type="checkbox"
                                checked={checkSocial === item.id}
                                onChange={() => setSocial(item.id)}
                            />
                            <span className="checkmark"></span>
                        </div>
                        <span>{item.social}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
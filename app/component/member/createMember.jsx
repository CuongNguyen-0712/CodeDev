import { useState, useEffect } from "react";

import Image from "next/image";

import { IoFilter } from "react-icons/io5";

import axios from "axios";
export default function CreateMember({ onFilter, setFilter, filterValue, sizeDevice }) {
    const { code, name } = filterValue
    const { width } = sizeDevice

    const [member, setMember] = useState({
        defaultMember: [],
        filterMember: [],
    })

    const formatString = (str) => {
        const newStr = str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "D")
            .trim()
            .toLowerCase()
            .split(" ")
            .join('')
        return newStr;
    }

    useEffect(() => {
        const filterCode = member.defaultMember.filter((mem) => {
            return code.some((item) => mem.code.includes(item));
        })

        const filterName = member.defaultMember.filter((mem) => {
            return name.some((item) => formatString(mem.name).includes(formatString(item)));
        })

        const newFilterMember = [...new Set([...filterCode, ...filterName])];
        if (newFilterMember.length > 0) {
            setMember({ ...member, filterMember: newFilterMember });
        }
        else {
            setMember({ ...member, filterMember: member.defaultMember });
        }
    }, [code, name])

    const fecthDataMember = async () => {
        try {
            const res = await axios.get('/data/memberList.json');
            const data = res.data;
            setMember({
                defaultMember: data,
                filterMember: data
            })
        } catch (error) {
            console.log(error)
        }
    }

    useEffect(() => {
        fecthDataMember();
    }, [])

    return (
        <div className="member-frame" style={width >= 768 ? { width: onFilter ? 'calc(100% - 350px)' : '100%', borderRight: '1px solid #ccc' } : { width: '100%' }}>
            <div className="member-heading">
                <div className="intro">
                    <h2>Welcome CuongCoder</h2>
                    <p>Connect with other member and make new friends</p>
                </div>
                <button onClick={setFilter}>
                    <IoFilter />
                    Filter
                </button>
            </div>
            <div className="members">
                <div className="container">
                    {member.filterMember.map((mem, index) => (
                        <ul key={index} className="member">
                            <div className="base-info">
                                <Image src={`/public/`} alt='avatar' width={80} height={80} />
                                <div className="base-main">
                                    <span>{mem.code}</span>
                                    <span>{mem.name}</span>
                                </div>
                            </div>
                            <div className="feature">
                                <button>
                                    Profile
                                </button>
                                <button>
                                    Add Friend
                                </button>
                            </div>
                        </ul>
                    ))}
                </div>
            </div>
        </div>
    )
}
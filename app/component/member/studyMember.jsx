import { useState, useEffect } from "react";

import CreateMember from "./createMember";
import TargetMember from "./targetMember";
import HandleSearchMember from "./handleSearchMember";

import { IoIosClose } from "react-icons/io";
import { FaFilter, FaSearch } from "react-icons/fa";

export default function Member({ handle }) {

    const [search, setSearch] = useState({
        valueSearch: '',
        searching: false
    })

    const [target, setTarget] = useState({
        targetMember: {},
        targetIndex: null,
    })

    const [members, setMember] = useState({
        currentMembers: [],
        availableMember: [],
        membersFavor: [],
        membersRating: [],
    });

    const fetchDataMember = async () => {
        try {
            const response = await fetch("/data/memberList.json")
            if (!response.ok) {
                throw new Error("Fetching data failed !")
            }
            const data = await response.json();
            setMember((state) => ({ ...state, availableMember: data, currentMembers: data }));
        }
        catch (err) {
            console.log(err)
        }
    }

    useEffect(() => {
        fetchDataMember();
    }, [])

    useEffect(() => {
        const handler = setTimeout(() => {
            const updateMembers = HandleSearchMember({ value: search.valueSearch, members: members.currentMembers });
            setMember((prev) => ({ ...prev, availableMember: updateMembers }))
        }, 500)

        return () => {
            clearTimeout(handler)
        }
    }, [search.valueSearch, members.availableMember])

    useEffect(() => {
        setSearch((state) => ({ ...state, valueSearch: '' }))
    }, [search.searching])

    return (
        <>
            <div className="member-container">
                <span className="title">Member</span>
                <div className="member-feature">
                    <button className="filter">
                        <FaFilter />
                    </button>
                    <div className={`search ${search.searching ? 'active' : ''}`}>
                        <button className="search" onClick={() => setSearch((prev) => ({ ...prev, searching: !prev.searching }))}>
                            <FaSearch />
                        </button>
                        <input
                            type="text"
                            value={search.valueSearch}
                            placeholder="Search"
                            name="Data-search"
                            id="search-bar"
                            onChange={(e) => setSearch((prev) => ({ ...prev, valueSearch: e.target.value }))}
                        />
                        {search.valueSearch ?
                            <span onClick={() => setSearch((prev) => ({ ...prev, valueSearch: '' }))}>
                                <IoIosClose />
                            </span>
                            :
                            null
                        }
                    </div>
                </div>
                <div className="member-frame">
                    <div className="list-member">
                        <CreateMember
                            handle={(data) => setTarget((prev) => ({ ...prev, targetMember: data, targetIndex: data.id }))}
                            target={target.targetIndex}
                            members={members.availableMember}
                        />
                    </div>
                    <div className={`target-frame ${!target.targetIndex ? 'fail' : ''}`}>
                        <TargetMember
                            handle={() => setTarget((prev) => ({ ...prev, targetMember: {}, targetIndex: null }))}
                            member={target.targetMember}
                            setFavor={members.membersFavor}
                            setRating={members.membersRating}
                            handleFavor={(id) => setMember((prev) => ({ ...prev, membersFavor: members.membersFavor.includes(id) ? prev.membersFavor.filter(item => item !== id) : [...prev.membersFavor, id] }))}
                            handleRating={(id) => setMember((prev) => ({ ...prev, membersRating: members.membersRating.includes(id) ? prev.membersRating.filter(item => item !== id) : [...prev.membersRating, id] }))}
                        />
                    </div>
                </div>
                <button className="handle-close" onClick={handle}>
                    <IoIosClose />
                </button>
            </div>
        </>
    )
}
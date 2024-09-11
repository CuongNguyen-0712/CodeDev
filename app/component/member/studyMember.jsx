import { useEffect, useState, useCallback, useRef, forwardRef } from "react";
import CustomLink from "./customLink";
import CreateMember from "./createMember";

import { MdMoreHoriz } from "react-icons/md";
import { FaSquareFacebook, FaTiktok } from "react-icons/fa6";
import { FaInstagramSquare } from "react-icons/fa"
import { IoClose } from "react-icons/io5";


const Item = forwardRef(({ item }, ref) => {
    return (
        <div className="info-container" ref={ref}>
            {item}
        </div>
    );
});

export default function Member() {

    const [members, setMembers] = useState({
        members: [],
        member_target: null,
        maxLengthMember: null,
        membersLengthShown: 10,

    })

    const [loading, setLoading] = useState(false);

    const observer = useRef();
    const firstObserver = useRef();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/data/memberList.json");
                if (!res.ok) {
                    throw new Error("Fetching failed")
                }
                const data = await res.json();
                setMembers((state) => ({
                    ...state,
                    members: data,
                    maxLengthMember: data.length,
                }));
            }
            catch (error) {
                console.log(error);
            }
        }
        fetchData();
    }, [])

    const handleSetShownMember = (mount) => {
        setMembers((state) => {
            let newLength = members.membersLengthShown + mount;
            if (newLength < 10) {
                newLength = 10;
            }
            else if (newLength >= members.maxLengthMember) {
                newLength = members.maxLengthMember;
            }
            else {
                newLength = newLength;
            }
            return {
                ...state,
                membersLengthShown: newLength,
            }
        })
    }

    const lastItemRef = useCallback((node) => {
        if (observer.current) {
            observer.current.disconnect();
        }
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                setLoading(true);
                setTimeout(() => {
                    setLoading(false);
                    handleSetShownMember(10);
                }, 2000)
            }
        });
        if (node) {
            observer.current.observe(node);
        }
    }, [handleSetShownMember]);

    const firstItemRef = useCallback((node) => {
        if (firstObserver.current) {
            firstObserver.current.disconnect();
        }
        firstObserver.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                setLoading(false);
                handleSetShownMember(-10);
            }
        });
        if (node) {
            firstObserver.current.observe(node);
        }
    }, [handleSetShownMember]);

    const handleCheckObserve = (index) => {
        if (index === members.membersLengthShown) {
            return lastItemRef;
        }
        else if (index === (members.membersLengthShown - 15)) {
            return firstItemRef;
        }
        else {
            return null;
        }
    }

    return (
        <>
            <ul className="member-list">
                {members.members.slice(0, members.membersLengthShown).map((member) => (
                    <div key={member.id} className="member-item" >

                        {(members.member_target === member.id) ?
                            (
                                <>
                                    <div className="show-link">

                                        <CustomLink href={member.facebook} children={<span className="icon-link"><FaSquareFacebook /></span>} />
                                        <CustomLink href={member.instagram} children={<span className="icon-link"><FaInstagramSquare /></span>} />
                                        <CustomLink href={member.tiktok} children={<span className="icon-link"><FaTiktok /></span>} />

                                        <span className={`show-more ${members.member_target === member.id ? 'active' : ''}`} onClick={() => setMembers(prev => ({ ...prev, member_target: null }))}>
                                            <IoClose />
                                        </span>
                                    </div>
                                </>
                            )
                            :
                            (
                                <>
                                    <Item item={<CreateMember key={member.id} {...member} />} ref={member.id < members.maxLengthMember ? handleCheckObserve(member.id) : null} />
                                    <div className={`show-more ${members.member_target === member.id ? 'active' : ''}`} onClick={() => setMembers(prev => ({ ...prev, member_target: member.id }))}>
                                        <MdMoreHoriz />
                                    </div>
                                </>
                            )
                        }
                    </div>
                ))}
                <div className="loader">
                    <div className={`progress-loader ${loading ? "acvate" : ""}`}>
                        <span>Loading...</span>
                        <div className="progress"></div>
                    </div>
                </div>
            </ul>
        </>
    )
}

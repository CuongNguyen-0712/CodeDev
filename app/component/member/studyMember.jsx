import { useEffect, useState, useCallback, useRef, forwardRef } from "react";

import CustomInfoSecret from "./infoSecret";
import CreateMember from "./createMember";
import AuthMember from "./handleAuthMember ";

import { IoIosLock } from "react-icons/io";

const Item = forwardRef(({ item }, ref) => {
    return (
        <div className="info-wrapper" ref={ref}>
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
        isSecret: false,
        currentCode: '',
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

    const handleTarget = (id, secretCode) => {
        setMembers((state) => ({
            ...state,
            member_target: id,
            currentCode: secretCode,
            isSecret: false
        }))
    }

    const handleShowSecret = () => {
        setMembers((state) => ({
            ...state,
            isSecret: true,
        }))
    }

    const handleSetClose = () => {
        setMembers((state) => ({
            ...state,
            member_target: null,
            currentCode: '',
            isSecret: false,
        }))
    }

    return (
        <>
            <ul className="member-list">
                {members.members.slice(0, members.membersLengthShown).map((member) => (
                    <div key={member.id} className='info-container'>
                        <Item item={<CreateMember
                            key={member.id} {...member}
                            handle={(id, secretCode) => handleTarget(id, secretCode)}
                            target={members.member_target}
                        />}
                            ref={member.id < members.maxLengthMember ? handleCheckObserve(member.id) : null}
                        />
                        {
                            (members.member_target === member.id && !members.isSecret) &&
                            <AuthMember
                                handleAccess={handleShowSecret}
                                handleDeline={handleSetClose}
                                code={members.currentCode}
                            />
                        }
                        {
                            (members.member_target === member.id && members.isSecret) &&
                            <>
                                <CustomInfoSecret
                                    infoSecret={{ phone: member.phone, email: member.email, facebook: member.facebook, instagram: member.instagram, tiktok: member.tiktok }}
                                />
                                <button className="lock" onClick={handleSetClose}>
                                    <IoIosLock />
                                </button>
                            </>
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

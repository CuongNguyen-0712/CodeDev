import { useState, useEffect } from "react"

import Image from "next/image";
import axios from "axios";
import { useRouterActions } from "@/app/router/router";

import { LoadingContent } from "../../ui/loading";

import { FaCartShopping } from "react-icons/fa6";
import { IoFilter, IoSettingsSharp, IoClose, IoEyeOff, IoTrashBin } from "react-icons/io5";

export default function MyCourse() {
    const { navigateToCourse } = useRouterActions();

    const [pending, setPending] = useState(true)
    const [course, setCourse] = useState([])
    const [option, setOption] = useState(null)

    const fetchData = async () => {
        try {
            const res = await axios.get('/api/myCourse');
            if (res.status === 200) {
                const course = res.data;
                setCourse(course);
                setPending(false);
            }
            else if (res.status === 500) {
                setCourse({ heading: 'Server is error', content: 'Failed to load content' })
                setPending(false);
            }
        }
        catch (err) {
            setPending(false);
            setCourse({ heading: 'Something is wrong', content: 'Failed to load content' })
            throw new Error(err);
        }
    }

    const handleWithdrawCourse = async (id) => {
        try {
            const res = await axios.delete('/actions/myCourse', { data: { idCourse: id, idStudent: 'CD01' } })
            if (res.status == 200) {

                setOption(null)
                await fetchData()
            }
        }
        catch (err) {
            throw new Error(err)
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    return (
        <>
            {
                pending ?
                    <LoadingContent />
                    :
                    <div id="myCourse">
                        <div className="heading-myCourse">
                            <div className="input-search">
                                <input type="text" placeholder="Search your course" />
                                <button className="filter">
                                    <IoFilter />
                                </button>
                            </div>
                            <div className="handle-course">
                                <button onClick={navigateToCourse} id="course-btn">
                                    <FaCartShopping />
                                    Marketplace
                                </button>
                            </div>
                        </div>
                        <div className="course-frame">
                            {course && course.map((item, index) => (
                                <div key={index} className="course">
                                    <div className="heading-course">
                                        <Image src={item.image} width={50} height={50} alt="image-course" />
                                        <h3>{item.title}</h3>
                                    </div>
                                    <div className="content-course">
                                        <div className="item">
                                            <h4>Concept</h4>
                                            <p>{item.concept}</p>
                                        </div>
                                        <div className="item">
                                            <h4>Level:</h4>
                                            <p>{item.level}</p>
                                        </div>
                                        <div className="item">
                                            <h4>Language:</h4>
                                            <p>{item.language}</p>
                                        </div>
                                        <div className="item">
                                            <h4>Progress:</h4>
                                            <p>{((item.progress / item.lesson) * 100).toPrecision(3)}% ({item.progress}/{item.lesson})</p>
                                        </div>
                                    </div>
                                    <div className="footer-course">
                                        {
                                            option === index ?
                                                <div className="setting-list">
                                                    <button className="hide-course">
                                                        <IoEyeOff />
                                                        Hide
                                                    </button>
                                                    <button className="cancel-course" onClick={() => handleWithdrawCourse(item.id)}>
                                                        <IoTrashBin />
                                                        Withdraw
                                                    </button>
                                                </div>
                                                :
                                                <button className="join-course">Join</button>
                                        }
                                        <button className="setting-course" onClick={() => setOption(option === index ? null : index)}>
                                            {option === index ? <IoClose /> : <IoSettingsSharp />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
            }
        </>
    )
}
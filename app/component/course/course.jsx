import { useState, useEffect } from "react"

import axios from "axios"
import Image from "next/image";

import Navbar from "../home/navbar";
import { LoadingContent } from "../ui/loading";
import { useQuery } from "@/app/router/router";

import { FaStar, FaCircleNotch, FaRegCheckCircle, FaRegTimesCircle } from "react-icons/fa";
import { IoFilter } from "react-icons/io5";
import { FaRightLong } from "react-icons/fa6";

export default function Course() {
    const queryNavigate = useQuery();

    const [state, setState] = useState({
        success: null,
        target: null,
        pending: false
    })

    const handleRequest = async (id, isCost) => {
        setState({ success: null, pending: true, target: id })
        try {
            const req = await axios.post('/actions/course', { idCourse: id, idStudent: 'CD01' });

            if (req.status === 200) {
                setState(prev => ({ ...prev, success: true, pending: false }))

                await fetchData();
            }
        }
        catch (err) {
            setState(prev => ({ ...prev, success: false, pending: false }))

            throw new Error(err)
        }
    }

    const [course, setCourse] = useState([]);
    const [pending, setPending] = useState(true);

    const fetchData = async () => {
        try {
            const res = await axios.get('/api/course');
            if (res.status === 200) {
                const course = res.data
                setCourse(course)
                setPending(false)
            }
            else if (res.status == 500) {
                setCourse({ heading: 'Server is error', content: 'Failed to load course, reload to try again!' })
                setPending(false)
            }
        }
        catch (err) {
            setCourse({ heading: 'Sonething is wrong', content: 'Failed to load course, reload to try again!' })
            setPending(false)
            throw new Error(err);
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    return (
        <main id="home">
            <div id="header">
                <Navbar onHome={true} />
            </div>
            <div id="container">
                {
                    pending ?
                        <LoadingContent />
                        :
                        <div id='course'>
                            <div className="heading-marketplace">
                                <div className="input-search">
                                    <input type="text" placeholder="Search your course" />
                                    <button className="filter">
                                        <IoFilter />
                                    </button>
                                </div>
                                <div className="handle-course">
                                    <button onClick={() => queryNavigate('/home', { target: 1, name: 'Course' })} id="myCourse-btn">
                                        Back to my course
                                        <FaRightLong />
                                    </button>
                                </div>
                            </div>
                            <div className="course-container">
                                {course && course.map((item) => (
                                    <div className="item" key={item.id}>
                                        <div className="heading">
                                            <Image src={item.image} alt='course-image' width={65} height={65} />
                                            <h3>{item.title}</h3>
                                            <span className="rating">
                                                {item.rating}
                                                <FaStar className="star" />
                                            </span>
                                            <div className="concept">
                                                <p>{item.concept}</p>
                                            </div>
                                        </div>
                                        <div className="content-item">
                                            <div className="info">
                                                <h5>{item.level}</h5>
                                            </div>
                                            <div className="info">
                                                <p>{item.lesson} lessons - {item.duration} hours</p>
                                            </div>
                                            <div className="info">
                                                <p>{item.description}</p>
                                            </div>
                                            <div className="info">
                                                <span>Instructor:</span>
                                                <p>{item.instructor}</p>
                                            </div>
                                            <div className="info">
                                                <span>Subject:</span>
                                                <p>{item.subject}</p>
                                            </div>
                                            <div className="info">
                                                <span>Student:</span>
                                                <p>{item.students}</p>
                                            </div>
                                        </div>
                                        <div className="footer">
                                            <button onClick={() => handleRequest(item.id, item.cost !== 'free')} style={item.cost === 'free' ? { backgroundColor: 'var(--color_blue)' } : { backgroundColor: 'var(--color_black)' }} disabled={state.pending}>
                                                {state.target === item.id ?
                                                    state.pending ?
                                                        <FaCircleNotch className="handling" />
                                                        :
                                                        state.success ? <FaRegCheckCircle style={{ fontSize: '20px' }} /> : <FaRegTimesCircle style={{ fontSize: '20px' }} />
                                                    :
                                                    item.cost === 'free' ? 'Learn' : item.cost
                                                }
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                }
            </div>
        </main >
    )
}
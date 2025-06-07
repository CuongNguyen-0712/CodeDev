import { useState, useEffect } from "react"

import Image from "next/image";
import Form from "next/form";

import DeleteMyCourseServive from "@/app/services/deleteService/myCourseService";
import GetMyCourseService from "@/app/services/getService/myCourseService";

import { useRouterActions } from "@/app/router/router";
import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import { FaCartShopping } from "react-icons/fa6";
import { FaCircleNotch } from "react-icons/fa";
import { IoFilter, IoSettingsSharp, IoClose, IoEyeOff, IoTrashBin } from "react-icons/io5";

export default function MyCourse({ redirect }) {
    const { navigateToCourse } = useRouterActions();

    const [state, setState] = useState({
        data: [],
        search: null,
        filter: false,
        idHandle: null,
        pending: true,
        message: null,
        error: null,
        handling: {
            withdraw: false,
            hide: false
        }
    })

    const handleNavigate = () => {
        redirect();
        navigateToCourse()
    }

    const fetchData = async () => {
        try {
            const res = await GetMyCourseService();
            if (res.status === 200) {
                setState((prev) => ({ ...prev, data: res.data, pending: false }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message }, pending: false }))
            throw new Error(err);
        }
    }

    const handleWithdrawCourse = async (id) => {

        setState((prev) => ({ ...prev, handling: { ...prev.handling, withdraw: true } }))

        try {
            const res = await DeleteMyCourseServive(id);
            if (res.status == 200) {
                setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: { ...prev.handling, withdraw: false }, idHandle: null }))
                await fetchData();
            }
            else {
                setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: { ...prev.handling, withdraw: false } }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, message: { status: 500, message: err.message }, handling: { ...prev.handling, withdraw: false } }))
            throw new Error(err)
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const handleSearch = (e) => {
        e.preventDefault();
    }

    return (
        <div id="myCourse">
            <div className="heading-myCourse">
                <Form id="search" onSubmit={handleSearch}>
                    <input type="text" placeholder="Search your course" />
                    <button type="button" className={`filter ${state.filter ? 'active' : ''}`} onClick={() => setState((prev) => ({ ...prev, filter: !prev.filter }))}>
                        <IoFilter />
                    </button>
                    {state.filter &&
                        <div id="course_table">
                            <div className="content_table">

                            </div>
                            <div className="footer_table">
                                <button type="button" id="cancel_btn" onClick={() => setState((prev) => ({ ...prev, filter: false }))}>Cancel</button>
                                <button type="button" id="apply_btn">Apply</button>
                            </div>
                        </div>
                    }
                </Form>
                <div className="handle-course">
                    <button onClick={handleNavigate} id="course-btn">
                        <FaCartShopping />
                        <span>
                            Marketplace
                        </span>
                    </button>
                </div>
            </div>
            <div className="course-frame">
                {
                    state.pending ?
                        <LoadingContent />
                        :
                        state.error ?
                            <ErrorReload data={state.error} refetch={fetchData} />
                            :
                            state.data && state.data.length > 0 ?
                                state.data.map((item, index) => (
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
                                                state.idHandle === index ?
                                                    <div className="setting-list">
                                                        <button className="hide-course" disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'pointer' }}>
                                                            <IoEyeOff />
                                                        </button>
                                                        <button className="cancel-course" onClick={() => handleWithdrawCourse(item.id)} disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'pointer' }}>
                                                            {
                                                                state.handling.withdraw ?
                                                                    <FaCircleNotch className="handling" style={{ fontSize: '1rem' }} />
                                                                    :
                                                                    <>
                                                                        <IoTrashBin />
                                                                        Withdraw
                                                                    </>
                                                            }
                                                        </button>
                                                    </div>
                                                    :
                                                    <button className="join-course" disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'pointer' }}>Join</button>
                                            }
                                            <button className="setting-course" onClick={() => setState((prev) => ({ ...prev, idHandle: state.idHandle === index ? null : index }))} disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'default' }}>
                                                {state.idHandle === index ? <IoClose /> : <IoSettingsSharp />}
                                            </button>
                                        </div>
                                    </div>
                                ))
                                :
                                <p>No course can be found here!</p>
                }
            </div>
        </div>
    )
}
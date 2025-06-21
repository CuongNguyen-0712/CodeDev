import { useState, useEffect, useTransition, startTransition } from "react"

import GetProjectService from "@/app/services/getService/projectService";
import PostRegisterProjectService from "@/app/services/postService/registerProjectService";
import { ErrorReload } from "../ui/error";
import { useQuery } from "@/app/router/router";

import { LoadingContent } from "../ui/loading";

import { IoFilter } from "react-icons/io5"
import { FaArrowRight, FaCircleNotch } from "react-icons/fa";
import { FaUser, FaUserGroup } from "react-icons/fa6";
import { IoMdArrowDropdown } from "react-icons/io";

export default function ProjectContent({ redirect }) {
    const queryNavigate = useQuery();

    const [state, setState] = useState({
        data: {
            self: [],
            team: [],
        },
        error: null,
        handling: false,
        idHandle: null,
        message: null,
        pending: true,
    })

    const fetchData = async () => {
        try {
            const res = await GetProjectService();

            if (res.status === 200) {
                const self = res.data.filter(item => item.method === 'Self');
                const team = res.data.filter(item => item.method === 'Team');
                setState((prev) => ({ ...prev, data: { self, team }, pending: false }));
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }));
            }
        }
        catch (err) {
            console.error(err);
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message || 'Something is wrong' }, pending: false }));
            throw new Error(err);
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleDropdown = (e) => {
        const target = e.currentTarget.closest('div')?.className;
        if (target.includes('active')) {
            e.currentTarget.closest('div').classList.remove('active');
        }
        else {
            e.currentTarget.closest('div').classList.add('active');
        }
    }


    const handleRequest = async (data) => {
        if (!data) return;

        setState((prev) => ({ ...prev, handling: true, idHandle: data }))

        try {
            const res = await PostRegisterProjectService({ projectId: data });
            if (res.status === 200) {
                await fetchData();
                startTransition(() => {
                    setState((prev) => ({ ...prev, message: { status: res.status, data: res.message || 'Successfully' }, handling: false, idHandle: null }));
                })
            }
            else {
                setState((prev) => ({ ...prev, message: { status: res.status, data: res.message || 'Something is wrong' }, handling: false, idHandle: null }));
            }
        }
        catch (err) {
            console.error(err);
            setState((prev) => ({ ...prev, message: { status: 500, data: err.message || 'Something is wrong' }, handling: false, idHandle: null }));
            throw new Error(err);
        }
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, error: null, pending: true }))
        fetchData();
    }

    const handleRedirect = () => {
        queryNavigate('home', { name: 'project' });
        redirect()
    }

    return (
        <div id="project">
            <div className="heading_project">
                <div className="input-search">
                    <input type="text" placeholder="Search project" />
                    <button className="filter">
                        <IoFilter />
                    </button>
                </div>
                <div className="handle_back">
                    <button className="back_btn" onClick={handleRedirect}>
                        <h4>
                            Back
                        </h4>
                        <FaArrowRight />
                    </button>
                </div>
            </div>
            <div className="content_project">
                <div className="method_project">
                    <div className="heading">
                        <FaUser />
                        <h3>Self</h3>
                    </div>
                    <div className="content">
                        {
                            state.pending ?
                                <LoadingContent />
                                :
                                state.error ?
                                    <p>Something is wrong</p>
                                    :
                                    state.data.self && state.data.self.length > 0 ? (
                                        state.data.self.map((item, index) => (
                                            <div className="item" key={index}>
                                                <div className="heading_item">
                                                    <span>{item.status}</span>
                                                    <h4>{item.name}</h4>
                                                </div>
                                                <div className="content_item">
                                                    <p>{item.description}</p>
                                                    <div className="info">
                                                        <h5>Instructor:</h5>
                                                        <p>{item.instructor}</p>
                                                    </div>
                                                    <div className="info_dropdown">
                                                        <button onClick={handleDropdown}>
                                                            Requirements:
                                                            <IoMdArrowDropdown />
                                                        </button>
                                                        <p>{item.requirements}</p>
                                                    </div>
                                                </div>
                                                <div className="footer_item">
                                                    <div className="info">
                                                        <h5>Difficulty:</h5>
                                                        <p>{item.difficulty}</p>
                                                    </div>
                                                    <button
                                                        style={item.status === 'Open' && { background: 'var(--color_blue)' } || item.status === 'Closed' && { background: 'var(--color_red)', cursor: 'not-allowed' } || item.status === 'Comming soon' && { background: 'var(--color_black)', cursor: 'not-allowed' }}
                                                        disabled={item.status !== 'Open' || state.handling}
                                                        onClick={() => handleRequest(item.id)}
                                                    >
                                                        {
                                                            (() => {
                                                                switch (item.status) {
                                                                    case 'Open':
                                                                        return state.idHandle === item.id ?
                                                                            <FaCircleNotch className="handling" fontSize={20} />
                                                                            :
                                                                            <>Join</>;
                                                                    case 'Closed':
                                                                        return <>Closed</>;
                                                                    case 'Comming soon':
                                                                        return <>Comming soon...</>;
                                                                    default:
                                                                        return <>Something wrong</>;
                                                                }
                                                            })()
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )
                                        :
                                        <p>No project</p>
                        }
                    </div>
                </div>
                <div className="method_project">
                    <div className="heading">
                        <FaUserGroup />
                        <h3>Team</h3>
                    </div>
                    <div className="content">
                        {
                            state.pending ?
                                <LoadingContent />
                                :
                                state.error ?
                                    <p>Something is wrong</p>
                                    :
                                    state.data.team && state.data.team.length > 0 ? (
                                        state.data.team.map((item, index) => (
                                            <div className="item" key={index}>
                                                <div className="heading_item">
                                                    <span>{item.status}</span>
                                                    <h4>{item.name}</h4>
                                                </div>
                                                <div className="content_item">
                                                    <p>{item.description}</p>
                                                    <div className="info">
                                                        <h5>Instructor:</h5>
                                                        <p>{item.instructor}</p>
                                                    </div>
                                                    <div className="info_dropdown">
                                                        <button onClick={handleDropdown}>
                                                            Requirements:
                                                            <IoMdArrowDropdown />
                                                        </button>
                                                        <p>{item.requirements}</p>
                                                    </div>
                                                </div>
                                                <div className="footer_item">
                                                    <div className="info">
                                                        <h5>Difficulty:</h5>
                                                        <p>{item.difficulty}</p>
                                                    </div>
                                                    <button
                                                        style={item.status === 'Open' && { background: 'var(--color_blue)' } || item.status === 'Closed' && { background: 'var(--color_red)', cursor: 'not-allowed' } || item.status === 'Comming soon' && { background: 'var(--color_black)', cursor: 'not-allowed' }}
                                                        disabled={item.status !== 'Open' || state.handling}
                                                        onClick={() => handleRequest(item.id)}
                                                    >
                                                        {
                                                            (() => {
                                                                switch (item.status) {
                                                                    case 'Open':
                                                                        return state.idHandle === item.id ?
                                                                            <FaCircleNotch className="handling" style={{ fontSize: '20px' }} />
                                                                            :
                                                                            <>Join</>;
                                                                    case 'Closed':
                                                                        return <>Closed</>;
                                                                    case 'Comming soon':
                                                                        return <>Comming soon...</>;
                                                                    default:
                                                                        return <>Something wrong</>;
                                                                }
                                                            })()
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )
                                        :
                                        <p>No project</p>
                        }
                    </div>
                </div>
                {
                    state.error && <ErrorReload data={state.error} refetch={refetchData} />
                }
            </div>
        </div >
    )
}
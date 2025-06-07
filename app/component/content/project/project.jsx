import { useState, useEffect } from "react"

import MyProjectService from "@/app/services/getService/myProjectService";
import { useRouterActions } from "@/app/router/router";

import { ErrorReload } from "../../ui/error";
import { LoadingContent, LoadingRedirect } from "../../ui/loading";

import { IoFilter, IoEyeOff } from "react-icons/io5";
import { MdAddCircleOutline } from "react-icons/md";
import { IoCloseSharp } from "react-icons/io5";

export default function Project({ redirect }) {
    const { navigateToProject } = useRouterActions();

    const [state, setState] = useState({
        data: [],
        pending: true,
        error: null,
    })

    const fetchData = async () => {
        try {
            const res = await MyProjectService('CD01');
            if (res.status === 200) {
                setState((prev) => ({ ...prev, data: res.data, pending: false }));
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }));
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message }, pending: false }));
            throw new Error(err);
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const handleRedirect = () => {
        redirect()
        navigateToProject();
    }

    return (
        <div id="myProject">
            <div className="heading-myProject">
                <div className="input-search">
                    <input type="text" placeholder="Search my project" />
                    <button className="filter">
                        <IoFilter />
                    </button>
                </div>
                <div className="handle-project">
                    <button id="project-btn" onClick={handleRedirect}>
                        <MdAddCircleOutline />
                        <span>
                            Add project
                        </span>
                    </button>
                </div>
            </div>
            <div className="project-list">
                {

                    state.pending ?
                        <LoadingContent />
                        :
                        state.error ?
                            <ErrorReload data={state.error || { status: 500, message: "Something is wrong" }} refetch={fetchData} />
                            :
                            state.data && state.data.length > 0 ?
                                state.data.map((item, index) => (
                                    <div className="item-project" key={index}>
                                        <div className="heading-item">
                                            <div className="item">
                                                <span>{item.method}</span>
                                                <h3>{item.name}</h3>
                                            </div>
                                            <div className="status">
                                                <span>Status</span>
                                                <p>{item.status}</p>
                                            </div>
                                        </div>
                                        <div className="description">
                                            <h4>Description</h4>
                                            <p>{item.description}</p>
                                        </div>
                                        <div className="handle-project">
                                            <div className="table-handle">
                                                <button className="delete-btn">
                                                    <span>Delete</span>
                                                    <IoCloseSharp />
                                                </button>
                                                <button className="hidden-btn">
                                                    <span>Hidden</span>
                                                    <IoEyeOff />
                                                </button>
                                            </div>
                                            <button className="join-project">join</button>
                                        </div>
                                    </div>
                                ))
                                :
                                <p>No project can be found here!</p>
                }
            </div>
        </div>
    )
}
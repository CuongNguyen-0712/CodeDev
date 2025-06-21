import { useState, useEffect, useTransition } from "react"

import MyProjectService from "@/app/services/getService/myProjectService";
import DeleteMyProjectService from "@/app/services/deleteService/myProjectService";
import { useRouterActions } from "@/app/router/router";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";

import { IoFilter, IoEyeOff } from "react-icons/io5";
import { MdAddCircleOutline } from "react-icons/md";
import { IoCloseSharp } from "react-icons/io5";
import { FaCircleNotch } from "react-icons/fa"
import { startTransition } from "react";

export default function Project({ redirect }) {
    const { navigateToProject } = useRouterActions();

    const [state, setState] = useState({
        data: [],
        pending: true,
        handleId: null,
        handling: false,
        message: null,
        error: null,
    })

    const fetchData = async () => {

        try {
            const res = await MyProjectService();
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


    const handleDelete = async (id) => {
        if (!id) return;

        setState((prev) => ({ ...prev, handleId: id, handling: true }));

        try {
            const res = await DeleteMyProjectService(id);
            if (res.status === 200) {
                await fetchData();
                startTransition(() => {
                    setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: false, handleId: null }));
                })
            }
            else {
                setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: false, handleId: null }));
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: false, handleId: null }));
            throw new Error(err);
        }
    }

    const refetchData = () => {
        setState((prev) => ({ ...prev, data: [], pending: true }));
        fetchData();
    }

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
                            <ErrorReload data={state.error || { status: 500, message: "Something is wrong" }} refetch={refetchData} />
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
                                                <button className="delete-btn" onClick={() => handleDelete(item.id)}>
                                                    {
                                                        state.handleId === item.id && state.handling ?
                                                            <FaCircleNotch className="handling" fontSize={18} />
                                                            :
                                                            <>
                                                                <span>Delete</span>
                                                                <IoCloseSharp />
                                                            </>
                                                    }
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
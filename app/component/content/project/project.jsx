import { useState, useEffect } from "react"
import { useSize } from "@/app/contexts/sizeContext";

import { LoadingContent } from "../../ui/loading";
import MyProjectService from "@/app/services/getService/myProjectService";

import { IoFilter, IoEyeOff, IoTrashBin } from "react-icons/io5";
import { MdAddCircleOutline } from "react-icons/md";
import { IoCloseSharp } from "react-icons/io5";

export default function Project() {
    const [pending, setPending] = useState(true)
    const [project, setProject] = useState([])
    const [error, setError] = useState(null)
    const { size } = useSize();

    const fetchData = async () => {
        try {
            const res = await MyProjectService('CD01');
            if (res.status === 200) {
                setProject(res.data);
                setPending(false);
            }
            else {
                setError({ status: res.status, message: res.message || "Something went wrong" });
                setPending(false);
            }
        }
        catch (err) {
            setPending(false);
            setError({ status: 500, message: err?.message || "Failed to fetch data" });
            throw new Error(err);
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
                    !error ?
                        <div id="myProject">
                            <div className="heading-myProject">
                                <div className="input-search">
                                    <input type="text" placeholder="Search my project" />
                                    <button className="filter">
                                        <IoFilter />
                                    </button>
                                </div>
                                <div className="handle-project">
                                    <button id="project-btn">
                                        <MdAddCircleOutline />
                                        <span>
                                            Add project
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <div className="project-list">
                                {project && project.length > 0 ?
                                    project.map((item, index) => (
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
                                                <button className="join-project">Join</button>
                                                {size.width < 425 ?
                                                    <div className="table-handle">
                                                        <button className="delete-btn">
                                                            <IoCloseSharp />
                                                        </button>
                                                        <button className="hidden-btn">
                                                            <IoEyeOff />
                                                        </button>
                                                    </div>
                                                    :
                                                    <div className="other-handle">
                                                        <button className="hidden-btn">
                                                            <IoEyeOff />
                                                        </button>
                                                        <button className="delete-btn">
                                                            <IoTrashBin />
                                                        </button>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    ))
                                    :
                                    <p>No project can be seen here, would you like to join one ?</p>
                                }
                            </div>
                        </div>
                        :
                        error && <p>Error {error.status}: {error.message}. Click here to reload</p>
            }
        </>

    )
}
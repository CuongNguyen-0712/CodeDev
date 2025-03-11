import { useState, useEffect } from "react"

import axios from "axios"

import { LoadingContent } from "../../ui/loading"

import { IoFilter, IoEyeOff, IoTrashBin } from "react-icons/io5";
import { MdAddCircleOutline } from "react-icons/md";

export default function Project() {
    const [pending, setPending] = useState(true)
    const [project, setProject] = useState([])
    const [visible, setVisible] = useState(true)

    const fetchData = async () => {
        try {
            const res = await axios.get('/api/myProject');
            if (res.status === 200) {
                const project = res.data;
                setProject(project);
                setPending(false);
            }
            else if (res.status === 500) {
                setProject({ heading: 'Server is error', content: 'Failed to load content' })
                setPending(false);
            }
        }
        catch (err) {
            setPending(false);
            setProject({ heading: 'Something is wrong', content: 'Failed to load content' })
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
                                    Add project
                                </button>
                            </div>
                        </div>
                        <div className="project-list">
                            {project.map((item, index) => (
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
                                        <div className="other-handle">
                                            <button className="hidden-btn">
                                                <IoEyeOff />
                                            </button>
                                            <button className="delete-btn">
                                                <IoTrashBin />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
            }
        </>

    )
}
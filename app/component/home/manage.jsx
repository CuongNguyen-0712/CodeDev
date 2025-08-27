import { useState, useEffect, startTransition } from "react";

import { IoClose } from "react-icons/io5";
import { CiEdit } from "react-icons/ci";
import { FaSave, FaHashtag } from "react-icons/fa";
import { TbCancel } from "react-icons/tb";
import { BiImport } from "react-icons/bi";
import { LiaExchangeAltSolid } from "react-icons/lia";

import { useQuery, useRouterActions } from "@/app/router/router";
import { usePathname } from "next/navigation";
import UpdateInfoService from "@/app/services/updateService/infoService";
import { deleteSession } from "@/app/lib/session";
import GetInfoService from "@/app/services/getService/infoService";
import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import AlertPush from "../ui/alert";

import Image from "next/image";
import Form from "next/form";

export default function Manage({ redirect }) {

    const [state, setState] = useState({
        data: null,
        update: null,
        error: null,
        modify: false,
        change: false,
        pending: true,
        handling: false,
        check: false,
        logout: false,
    })

    const [file, setFile] = useState({
        file: null,
        preview: null,
    });

    const [alert, setAlert] = useState(null);

    const { navigateToAuth } = useRouterActions();
    const queryNavigate = useQuery();

    const pathname = usePathname();

    const handleLogout = async (e) => {
        e.preventDefault();

        setState((prev) => ({ ...prev, logout: true }));

        try {
            const res = await deleteSession();
            if (res) {
                redirect();
                navigateToAuth();
            }
            else {
                setState((prev) => ({ ...prev, logout: false }));
            }
        } catch (error) {
            setState((prev) => ({ ...prev, logout: false }));
        }
    }

    const fetchData = async () => {
        try {
            const res = await GetInfoService();;
            if (res.status === 200) {
                setState((prev) => ({ ...prev, data: res.data[0], update: res.data[0], pending: false }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message } ?? { status: 500, message: 'Something is wrong !' }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message || 'Somthing is wrong !' }, pending: false }))
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleUpdate = async (e) => {
        e.preventDefault();

        const updateData = {
            ...state.update,
            image: file.file ? file.file.name : state.update.image
        }

        setState((prev) => ({ ...prev, change: false, handling: true }))

        try {
            const res = await UpdateInfoService(updateData)

            if (res.status === 200) {
                await fetchData();
                startTransition(() => {
                    queryNavigate(pathname, { update: true })
                    setState((prev) => ({ ...prev, handling: false, modify: false }))
                    setFile({ file: null, preview: null })
                    setAlert({ status: 200, message: res.message })
                })
            }
            else {
                setState((prev) => ({ ...prev, handling: false }))
                setAlert({ status: res.status || 500, message: res.message })
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, handling: false }))
            setAlert({ status: 500, message: err.message })
        }
    }

    const handleChange = (e) => {
        e.preventDefault();

        const { name, value } = e.target;

        setState((prev) => ({
            ...prev,
            update: {
                ...prev.update,
                [name]: value
            }
        }))
    }

    const handleChangeImage = (e) => {
        const fileInput = e.target.files[0];
        if (fileInput) {
            setFile({
                file: fileInput,
                preview: URL.createObjectURL(fileInput)
            });
            setState((prev) => ({ ...prev, change: true }))
        }
        else {
            setFile({
                file: null,
                preview: null
            });
            setState((prev) => ({ ...prev, change: false }))
        }
    }

    const handleCancelChange = () => {
        setFile({ file: null, preview: null })
        setState((prev) => ({ ...prev, change: false }))
    }

    return (
        <Form id="manage_panel" onSubmit={handleUpdate}>
            <div className="heading_manage">
                <Image src={'/image/static/logo.svg'} alt='logo' width={25} height={25} />
                <h2>Management</h2>
            </div>
            <div className="content_manage">
                {
                    state.pending ?
                        <LoadingContent />
                        :
                        (state.error && state.data === null) ?
                            <ErrorReload status={state.error.status || 500} message={state.error.message || 'Something is wrong !'} />
                            :
                            <>
                                <div className="info-manage">
                                    <div className="beside">
                                        <div className="header_beside">
                                            <div id="myAvatar">
                                                <Image src={file.preview || state.data.image || '/image/default.svg'} alt='avatar' width={100} height={100} priority />
                                            </div>
                                            <div className="image-btns">
                                                <button
                                                    type="button"
                                                    id="import_image"
                                                >
                                                    {
                                                        !file.file ?
                                                            <>
                                                                <BiImport />
                                                                Import
                                                            </>
                                                            :
                                                            <>
                                                                <LiaExchangeAltSolid />
                                                                Change
                                                            </>
                                                    }
                                                    <input type="file" name="file" accept="image/*" id="file" onChange={(e) => handleChangeImage(e)} disabled={state.handling} />
                                                </button>
                                                <button type="button" id="cancel_handle" style={!file.file ? { display: 'none' } : { display: 'flex' }} onClick={handleCancelChange}>
                                                    <TbCancel />
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                        <div className="footer_beside">
                                            <h3>Stats</h3>
                                            <p>
                                                <span>
                                                    <strong>
                                                        Rank:
                                                    </strong>
                                                    {state.data.rank}
                                                </span>
                                                <span>
                                                    <strong>
                                                        Level:
                                                    </strong>
                                                    {state.data.level}
                                                </span>
                                                <span>
                                                    <strong>
                                                        Star:
                                                    </strong>
                                                    {state.data.star}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="info">
                                        <div className="info_container">
                                            <div className="item">
                                                <h2>{state.data.username}</h2>
                                                <p>
                                                    <FaHashtag />
                                                    <input type="text"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={state.modify ? state?.update?.nickname ?? '' : state?.data?.nickname ?? 'None'}
                                                        placeholder="Nickname"
                                                        id="nickname"
                                                        name="nickname"
                                                        onChange={handleChange}
                                                    />
                                                </p>
                                            </div>
                                            <div className="input_info">
                                                <div className="item">
                                                    <label htmlFor='surname'>Surname:</label>
                                                    <input type="text"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={state.modify ? state.update.surname : state.data.surname}
                                                        placeholder="Enter your surname"
                                                        id="surname"
                                                        name="surname"
                                                        onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="name">Name:</label>
                                                    <input type="text"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={state.modify ? state.update.name : state.data.name}
                                                        placeholder="Enter your name"
                                                        id="name"
                                                        name="name"
                                                        onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="email">Email:</label>
                                                    <input type="text"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={state.modify ? state.update.email : state.data.email}
                                                        placeholder="Enter your email"
                                                        id="email"
                                                        name="email"
                                                        onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="phone">Phone:</label>
                                                    <input type="text"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={state.modify ? state.update.phone : state.data.phone}
                                                        placeholder="Enter your phone"
                                                        id="phone"
                                                        name="phone"
                                                        onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="bio">Bio:</label>
                                                    <textarea
                                                        placeholder="Enter your bio"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={(state.modify ? state.update.bio : state.data.bio) || ''}
                                                        id="bio"
                                                        name="bio"
                                                        onChange={handleChange}
                                                    />
                                                </div>
                                            </div>
                                            <div id="modify_btns">
                                                <button type="button" id="edit_info" disabled={state.handling} onClick={() => setState((prev) => ({ ...prev, modify: !state.modify, update: state.modify ? state.data : state.update }))}>
                                                    {
                                                        state.modify ?
                                                            <>
                                                                <TbCancel />
                                                                Cancel
                                                            </>
                                                            :
                                                            <>
                                                                <CiEdit />
                                                                Edit
                                                            </>
                                                    }
                                                </button>
                                                <button type="submit" disabled={!(state.modify || state.change) || state.handling} style={{ cursor: !(state.modify || state.change) || state.handling ? 'not-allowed' : 'pointer' }} id="save_info">
                                                    {
                                                        state.handling ?
                                                            <LoadingContent scale={0.4} color="var(--color_white)" />
                                                            :
                                                            <>
                                                                <FaSave />
                                                                Save
                                                            </>
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                }
            </div>
            <div className="footer-manage">
                <button type="button" id="change-account">
                    Change account
                </button>
                <button type="button" id="logout" onClick={handleLogout}>
                    {
                        state.logout ?
                            <LoadingContent scale={0.4} color="var(--color_white)" />
                            :
                            <>
                                Logout
                            </>
                    }
                </button>
            </div>
            <button type="button" id="cancel-manage" onClick={() => queryNavigate(pathname, { manage: false, update: false })}>
                <IoClose />
            </button>
            {
                alert && <AlertPush status={alert.status} message={alert.message} reset={() => setAlert(null)} />
            }
        </Form >
    )
}
import { useState, useEffect, startTransition } from "react";

import { IoClose } from "react-icons/io5";
import { FaSave, FaHashtag } from "react-icons/fa";
import { TbCancel } from "react-icons/tb";
import { MdFileDownload, MdErrorOutline } from "react-icons/md";
import { LiaExchangeAltSolid } from "react-icons/lia";

import { usePathname } from "next/navigation";

import GetInfoService from "@/app/services/getService/infoService";
import UpdateInfoService from "@/app/services/updateService/infoService";
import { useQuery, useRouterActions } from "@/app/router/router";
import { deleteSession } from "@/app/lib/session";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import AlertPush from "../ui/alert";

import { UpdateInfoDefinition } from "@/app/lib/definition";

import useKey from "@/app/hooks/useKey";

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
        definition: {},
        logout: false,
    })

    const [file, setFile] = useState({
        file: null,
        preview: null,
    });

    const [alert, setAlert] = useState(null);

    const pathname = usePathname();
    const queryNavigate = useQuery();
    const { navigateToAuth } = useRouterActions();

    useKey({ key: 'Escape', param: 'manage' });

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
            const res = await GetInfoService();
            if (res.status === 200) {
                setState((prev) => ({ ...prev, data: res.data[0], update: res.data[0], pending: false }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status || 500, message: res.message || 'Something is wrong !' }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message || 'Somthing is wrong !' }, pending: false }))
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const handleUpdate = async (e) => {
        e.preventDefault();

        const updateData = {
            ...state.update,
            image: file.file ? file.file.name : state.update.image
        }

        if (JSON.stringify(state.data) === JSON.stringify(updateData)) {
            setState((prev) => ({ ...prev, change: false, modify: false }))
            setAlert({ message: 'Nothing can be update' })
            return;
        }

        if (Object.entries(state.definition).length > 0) {
            setAlert({ status: 500, message: 'Update infomation failed' })
            return;
        }

        setState((prev) => ({
            ...prev,
            update: updateData,
            change: false,
            handling: true
        }))

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
        const { errors } = UpdateInfoDefinition({ data: { [name]: state.data[name] }, dataUpdate: { [name]: value } })

        setState((prev) => {
            const { [name]: removed, ...rest } = prev.definition || {};

            return {
                ...prev,
                update: {
                    ...prev.update,
                    [name]: value
                },
                definition: errors?.[name] ?
                    { ...prev.definition, [name]: errors[name] }
                    :
                    rest
            }
        })
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
                        state.error ?
                            <ErrorReload status={state.error?.status || 500} message={state.error?.message || 'Something is wrong !'} />
                            :
                            state.data ?
                                <div className="info-manage">
                                    <div className="beside">
                                        <div className="header_beside">
                                            <div id="myAvatar">
                                                <Image src={file.preview || state.data.image || '/image/default.svg'} alt='avatar' height={80} width={80} priority />
                                            </div>
                                            <div className="image-btns">
                                                <button
                                                    type="button"
                                                    id="import_image"
                                                >
                                                    {
                                                        !file.file ?
                                                            <>
                                                                <MdFileDownload fontSize={15} />
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
                                            <h4>Stats</h4>
                                            <p>
                                                <span>
                                                    <strong>
                                                        Level:
                                                    </strong>
                                                    {state.data?.level ?? '-'}
                                                </span>
                                                <span>
                                                    <strong>
                                                        Rank:
                                                    </strong>
                                                    {state.data?.rank ?? '-'}
                                                </span>
                                                <span>
                                                    <strong>
                                                        Star:
                                                    </strong>
                                                    {state.data?.star ?? '-'}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="info">
                                        <div className="info_container">
                                            <div className="heading_info">
                                                <div className="beside_info">
                                                    <h2>{state.data?.username ?? 'Unknown'}</h2>
                                                    <p>
                                                        <FaHashtag />
                                                        <input type="text"
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={state.modify ? state.update?.nickname ?? '' : state.data?.nickname ?? 'None'}
                                                            placeholder="Nickname"
                                                            name="nickname"
                                                            onChange={handleChange}
                                                        />
                                                    </p>
                                                </div>
                                                <div id="modify_btns">
                                                    <button type="button" id="edit_info" disabled={state.handling} onClick={() => setState((prev) => ({ ...prev, modify: !state.modify, update: state.modify ? state.data : state.update, definition: null }))}>
                                                        {
                                                            state.modify ?
                                                                <>
                                                                    Cancel
                                                                </>
                                                                :
                                                                <>
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
                                            <div className="input_info">
                                                <div className="item">
                                                    <label htmlFor='surname'>Surname:</label>
                                                    <div className="input_item">
                                                        <input type="text"
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={state.modify ? state.update.surname : state.data.surname}
                                                            placeholder="Enter your surname"
                                                            name="surname"
                                                            onChange={handleChange}
                                                        />
                                                        {
                                                            (state.definition && state.definition?.surname) &&
                                                            <div className="error_input">
                                                                <MdErrorOutline fontSize={20} color='var(--color_red_dark)' />
                                                                <p>{state.definition?.surname ?? ''}</p>
                                                            </div>
                                                        }
                                                    </div>
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="name">Name:</label>
                                                    <div className="input_item">
                                                        <input
                                                            type="text"
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={state.modify ? state.update.name : state.data.name}
                                                            placeholder="Enter your name"
                                                            name="name"
                                                            onChange={handleChange}
                                                        />
                                                        {
                                                            (state.definition && state.definition?.name) &&
                                                            <div className="error_input">
                                                                <MdErrorOutline fontSize={20} color='var(--color_red_dark)' />
                                                                <p>{state.definition?.name ?? ''}</p>
                                                            </div>
                                                        }
                                                    </div>
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="email">Email:</label>
                                                    <div className="input_item">
                                                        <input type="text"
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={state.modify ? state.update.email : state.data.email}
                                                            placeholder="Enter your email"
                                                            name="email"
                                                            onChange={handleChange}
                                                        />
                                                        {
                                                            (state.definition && state.definition?.email) &&
                                                            <div className="error_input">
                                                                <MdErrorOutline fontSize={20} color='var(--color_red_dark)' />
                                                                <p>{state.definition?.email ?? ''}</p>
                                                            </div>
                                                        }
                                                    </div>
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="phone">Phone:</label>
                                                    <div className="input_item">
                                                        <input
                                                            type="text"
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={state.modify ? state.update.phone : state.data.phone}
                                                            placeholder="Enter your phone"
                                                            name="phone"
                                                            onChange={handleChange}
                                                        />
                                                        {
                                                            (state.definition && state.definition?.phone) &&
                                                            <div className="error_input">
                                                                <MdErrorOutline fontSize={20} color='var(--color_red_dark)' />
                                                                <p>{state.definition?.phone ?? ''}</p>
                                                            </div>
                                                        }
                                                    </div>
                                                </div>
                                                <div className="item">
                                                    <label htmlFor="bio">Bio:</label>
                                                    <textarea
                                                        placeholder="Enter your bio"
                                                        className={state.modify ? 'modify' : ''}
                                                        readOnly={!state.modify || state.handling}
                                                        value={(state.modify ? state.update.bio : state.data.bio) ?? ''}
                                                        name="bio"
                                                        onChange={handleChange}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                :
                                null
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
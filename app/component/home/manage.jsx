import { useState, useEffect, startTransition } from "react";

import { IoClose } from "react-icons/io5";
import { FaSave, FaHashtag } from "react-icons/fa";
import { MdFileDownload, MdErrorOutline } from "react-icons/md";
import { FaTrophy, FaStar, FaLink } from "react-icons/fa6";

import { usePathname } from "next/navigation";

import GetInfoService from "@/app/services/getService/infoService";
import UpdateInfoService from "@/app/services/updateService/infoService";
import { useQuery } from "@/app/router/router";
import { deleteSession } from "@/app/lib/session";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import AlertPush from "../ui/alert";

import { UpdateInfoDefinition } from "@/app/lib/definition";

import useKey from "@/app/hooks/useKey";
import useImagesValidator from "@/app/hooks/useImageValidator";

import Form from "next/form";
import Image from "next/image";

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
    })

    const [file, setFile] = useState({
        image: null,
        preview: null,
        loading: true,
    });

    const [alert, setAlert] = useState(null);

    const pathname = usePathname();
    const queryNavigate = useQuery();

    useKey({ key: 'Escape', param: 'manage' });
    const { finalUrl } = useImagesValidator(state.data?.image ? [state.data.image] : [], '/image/static/default.svg')

    const handleLogout = async (e) => {
        e.preventDefault();

        try {
            redirect();
            await deleteSession({ url: pathname });
        } catch (error) {
            console.error(error)
            redirect();
        }
    }

    const fetchData = async () => {
        try {
            const res = await GetInfoService();
            if (res.status === 200) {
                setState((prev) => ({
                    ...prev,
                    data: res.data[0],
                    update: res.data[0],
                    pending: false
                }))
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
            image: file.image ?? state.update.image
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
                setAlert({ status: res.status ?? 500, message: res.message ?? "Something is wrong, try again !" })
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

    const handleUpload = (e) => {
        e.preventDefault();

        const file = e.target.files[0];
        if (file) {
            setFile((prev) => ({
                ...prev,
                image: file,
                preview: URL.createObjectURL(file)
            }));
        }
        else {
            setFile({
                image: null,
                preview: null
            });
            setState((prev) => ({ ...prev, change: false }))
        }
    }

    const handleCancelPreview = () => {
        setFile({ image: null, preview: null })
        setState((prev) => ({ ...prev, change: false }))
    }

    const handleModify = () => {
        setState((prev) => ({
            ...prev,
            change: !prev.change,
            modify: !prev.modify,
            update: !prev.modify ? prev.data : prev.update,
            definition: {}
        }))

        setFile({
            image: null,
            preview: null
        })
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(window.location.href)
        setAlert({ status: 200, message: 'Your profile link has been copied' })
    }

    const refetchData = () => {
        setState((prev) => ({
            ...prev,
            error: null,
            pending: true
        }))
        fetchData();
    }

    useEffect(() => {
        setAlert(null)
    }, [alert])


    useEffect(() => {
        if (finalUrl) {
            setState((prev) => ({
                ...prev,
                data: {
                    ...prev.data,
                    image: finalUrl
                },
                update: {
                    ...prev.update,
                    image: finalUrl
                }
            }))
        }
        setFile((prev) => ({
            ...prev,
            loading: false
        }))
    }, [finalUrl])

    return (
        <Form id="manage_panel" onSubmit={handleUpdate}>
            <div className="heading_manage">
                <img src={'/image/static/logo.svg'} alt='logo' />
                <h2>Management</h2>
            </div>
            <div className="content_manage">
                <div className="beside">
                    <div className="beside_banner">
                        <h5>Achievement</h5>
                        <p>
                            Nothing to update
                        </p>
                    </div>
                </div>
                <div className="info_container">
                    {
                        state.pending ?
                            <LoadingContent />
                            :
                            state.error ?
                                <ErrorReload data={state.error} refetch={refetchData} />
                                :
                                state.data ?
                                    <>
                                        <div className="heading_info">
                                            <div className="beside_info">
                                                <div className="info_header">
                                                    <div className="user_banner">
                                                        <div className="image_banner">
                                                            <div className="image_wrapper" style={state.modify ? { pointerEvents: "all" } : { pointerEvents: 'none' }}>
                                                                {
                                                                    file.loading ?
                                                                        <LoadingContent scale={0.5} />
                                                                        :
                                                                        <>
                                                                            <Image src={file.preview || state.data.image} width={100} height={100} quality={100} alt="avatar" />
                                                                            <div className="image_import">
                                                                                <button
                                                                                    type="button"
                                                                                    id="import_image"
                                                                                >
                                                                                    <MdFileDownload fontSize={20} />
                                                                                </button>
                                                                                <input
                                                                                    type="file"
                                                                                    name="file"
                                                                                    accept="image/*"
                                                                                    id="file"
                                                                                    disabled={state.handling || !state.modify}
                                                                                    onChange={handleUpload}
                                                                                />
                                                                            </div>
                                                                            {
                                                                                (file.preview && !state.handling) &&
                                                                                <button type='button' id="cancel_preview" onClick={handleCancelPreview}>
                                                                                    <IoClose fontSize={14} />
                                                                                </button>
                                                                            }
                                                                        </>
                                                                }
                                                            </div>
                                                        </div>
                                                        <div className="info_banner">
                                                            <div className="info_wrapper">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopy()}
                                                                >
                                                                    <FaLink />
                                                                </button>
                                                                <h2>
                                                                    {state.data?.username ?? '-'}
                                                                </h2>
                                                            </div>
                                                            <p>
                                                                {state.data?.level ?? "-"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="stats_banner">
                                                        <div className="banner">
                                                            <span>
                                                                Star
                                                            </span>
                                                            <p>
                                                                {state.data?.star ?? "-"}
                                                                <FaStar color="var(--color_yellow)" />
                                                            </p>
                                                        </div>
                                                        <div className="banner">
                                                            <span>
                                                                Rank
                                                            </span>
                                                            <p>
                                                                {state.data?.rank ?? "-"}
                                                                <FaTrophy color="var(--color_orange)" />
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
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
                                                <button
                                                    type="button"
                                                    id="edit_info"
                                                    disabled={state.handling}
                                                    onClick={handleModify}
                                                >
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
                                                            <LoadingContent scale={0.5} color="var(--color_white)" />
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
                                                        className={state.modify ? state.definition?.surname ? "has_error" : "modify" : ''}
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
                                                        className={state.modify ? state.definition?.name ? "has_error" : "modify" : ''}
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
                                                        className={state.modify ? state.definition?.email ? "has_error" : "modify" : ''}
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
                                                        className={state.modify ? state.definition?.phone ? "has_error" : "modify" : ''}
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
                                    </>
                                    :
                                    null
                    }
                </div>
            </div>
            <div className="footer-manage">
                <button type="button" id="change-account">
                    Change account
                </button>
                <button type="button" id="logout" onClick={handleLogout}>
                    Logout
                </button>
            </div>
            <button type="button" id="cancel-manage" onClick={() => queryNavigate(pathname, { manage: false, update: false })}>
                <IoClose />
            </button>
            <AlertPush status={alert?.status} message={alert?.message} reset={() => setAlert(null)} />
        </Form >
    )
}
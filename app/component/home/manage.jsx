'use client'
import { useState, useEffect, startTransition, useRef } from "react";

import { IoClose } from "react-icons/io5";
import { FaSave, FaHashtag } from "react-icons/fa";
import { MdFileDownload, MdErrorOutline, MdOutlineZoomOutMap } from "react-icons/md";
import { FaTrophy, FaStar, FaLink } from "react-icons/fa6";

import { usePathname, useSearchParams } from "next/navigation";

import GetInfoService from "@/app/services/getService/infoService";
import UpdateInfoService from "@/app/services/updateService/infoService";
import { useQuery } from "@/app/router/router";
import { deleteSession } from "@/app/lib/session";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";

import { UpdateInfoDefinition } from "@/app/lib/definition";

import useKey from "@/app/hooks/useKey";
import useImagesValidator from "@/app/hooks/useImageValidator";

import Form from "next/form";
import Image from "next/image";

export default function Manage({ redirect, alert }) {
    useKey({ key: 'Escape', param: 'manage' });
    const rangeRef = useRef(null)

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
        zoom: false,
        zoom_value: 1,
        loading: true,
    });

    const pathname = usePathname();
    const params = useSearchParams();
    const manage = params.get('manage');

    const queryNavigate = useQuery();

    const { finalUrl } = useImagesValidator(state.data?.image ? [state.data.image] : [], '/image/static/default.svg')

    const handleLogout = async (e) => {
        e.preventDefault();

        try {
            redirect(true);
            await deleteSession({ url: pathname });
        } catch (error) {
            console.error(error)
            redirect(false);
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
            alert(0, 'Nothing can be update')
            return;
        }

        if (Object.entries(state.definition).length > 0) {
            alert(0, 'Please fix the errors before submit')
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
                    alert(200, res.message)
                })
            }
            else {
                setState((prev) => ({ ...prev, handling: false }))
                alert(res.status, res.message || 'Failed to update your information')
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, handling: false }))
            alert(500, err.message || 'Failed to update your information')
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
                preview: URL.createObjectURL(file),
                zoom_value: 1
            }));
        }
        else {
            setFile({
                image: null,
                preview: null,
                zoom_value: 1
            });
            setState((prev) => ({ ...prev, change: false }))
        }
    }

    const handleCancelPreview = () => {
        setFile({ image: null, preview: null, zoom_value: 1 });
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

        setFile((prev) => ({
            ...prev,
            image: null,
            preview: null,
            zoom_value: 1
        }))
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(window.location.href)
        alert(200, 'Your profile link has been copied')
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
        const range = rangeRef.current;
        if (range) {
            const percentage = ((file.zoom_value - range.min) / (range.max - range.min)) * 100;
            range.style.background = `linear-gradient(to right, var(--color_black) 0%, var(--color_black) ${percentage}%, var(--color_white) ${percentage}%, var(--color_white) 100%)`;
        }
    }, [file.zoom_value, file.zoom]);

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

    return manage && (
        <>
            <div
                className='manage_container'
                style={{
                    overflowY: file.zoom ? 'hidden' : 'auto'
                }}
            >
                <Form id="manage_panel" onSubmit={handleUpdate}>
                    <div className="heading_manage">
                        <img src={'/image/static/logo.svg'} alt='logo' />
                        <h2>Account Settings</h2>
                        <button type="button" id="cancel-manage" onClick={() => queryNavigate(pathname, { manage: null, update: null })}>
                            <IoClose />
                        </button>
                    </div>

                    <div className="content_manage">
                        {
                            state.pending ?
                                <LoadingContent />
                                :
                                state.error ?
                                    <ErrorReload data={state.error} refetch={refetchData} />
                                    :
                                    state.data ?
                                        <>
                                            {/* Profile Card Section */}
                                            <div className="profile_card">
                                                <div className="profile_avatar">
                                                    <div className="image_wrapper">
                                                        {
                                                            file.loading ?
                                                                <LoadingContent scale={0.5} />
                                                                :
                                                                <>
                                                                    <Image src={file.preview || state.data.image} width={120} height={120} quality={100} alt="avatar" />
                                                                    <div className="image_actions">
                                                                        {
                                                                            state.modify &&
                                                                            <div className="image_import">
                                                                                <button type="button" id="import_image">
                                                                                    <MdFileDownload fontSize={18} />
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
                                                                        }
                                                                        <button type='button' id="zoom_image" onClick={() => setFile((prev) => ({ ...prev, zoom: true }))}>
                                                                            <MdOutlineZoomOutMap fontSize={18} />
                                                                        </button>
                                                                    </div>
                                                                    {
                                                                        (file.preview && !state.handling) &&
                                                                        <button type='button' id="cancel_preview" onClick={handleCancelPreview}>
                                                                            <IoClose fontSize={12} />
                                                                        </button>
                                                                    }
                                                                </>
                                                        }
                                                    </div>
                                                </div>

                                                <div className="profile_info">
                                                    <div className="profile_name">
                                                        <h3>{state.data?.username ?? '-'}</h3>
                                                        <button type="button" className="copy_link" onClick={() => handleCopy()}>
                                                            <FaLink fontSize={12} />
                                                        </button>
                                                    </div>
                                                    <span className="profile_level">{state.data?.level ?? "-"}</span>
                                                    <div className="profile_nickname">
                                                        <FaHashtag fontSize={12} />
                                                        <input
                                                            type="text"
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={state.modify ? state.update?.nickname ?? '' : state.data?.nickname ?? 'None'}
                                                            placeholder="Nickname"
                                                            name="nickname"
                                                            onChange={handleChange}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="profile_stats">
                                                    <div className="stat_item">
                                                        <FaStar fontSize={16} color="var(--color_yellow)" />
                                                        <div className="stat_content">
                                                            <span className="stat_value">{state.data?.star ?? "-"}</span>
                                                            <span className="stat_label">Stars</span>
                                                        </div>
                                                    </div>
                                                    <div className="stat_item">
                                                        <FaTrophy fontSize={16} color="var(--color_orange)" />
                                                        <div className="stat_content">
                                                            <span className="stat_value">{state.data?.rank ?? "-"}</span>
                                                            <span className="stat_label">Rank</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Form Section */}
                                            <div className="form_section">
                                                <div className="form_header">
                                                    <h4>Personal Information</h4>
                                                    <div className="form_actions">
                                                        <button
                                                            type="button"
                                                            id="edit_info"
                                                            disabled={state.handling}
                                                            onClick={handleModify}
                                                        >
                                                            {state.modify ? 'Cancel' : 'Edit'}
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={!(state.modify || state.change) || state.handling}
                                                            id="save_info"
                                                        >
                                                            {
                                                                state.handling ?
                                                                    <LoadingContent scale={0.4} color="var(--color_white)" />
                                                                    :
                                                                    <>
                                                                        <FaSave fontSize={14} />
                                                                        Save
                                                                    </>
                                                            }
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="form_grid">
                                                    <div className="form_item">
                                                        <label htmlFor='surname'>Surname</label>
                                                        <div className="input_wrapper">
                                                            <input
                                                                type="text"
                                                                className={state.modify ? state.definition?.surname ? "has_error modify" : "modify" : ''}
                                                                readOnly={!state.modify || state.handling}
                                                                value={(state.modify ? state.update?.surname : state.data?.surname) ?? ''}
                                                                placeholder="Enter surname"
                                                                name="surname"
                                                                onChange={handleChange}
                                                            />
                                                            {
                                                                state.definition?.surname &&
                                                                <div className="error_tooltip">
                                                                    <MdErrorOutline fontSize={18} color='var(--color_red)' />
                                                                    <span>{state.definition.surname}</span>
                                                                </div>
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="form_item">
                                                        <label htmlFor="name">Name</label>
                                                        <div className="input_wrapper">
                                                            <input
                                                                type="text"
                                                                className={state.modify ? state.definition?.name ? "has_error modify" : "modify" : ''}
                                                                readOnly={!state.modify || state.handling}
                                                                value={(state.modify ? state.update?.name : state.data?.name) ?? ''}
                                                                placeholder="Enter name"
                                                                name="name"
                                                                onChange={handleChange}
                                                            />
                                                            {
                                                                state.definition?.name &&
                                                                <div className="error_tooltip">
                                                                    <MdErrorOutline fontSize={18} color='var(--color_red)' />
                                                                    <span>{state.definition.name}</span>
                                                                </div>
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="form_item full_width">
                                                        <label htmlFor="email">Email</label>
                                                        <div className="input_wrapper">
                                                            <input
                                                                type="text"
                                                                className={state.modify ? state.definition?.email ? "has_error modify" : "modify" : ''}
                                                                readOnly={!state.modify || state.handling}
                                                                value={(state.modify ? state.update?.email : state.data?.email) ?? ''}
                                                                placeholder="Enter email"
                                                                name="email"
                                                                onChange={handleChange}
                                                            />
                                                            {
                                                                state.definition?.email &&
                                                                <div className="error_tooltip">
                                                                    <MdErrorOutline fontSize={18} color='var(--color_red)' />
                                                                    <span>{state.definition.email}</span>
                                                                </div>
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="form_item full_width">
                                                        <label htmlFor="phone">Phone</label>
                                                        <div className="input_wrapper">
                                                            <input
                                                                type="text"
                                                                className={state.modify ? state.definition?.phone ? "has_error modify" : "modify" : ''}
                                                                readOnly={!state.modify || state.handling}
                                                                value={(state.modify ? state.update?.phone : state.data?.phone) ?? ''}
                                                                placeholder="Enter phone"
                                                                name="phone"
                                                                onChange={handleChange}
                                                            />
                                                            {
                                                                state.definition?.phone &&
                                                                <div className="error_tooltip">
                                                                    <MdErrorOutline fontSize={18} color='var(--color_red)' />
                                                                    <span>{state.definition.phone}</span>
                                                                </div>
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="form_item full_width">
                                                        <label htmlFor="bio">Bio</label>
                                                        <textarea
                                                            placeholder="Tell us about yourself..."
                                                            className={state.modify ? 'modify' : ''}
                                                            readOnly={!state.modify || state.handling}
                                                            value={(state.modify ? state.update.bio : state.data.bio) ?? ''}
                                                            name="bio"
                                                            onChange={handleChange}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                        :
                                        null
                        }
                    </div>

                    <div className="footer_manage">
                        <button type="button" id="change_account">
                            Change Account
                        </button>
                        <button type="button" id="logout" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </Form>
            </div>
            {file.zoom &&
                <div id="zoom_overlay">
                    <div className="zoom_container" style={{ transform: `scale(${file.zoom_value})` }}>
                        <Image
                            src={file.preview || state.data?.image}
                            alt='avatar_zoom'
                            fill
                            objectFit="cover"
                            quantity={100}
                            unoptimized
                        />
                    </div>
                    <button type="button" id="close_zoom" onClick={() => setFile((prev) => ({ ...prev, zoom: false }))}>
                        <IoClose fontSize={30} color="var(--color_white)" />
                    </button>
                    <input
                        type="range"
                        id="zoom_range"
                        min="1"
                        max="3"
                        step={0.01}
                        value={file.zoom_value}
                        ref={rangeRef}
                        onChange={(e) => setFile(prev => ({ ...prev, zoom_value: parseFloat(e.target.value) }))}
                    />
                </div>
            }
        </>
    )
}
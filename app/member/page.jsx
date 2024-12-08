'use client'
import { useState, useEffect } from "react";

import RouterPush from "../router/router";

import Layout from "../component/feature/layout";
import CreateMember from "../component/member/createMember";
import TableFilter from "../component/member/tableFilter";
import TargetMember from "../component/member/targetMember";
import LoadingWait from "../component/feature/loadingWait";

import axios from "axios";

export default function Member() {

    const { navigateToCurrent } = RouterPush();

    const [target, setTarget] = useState({
        targetMember: {},
        targetIndex: null,
        isTarget: false,
    })

    const [isSwitchPath, setSwitchPath] = useState(false);

    if (isSwitchPath) return <LoadingWait />

    // if (isSwitchPath) return <LoadingWait />

    // const [search, setSearch] = useState({
    //     valueSearch: '',
    //     searching: false
    // })

    // const [target, setTarget] = useState({
    //     targetMember: {},
    //     targetIndex: null,
    // })

    // const [members, setMember] = useState({
    //     currentMembers: [],
    //     availableMember: [],
    //     membersFavor: [],
    //     membersRating: [],
    // });



    // useEffect(() => {
    //     const handler = setTimeout(() => {
    //         const updateMembers = HandleSearchMember({ value: search.valueSearch, members: members.currentMembers });
    //         setMember((prev) => ({ ...prev, availableMember: updateMembers }))
    //     }, 500)

    //     return () => {
    //         clearTimeout(handler)
    //     }
    // }, [search.valueSearch, members.availableMember])

    // useEffect(() => {
    //     setSearch((state) => ({ ...state, valueSearch: '' }))
    // }, [search.searching])

    return (
        <Layout children={
            <CreateMember handle={() => setFilter(!isFilter)} targetMember={(member) => setTarget((prev) => ({ ...prev, targetMember: member }))} />}
            onReturn={() => navigateToCurrent()}
        />
    )
}
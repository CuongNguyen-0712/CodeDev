import { useState, useEffect } from "react"
import { usePathname } from "next/navigation";

import useKey from "@/app/hooks/useKey";
import { useQuery } from "@/app/router/router";

import { IoSearch } from "react-icons/io5";
import { FaLink } from "react-icons/fa6";
import { IoIosArrowBack } from "react-icons/io";

import Form from "next/form"
import Link from "next/link";

export default function Search() {
    useKey({ key: 'Escape', param: 'search' });

    const queryNavigate = useQuery();
    const pathname = usePathname();

    const [state, setState] = useState({
        search: "",
        links: []
    })

    const submitSearch = (e) => {
        e.preventDefault();
        return;
    }

    useEffect(() => {
        fetch('/data/links.json')
            .then(res => res.json())
            .then(data => {
                setState(prev => ({
                    ...prev,
                    links: data
                }))
            });
    }, []);

    return (
        <div id="search_template">
            <Form
                id="form_search"
                onSubmit={submitSearch}
            >
                <button
                    type='button'
                    className="escape_search"
                    onClick={() => {
                        queryNavigate(pathname, { search: null })
                    }}
                >
                    <IoIosArrowBack fontSize={24} />
                </button>
                <div className="search_box">
                    <input
                        type="text"
                        name="search"
                        value={state.search}
                        placeholder="Type to search or / to link"
                        autoComplete="off"
                        onChange={(e) => setState({ ...state, search: e.target.value })}
                    />
                    <button type="submit">
                        <IoSearch fontSize={20} />
                    </button>
                </div>
            </Form>
            <section id="option_frame">
                <div className="list">
                    {
                        state.links.map((link, index) => (
                            <Link href={link.path || '#'} key={index}>
                                <h4>
                                    <FaLink />
                                    {link.name}
                                </h4>
                                <p>{link.description}</p>
                            </Link>
                        ))
                    }
                </div>
            </section>
        </div>
    )
}

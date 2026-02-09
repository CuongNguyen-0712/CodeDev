import { useState, useEffect, useMemo } from 'react';

import Form from 'next/form';

import { IoFilter, IoSearch, IoClose } from 'react-icons/io5';
import { FaRegCheckCircle } from 'react-icons/fa';
import { IoIosArrowDropdown } from "react-icons/io";
import { FaCheck } from "react-icons/fa6";
import { GrPowerReset } from "react-icons/gr";

import { LoadingContent } from './loading';

import { debounce } from 'lodash';

export default function Search({ data = [], submit, setSearch, setFilter, pending, defaultFilter = {} }) {
    const initialFilter = data.reduce((acc, field) => {
        acc[field.name] = defaultFilter?.[field.name] || [];
        return acc;
    }, {});

    const resetFilter = data.reduce((acc, field) => {
        acc[field.name] = [];
        return acc;
    }, {});

    const [state, setState] = useState({
        change: false,
        filter: initialFilter,
        search: '',
        pending: false,
    });

    const handleSetFilter = (e) => {
        e.stopPropagation();
        const { name, value } = e.target;

        setState((prev) => {
            const currentValues = prev.filter[name] || [];

            const updatedValues = currentValues.includes(value)
                ? currentValues.filter((v) => v !== value)
                : [...currentValues, value];

            return {
                ...prev,
                filter: {
                    ...prev.filter,
                    [name]: updatedValues,
                },
            };
        });
    };

    useEffect(() => {
        setSearch(state.search);
        setFilter(state.filter);
    }, [state.search]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setSearch(state.search);
        setFilter(state.filter);
        submit();
    }

    const handleDebounce = useMemo(() =>
        debounce((value) => {
            setState((prev) => ({ ...prev, search: value }));
        }, 500)
        , []);

    useEffect(() => {
        return () => {
            handleDebounce.cancel();
        };
    }, [handleDebounce]);

    const handleChange = (e) => {
        e.preventDefault();
        handleDebounce(e.target.value);
    };

    return (
        <Form className={`input_search ${state.change ? 'active' : ''}`} onSubmit={handleSubmit}>
            <div className='input_wrapper'>
                <input type="text" name="search" placeholder="Search your course" autoComplete="off" onChange={handleChange} />
                {
                    !state.change &&
                    <button
                        type='reset'
                        id='clear_search'
                        onClick={() => setState((prev) => ({ ...prev, search: '' }))}
                        disabled={pending}
                        style={{ display: state.search.length > 0 ? 'flex' : 'none' }}
                    >
                        <IoClose />
                    </button>
                }
                <button type="button" className="filter_btn" onClick={() => setState((prev) => ({ ...prev, change: !prev.change }))}>
                    {
                        state.change ?
                            <IoSearch fontSize={18} />
                            :
                            <IoFilter fontSize={18} />
                    }
                </button>
            </div>
            <div className="table_filter">
                <div className="content_table">
                    <div className="filter_container">
                        {
                            data.map((field, index) => (
                                <div className="filter_field" key={index}>
                                    <button
                                        type='button'
                                    >
                                        {(state.filter[field.name] && state.filter[field.name].length > 0) &&
                                            <span>
                                                {state.filter[field.name].length}
                                            </span>
                                        }
                                        {field.name}
                                        <IoIosArrowDropdown fontSize={18} />
                                    </button>
                                    <div className="table_field">
                                        {
                                            field.items.map((item, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    name={field.name}
                                                    value={item.value}
                                                    className="filter_value"
                                                    onClick={handleSetFilter}
                                                    disabled={pending}
                                                >
                                                    <FaCheck
                                                        color={state.filter[field.name] && state.filter[field.name].includes(item.value) ? 'var(--color_black)' : 'transparent'}
                                                        background={state.filter[field.name] && state.filter[field.name].includes(item.value) ? 'var(--color_black)' : 'transparent'}
                                                        fontSize={18}
                                                    />
                                                    {item.name}
                                                </button>
                                            ))
                                        }
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
                <div className="footer_table">
                    <button
                        type="submit"
                        disabled={pending}
                        id='apply_filter'
                    >
                        {
                            pending ?
                                <LoadingContent scale={0.5} color='var(--color_white)' />
                                :
                                <>
                                    <FaRegCheckCircle />
                                    Apply
                                </>
                        }
                    </button>
                    <button
                        type="button"
                        id='reset_filter'
                        onClick={() => setState((prev) => ({
                            ...prev,
                            filter: resetFilter,
                        }))}
                        disabled={pending}
                    >
                        <GrPowerReset fontSize={18} />
                    </button>
                </div>
            </div>
        </Form>
    )
}
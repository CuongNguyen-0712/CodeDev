import { useState, useEffect, useMemo } from 'react';

import Form from 'next/form';

import { IoSearch, IoClose, IoChevronDown, IoCheckmark } from 'react-icons/io5';
import { HiAdjustmentsHorizontal } from 'react-icons/hi2';
import { GrPowerReset } from "react-icons/gr";

import { LoadingContent } from './loading';

import { debounce } from 'lodash';

export default function SearchBar({ data = [], submit, setSearch, setFilter, pending, defaultFilter = {}, placeholderText = 'Search...', isFilter = true }) {
    const initialFilter = data.reduce((acc, field) => {
        acc[field.name] = defaultFilter?.[field.name] || [];
        return acc;
    }, {});

    const resetFilter = data.reduce((acc, field) => {
        acc[field.name] = [];
        return acc;
    }, {});

    const [state, setState] = useState({
        showFilter: false,
        filter: initialFilter,
        search: '',
        pending: false,
    });

    const [inputValue, setInputValue] = useState('');

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
        if (isFilter) {
            setFilter(state.filter);
        }
    }, [state.search]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setSearch(state.search);
        if (isFilter) {
            setFilter(state.filter);
        }
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
        setInputValue(e.target.value);
        handleDebounce(e.target.value);
    };

    const handleClearSearch = () => {
        setInputValue('');
        setState((prev) => ({ ...prev, search: '' }));
    };

    const totalActiveFilters = Object.values(state.filter).reduce((acc, arr) => acc + arr.length, 0);

    return (
        <Form className="search-bar" onSubmit={handleSubmit}>
            {/* Search Input */}
            <div className="search-input-wrapper">
                <span className="search-icon">
                    <IoSearch />
                </span>
                <input
                    type="text"
                    name="search"
                    placeholder={placeholderText}
                    autoComplete="off"
                    value={inputValue}
                    onChange={handleChange}
                />
                {inputValue.length > 0 && (
                    <button
                        type="button"
                        className="clear-btn"
                        onClick={handleClearSearch}
                        disabled={pending}
                    >
                        <IoClose />
                    </button>
                )}
                {
                    isFilter &&
                    <button
                        type="button"
                        className={`filter-toggle ${state.showFilter ? 'active' : ''}`}
                        onClick={() => setState((prev) => ({ ...prev, showFilter: !prev.showFilter }))}
                    >
                        <HiAdjustmentsHorizontal />
                        {totalActiveFilters > 0 && (
                            <span className="filter-badge">{totalActiveFilters}</span>
                        )}
                    </button>
                }
            </div>

            {/* Filter Panel */}
            {
                isFilter ?
                    <div className={`filter-panel ${state.showFilter ? 'active' : ''}`}>
                        <div className="filter-groups">
                            {data.map((field, index) => (
                                <div className="filter-group" key={index}>
                                    <button type="button" className="filter-group-btn">
                                        <span className="group-name">{field.name}</span>
                                        {state.filter[field.name]?.length > 0 && (
                                            <span className="group-count">{state.filter[field.name].length}</span>
                                        )}
                                        <IoChevronDown className="group-arrow" />
                                    </button>
                                    <div className="filter-dropdown">
                                        {field.items?.map((item, idx) => {
                                            const isSelected = state.filter[field.name]?.includes(item.value);
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    name={field.name}
                                                    value={item.value}
                                                    className={`filter-option ${isSelected ? 'selected' : ''}`}
                                                    onClick={handleSetFilter}
                                                    disabled={pending}
                                                >
                                                    <span className="option-checkbox">
                                                        {isSelected && <IoCheckmark />}
                                                    </span>
                                                    <span className="option-label">{item.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="filter-actions">
                            <button
                                type="submit"
                                className="btn-apply"
                                disabled={pending}
                            >
                                {pending ? (
                                    <LoadingContent scale={0.4} color='var(--color_white)' />
                                ) : (
                                    <>
                                        <IoCheckmark />
                                        Apply
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn-reset"
                                onClick={() => setState((prev) => ({
                                    ...prev,
                                    filter: resetFilter,
                                }))}
                                disabled={pending}
                            >
                                <GrPowerReset />
                            </button>
                        </div>
                    </div>
                    :
                    null
            }
        </Form>
    )
}
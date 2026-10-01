'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { IoSearch, IoClose, IoCheckmark } from 'react-icons/io5';
import { HiAdjustmentsHorizontal } from 'react-icons/hi2';
import { LoadingContent } from './loading';
import { debounce } from 'lodash';

export default function SearchBar({
    data = [],
    filter: propFilter,
    search: propSearch,
    value: propValue,
    resultsCount,
    setSearch,
    setFilter,
    pending = false,
    defaultFilter = {},
    placeholderText = 'Search...',
    placeholder,
    isFilter = true,
    onSubmit,
    submit,
    className = '',
}) {
    const filterFields = useMemo(() => (Array.isArray(data) ? data : []), [data]);

    const initialFilter = useMemo(() => {
        const base = {};
        for (const field of filterFields) {
            if (field?.name) {
                const def = defaultFilter?.[field.name];
                base[field.name] = Array.isArray(def)
                    ? def
                    : def !== undefined && def !== null && def !== ''
                    ? [def]
                    : [];
            }
        }
        return base;
    }, [filterFields, defaultFilter]);

    const effectiveExternalSearch = propSearch !== undefined ? propSearch : propValue;

    const [state, setState] = useState({
        showFilter: false,
        filter: propFilter !== undefined ? propFilter : initialFilter,
        search: effectiveExternalSearch !== undefined ? effectiveExternalSearch : '',
    });

    const [inputValue, setInputValue] = useState(
        effectiveExternalSearch !== undefined ? effectiveExternalSearch : ''
    );

    const filterCardRef = useRef(null);

    // Currently applied filter (source of truth for active results)
    const appliedFilter = useMemo(() => {
        return propFilter !== undefined ? propFilter : state.filter;
    }, [propFilter, state.filter]);

    // Draft / Staging filter state (only applied when user clicks "Show results" / Submit)
    const [draftFilter, setDraftFilter] = useState(appliedFilter);

    // Sync draftFilter whenever appliedFilter changes externally (e.g. from parent prop or reset)
    const appliedFilterKey = useMemo(() => JSON.stringify(appliedFilter || {}), [appliedFilter]);
    useEffect(() => {
        setDraftFilter(appliedFilter);
    }, [appliedFilterKey, appliedFilter]);

    // Safely sync internal state with external controlled propFilter when content changes
    const propFilterKey = useMemo(() => (propFilter ? JSON.stringify(propFilter) : null), [propFilter]);
    useEffect(() => {
        if (propFilter !== undefined) {
            setState((prev) => ({
                ...prev,
                filter: propFilter,
            }));
        }
    }, [propFilterKey, propFilter]);

    // Safely sync search input text when external search/value prop changes
    useEffect(() => {
        if (effectiveExternalSearch !== undefined && effectiveExternalSearch !== inputValue) {
            setInputValue(effectiveExternalSearch);
            setState((prev) => ({ ...prev, search: effectiveExternalSearch }));
        }
    }, [effectiveExternalSearch]);

    // Handle debounced search query
    const handleDebounce = useMemo(
        () =>
            debounce((value) => {
                setState((prev) => ({ ...prev, search: value }));
                if (typeof setSearch === 'function') {
                    setSearch(value);
                }
            }, 350),
        [setSearch]
    );

    useEffect(() => {
        return () => {
            handleDebounce.cancel();
        };
    }, [handleDebounce]);

    const handleChange = (e) => {
        const val = e.target.value;
        setInputValue(val);
        handleDebounce(val);
    };

    const handleClearSearch = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setInputValue('');
        handleDebounce.cancel();
        setState((prev) => ({ ...prev, search: '' }));
        if (typeof setSearch === 'function') {
            setSearch('');
        }
    };

    // Staging filter toggling inside filter card (does NOT trigger parent update until submit)
    const handleSetDraftFilter = useCallback(
        (name, val) => {
            setDraftFilter((prevDraft) => {
                const rawVals = prevDraft[name];
                const currentArray = Array.isArray(rawVals)
                    ? rawVals
                    : rawVals !== undefined && rawVals !== null && rawVals !== ''
                    ? [rawVals]
                    : [];

                let updatedValues;

                // Clicking "any" clears the filter field
                if (val === 'any' || val === null) {
                    updatedValues = [];
                } else {
                    const strVal = String(val);
                    // Single-select toggle logic for fields like price and rating
                    if (name === 'price' || name === 'rating') {
                        updatedValues = currentArray.some((v) => String(v) === strVal)
                            ? []
                            : [val];
                    } else {
                        updatedValues = currentArray.some((v) => String(v) === strVal)
                            ? currentArray.filter((v) => String(v) !== strVal)
                            : [...currentArray, val];
                    }
                }

                return {
                    ...prevDraft,
                    [name]: updatedValues,
                };
            });
        },
        []
    );

    // Reset draft filter inside the card (still requires submit to apply)
    const handleResetDraftFilter = useCallback(
        (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            const emptyFilter = filterFields.reduce((acc, field) => {
                if (field?.name) {
                    acc[field.name] = [];
                }
                return acc;
            }, {});

            setDraftFilter(emptyFilter);
        },
        [filterFields]
    );

    // SUBMIT / APPLY: Confirms draft filter and sends to parent
    const handleApplyFilter = useCallback(
        (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            // 1. Update local applied filter state
            setState((prev) => ({
                ...prev,
                showFilter: false,
                filter: draftFilter,
            }));

            // 2. Inform parent component to trigger query updates
            if (isFilter && typeof setFilter === 'function') {
                setFilter(draftFilter);
            }
        },
        [draftFilter, isFilter, setFilter]
    );

    // CANCEL: Discards draft changes, restores applied filter, and closes panel
    const handleCancelFilter = useCallback(
        (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setDraftFilter(appliedFilter);
            setState((prev) => ({ ...prev, showFilter: false }));
        },
        [appliedFilter]
    );

    // Directly remove one filter from applied filters (when clicking chip under search bar)
    const handleRemoveAppliedFilter = useCallback(
        (name, val) => {
            const rawVals = appliedFilter[name];
            const currentArray = Array.isArray(rawVals)
                ? rawVals
                : rawVals !== undefined && rawVals !== null && rawVals !== ''
                ? [rawVals]
                : [];

            const strVal = String(val);
            const updatedValues = currentArray.filter((v) => String(v) !== strVal);
            const nextFilter = {
                ...appliedFilter,
                [name]: updatedValues,
            };

            setState((prev) => ({
                ...prev,
                filter: nextFilter,
            }));
            setDraftFilter(nextFilter);

            if (isFilter && typeof setFilter === 'function') {
                setFilter(nextFilter);
            }
        },
        [appliedFilter, isFilter, setFilter]
    );

    // Directly clear all filters from the active chips bar under search input
    const handleClearAllAppliedFilters = useCallback(
        (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            const emptyFilter = filterFields.reduce((acc, field) => {
                if (field?.name) {
                    acc[field.name] = [];
                }
                return acc;
            }, {});

            setState((prev) => ({
                ...prev,
                filter: emptyFilter,
            }));
            setDraftFilter(emptyFilter);

            if (isFilter && typeof setFilter === 'function') {
                setFilter(emptyFilter);
            }
        },
        [filterFields, isFilter, setFilter]
    );

    // Toggle filter panel (initializes draft with current applied filter)
    const toggleFilterPanel = useCallback(
        (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setState((prev) => {
                const nextShow = !prev.showFilter;
                if (nextShow) {
                    setDraftFilter(appliedFilter);
                }
                return { ...prev, showFilter: nextShow };
            });
        },
        [appliedFilter]
    );

    // Listen for outside clicks and ESC key to close filter panel (no body overlay)
    useEffect(() => {
        if (!state.showFilter) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleCancelFilter();
            }
        };

        const handleClickOutside = (e) => {
            if (
                filterCardRef.current &&
                !filterCardRef.current.contains(e.target) &&
                !e.target.closest('.btn-filter-toggle')
            ) {
                handleCancelFilter();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [state.showFilter, handleCancelFilter]);

    const effectiveSubmit = onSubmit || submit;
    const handleSubmit = (e) => {
        e.preventDefault();
        handleDebounce.cancel();

        const filterToSubmit = state.showFilter ? draftFilter : appliedFilter;
        if (state.showFilter) {
            setState((prev) => ({ ...prev, showFilter: false, filter: draftFilter }));
        }

        if (effectiveSubmit) {
            effectiveSubmit(inputValue);
        } else {
            if (setSearch) setSearch(inputValue);
            if (isFilter && setFilter) setFilter(filterToSubmit);
        }
    };

    const totalAppliedFilters = useMemo(() => {
        return Object.values(appliedFilter).reduce((acc, val) => {
            if (Array.isArray(val)) {
                return acc + val.length;
            }
            if (val !== undefined && val !== null && val !== '') {
                return acc + 1;
            }
            return acc;
        }, 0);
    }, [appliedFilter]);

    const totalDraftFilters = useMemo(() => {
        return Object.values(draftFilter).reduce((acc, val) => {
            if (Array.isArray(val)) {
                return acc + val.length;
            }
            if (val !== undefined && val !== null && val !== '') {
                return acc + 1;
            }
            return acc;
        }, 0);
    }, [draftFilter]);

    const effectivePlaceholder = placeholder || placeholderText || 'Search...';

    // Helper: Determine if field should be rendered as a segmented pill track
    const isSegmentedField = (fieldName, itemsCount) => {
        return (
            fieldName === 'price' ||
            fieldName === 'rating' ||
            (itemsCount > 0 && itemsCount <= 6 && (fieldName === 'type' || fieldName === 'bedrooms' || fieldName === 'bathrooms'))
        );
    };

    return (
        <div className={`search-bar search-bar-container ${state.showFilter ? 'filter-open' : ''} ${className}`}>
            {/* Main Search Input Form */}
            <form onSubmit={handleSubmit} role="search" className="search-form">
                <div className="search-input-wrapper">
                    <span className="search-icon" aria-hidden="true">
                        <IoSearch />
                    </span>

                    <input
                        type="text"
                        name="search"
                        placeholder={effectivePlaceholder}
                        autoComplete="off"
                        value={inputValue}
                        onChange={handleChange}
                        aria-label={effectivePlaceholder}
                    />

                    {pending ? (
                        <div className="search-loader" aria-label="Loading results">
                            <LoadingContent scale={0.35} color="var(--color-primary)" />
                        </div>
                    ) : inputValue.length > 0 ? (
                        <button
                            type="button"
                            className="clear-btn"
                            onClick={handleClearSearch}
                            title="Clear search text"
                            aria-label="Clear search text"
                        >
                            <IoClose />
                        </button>
                    ) : null}

                    {isFilter && filterFields.length > 0 && (
                        <button
                            type="button"
                            className={`filter-toggle ${state.showFilter ? 'active' : ''}`}
                            onClick={toggleFilterPanel}
                            title={state.showFilter ? 'Close filters' : 'Open filters'}
                            aria-expanded={state.showFilter}
                            aria-label="Toggle filter options"
                        >
                            <HiAdjustmentsHorizontal />
                            <span className="filter-toggle-label">Filters</span>
                            {totalAppliedFilters > 0 && (
                                <span className="filter-badge" aria-label={`${totalAppliedFilters} filters applied`}>
                                    {totalAppliedFilters}
                                </span>
                            )}
                        </button>
                    )}
                </div>
            </form>

            {/* Active Filter Chips Bar (Visible under search bar when filters are applied) */}
            {isFilter && totalAppliedFilters > 0 && (
                <div className="active-filters-chips" aria-label="Active filters">
                    <div className="chips-list">
                        {filterFields.map((field) => {
                            const rawVals = appliedFilter[field.name];
                            const selectedVals = Array.isArray(rawVals)
                                ? rawVals
                                : rawVals !== undefined && rawVals !== null && rawVals !== ''
                                ? [rawVals]
                                : [];
                            const items = Array.isArray(field.items) ? field.items : [];

                            return selectedVals.map((val) => {
                                const itemObj = items.find((it) => String(it.value) === String(val));
                                const label = itemObj?.name || val;
                                return (
                                    <button
                                        key={`${field.name}-${val}`}
                                        type="button"
                                        className="filter-chip"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRemoveAppliedFilter(field.name, val);
                                        }}
                                        title={`Remove ${field.name}: ${label}`}
                                        aria-label={`Remove filter ${field.name}: ${label}`}
                                    >
                                        <span className="chip-cat">{field.name}:</span>
                                        <span className="chip-val">{label}</span>
                                        <IoClose className="chip-remove-icon" />
                                    </button>
                                );
                            });
                        })}
                    </div>

                    <button
                        type="button"
                        className="btn-clear-all-chips"
                        onClick={handleClearAllAppliedFilters}
                        title="Reset all applied filters"
                    >
                        <span>Reset filters</span>
                    </button>
                </div>
            )}

            {/* Filter Card / Modal Dialog (Backdrop is provided globally by body.overlay) */}
            {isFilter && filterFields.length > 0 && state.showFilter && (
                <div
                    className="filter-card active"
                    ref={filterCardRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Filter options"
                    onClick={(e) => e.stopPropagation()}
                >
                        {/* Mobile Drag Indicator Handle */}
                        <div className="filter-sheet-handle" aria-hidden="true" />

                        {/* Card Header (Minimalist "Filter" + "Reset filters" pill) */}
                        <div className="filter-card-header">
                            <div className="card-header-left">
                                <h3 className="card-title">Filter</h3>
                                {totalDraftFilters > 0 && (
                                    <span className="active-badge-dot" title={`${totalDraftFilters} selected filters`}>
                                        {totalDraftFilters}
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                className="btn-reset-pill"
                                onClick={handleResetDraftFilter}
                                title="Reset all draft selections"
                            >
                                Reset filters
                            </button>
                        </div>

                        {/* Card Body with Segmented Tracks & Tactile Checked Chips */}
                        <div className="filter-card-body">
                            {filterFields.map((field) => {
                                const rawVals = draftFilter[field.name];
                                const selectedVals = Array.isArray(rawVals)
                                    ? rawVals
                                    : rawVals !== undefined && rawVals !== null && rawVals !== ''
                                    ? [rawVals]
                                    : [];
                                const items = Array.isArray(field.items) ? field.items : [];
                                const isSegmented = isSegmentedField(field.name, items.length);

                                return (
                                    <div key={field.name} className="filter-section">
                                        <div className="filter-section-header">
                                            <span className="filter-section-label">
                                                {field.name === 'price'
                                                    ? 'Price'
                                                    : field.name === 'rating'
                                                    ? 'Rating'
                                                    : field.name === 'level'
                                                    ? 'Level'
                                                    : field.name === 'status'
                                                    ? 'Status'
                                                    : field.name}
                                            </span>
                                            {!isSegmented && selectedVals.length > 0 && (
                                                <span className="filter-section-count">
                                                    {selectedVals.length}
                                                </span>
                                            )}
                                        </div>

                                        {isSegmented ? (
                                            /* Segmented Pill Track (e.g. Any / Free / Paid or Any / 1★ / 2★ ...) */
                                            <div className="segmented-track" role="group" aria-label={field.name}>
                                                <button
                                                    type="button"
                                                    className={`segmented-item ${selectedVals.length === 0 ? 'active' : ''}`}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleSetDraftFilter(field.name, 'any');
                                                    }}
                                                    aria-pressed={selectedVals.length === 0}
                                                >
                                                    Any
                                                </button>
                                                {items.map((item) => {
                                                    const isSelected = selectedVals.some(
                                                        (v) => String(v) === String(item.value)
                                                    );
                                                    return (
                                                        <button
                                                            key={String(item.value)}
                                                            type="button"
                                                            className={`segmented-item ${isSelected ? 'active' : ''}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleSetDraftFilter(field.name, item.value);
                                                            }}
                                                            aria-pressed={isSelected}
                                                        >
                                                            {field.name === 'rating' ? `${item.value}★` : item.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            /* Tactile Chips Grid with Circular Checkmark Badge */
                                            <div className="filter-chips-grid">
                                                {items.map((item) => {
                                                    const isSelected = selectedVals.some(
                                                        (v) => String(v) === String(item.value)
                                                    );

                                                    return (
                                                        <button
                                                            key={String(item.value)}
                                                            type="button"
                                                            className={`filter-chip-btn ${isSelected ? 'selected' : ''}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleSetDraftFilter(field.name, item.value);
                                                            }}
                                                            aria-pressed={isSelected}
                                                        >
                                                            {isSelected && (
                                                                <span className="chip-check-circle" aria-hidden="true">
                                                                    <IoCheckmark />
                                                                </span>
                                                            )}
                                                            <span className="chip-name">{item.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Card Sticky Footer (Cancel & Submit "Show results") */}
                        <div className="filter-card-footer">
                            <button
                                type="button"
                                className="btn-filter-cancel"
                                onClick={handleCancelFilter}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-filter-apply"
                                onClick={handleApplyFilter}
                            >
                                Apply Filters
                            </button>
                        </div>
                    </div>
            )}
        </div>
    );
}
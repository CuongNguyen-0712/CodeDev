'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';

import { normalizeSearch, SEARCH_MAX_LENGTH } from '@/lib/listFilters';

import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/shadcn/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/shadcn/sheet';
import { Separator } from '@/components/shadcn/separator';
import { Spinner } from '@/components/shadcn/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/shadcn/toggle-group';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { LuSearch, LuSlidersHorizontal, LuX } from 'react-icons/lu';

const FIELD_LABELS = {
    price: 'Price',
    rating: 'Rating',
    level: 'Level',
    status: 'Status',
    type: 'Type',
    language: 'Language',
    category: 'Category',
    role: 'Career role',
    industry: 'Industry',
    skill: 'Skill',
};

const labelFor = (name) => FIELD_LABELS[name] || (name ? name.charAt(0).toUpperCase() + name.slice(1) : '');

const toArray = (raw) => (Array.isArray(raw)
    ? raw
    : raw !== undefined && raw !== null && raw !== ''
        ? [raw]
        : []);

const countValues = (filter) => Object.values(filter || {}).reduce((acc, val) => {
    if (Array.isArray(val)) return acc + val.length;
    if (val !== undefined && val !== null && val !== '') return acc + 1;
    return acc;
}, 0);

// Single-choice fields render as a segmented control with an "Any" option.
const isSegmentedField = (fieldName, itemsCount) => (
    fieldName === 'price' ||
    fieldName === 'rating' ||
    (itemsCount > 0 && itemsCount <= 6 && (fieldName === 'type' || fieldName === 'bedrooms' || fieldName === 'bathrooms'))
);

const selectedToggle = "data-[state=on]:border-primary/40 data-[state=on]:bg-primary-soft data-[state=on]:text-primary-soft-foreground";

function FilterFormBody({
    totalDraftFilters,
    handleResetDraftFilter,
    filterFields,
    draftFilter,
    setDraftValues,
    handleCancelFilter,
    handleApplyFilter,
    isMobile = false,
}) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                    Filters
                    {totalDraftFilters > 0 && (
                        <span className="text-xs font-normal text-muted-foreground tabular">
                            {totalDraftFilters} selected
                        </span>
                    )}
                </p>
                <Button variant="ghost" size="xs" onClick={handleResetDraftFilter} disabled={totalDraftFilters === 0}>
                    Clear all
                </Button>
            </div>
            <Separator />

            <div className={cn("space-y-4 overflow-y-auto px-4 py-4 flex-1 min-h-0", isMobile ? "max-h-[55vh]" : "max-h-[min(60vh,26rem)]")}>
                {filterFields.map((field) => {
                    const items = Array.isArray(field.items) ? field.items : [];
                    const selected = toArray(draftFilter[field.name]).map(String);
                    const segmented = isSegmentedField(field.name, items.length);
                    const labelId = `filter-${field.name}-label`;

                    return (
                        <div key={field.name} className="space-y-2">
                            <p id={labelId} className="text-xs font-medium text-muted-foreground">
                                {labelFor(field.name)}
                            </p>
                            {segmented ? (
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    size="sm"
                                    spacing={1}
                                    aria-labelledby={labelId}
                                    value={selected[0] ?? 'any'}
                                    onValueChange={(v) => setDraftValues(field, v && v !== 'any' ? [v] : [])}
                                    className="w-full flex-wrap justify-start"
                                >
                                    <ToggleGroupItem value="any" className={selectedToggle}>Any</ToggleGroupItem>
                                    {items.map((item) => (
                                        <ToggleGroupItem key={String(item.value)} value={String(item.value)} className={selectedToggle}>
                                            {field.name === 'rating' ? `${item.value}+ stars` : item.name}
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                            ) : (
                                <ToggleGroup
                                    type="multiple"
                                    variant="outline"
                                    size="sm"
                                    spacing={1}
                                    aria-labelledby={labelId}
                                    value={selected}
                                    onValueChange={(v) => setDraftValues(field, v)}
                                    className="w-full flex-wrap justify-start"
                                >
                                    {items.map((item) => (
                                        <ToggleGroupItem key={String(item.value)} value={String(item.value)} className={selectedToggle}>
                                            {item.name}
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                            )}
                        </div>
                    );
                })}
            </div>

            <Separator />
            <div className={cn("bg-background shrink-0", isMobile ? "grid grid-cols-2 gap-2 p-3" : "flex justify-end gap-2 px-4 py-3")}>
                <Button variant={isMobile ? "outline" : "ghost"} size="sm" onClick={handleCancelFilter}>Cancel</Button>
                <Button size="sm" onClick={handleApplyFilter}>Apply filters</Button>
            </div>
        </div>
    );
}

export default function SearchBar({
    data = [],
    filter: propFilter,
    search: propSearch,
    value: propValue,
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
    const isMobile = useIsMobile();
    const filterFields = useMemo(() => (Array.isArray(data) ? data : []), [data]);

    const initialFilter = useMemo(() => {
        const base = {};
        for (const field of filterFields) {
            if (field?.name) {
                base[field.name] = toArray(defaultFilter?.[field.name]);
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

    // Currently applied filter (source of truth for active results)
    const appliedFilter = useMemo(() => {
        return propFilter !== undefined ? propFilter : state.filter;
    }, [propFilter, state.filter]);

    // Draft filter: edited in the panel, applied on "Apply filters"
    const [draftFilter, setDraftFilter] = useState(appliedFilter);

    // Props and the applied filter are mirrored into local state during render when they change
    // (not in effects, which would render once more with stale values).
    const [synced, setSynced] = useState({ appliedFilter, propFilter, search: effectiveExternalSearch });
    if (synced.appliedFilter !== appliedFilter || synced.propFilter !== propFilter || synced.search !== effectiveExternalSearch) {
        setSynced({ appliedFilter, propFilter, search: effectiveExternalSearch });
        if (synced.appliedFilter !== appliedFilter) setDraftFilter(appliedFilter);
        if (synced.propFilter !== propFilter && propFilter !== undefined) {
            setState((prev) => ({ ...prev, filter: propFilter }));
        }
        // The parent may hand back a normalised term (trimmed, single spaces): only overwrite the
        // input when the meaning differs, so a trailing space being typed is not swallowed.
        if (synced.search !== effectiveExternalSearch && effectiveExternalSearch !== undefined
            && normalizeSearch(effectiveExternalSearch) !== normalizeSearch(inputValue)) {
            setInputValue(effectiveExternalSearch);
            setState((prev) => ({ ...prev, search: effectiveExternalSearch }));
        }
    }

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

    useEffect(() => () => handleDebounce.cancel(), [handleDebounce]);

    const handleChange = (e) => {
        const val = e.target.value;
        setInputValue(val);
        handleDebounce(val);
    };

    const handleClearSearch = () => {
        setInputValue('');
        handleDebounce.cancel();
        setState((prev) => ({ ...prev, search: '' }));
        if (typeof setSearch === 'function') {
            setSearch('');
        }
    };

    // Replace one field's values in the draft. Values come back from the
    // toggle group as strings, so map them to the original item values.
    const setDraftValues = useCallback((field, nextValues) => {
        const items = Array.isArray(field.items) ? field.items : [];
        const mapped = nextValues
            .map((v) => items.find((it) => String(it.value) === String(v))?.value ?? v);
        setDraftFilter((prev) => ({ ...prev, [field.name]: mapped }));
    }, []);

    const emptyFilter = useMemo(() => filterFields.reduce((acc, field) => {
        if (field?.name) acc[field.name] = [];
        return acc;
    }, {}), [filterFields]);

    const handleResetDraftFilter = () => setDraftFilter(emptyFilter);

    const handleApplyFilter = useCallback(() => {
        setState((prev) => ({ ...prev, showFilter: false, filter: draftFilter }));
        if (isFilter && typeof setFilter === 'function') {
            setFilter(draftFilter);
        }
    }, [draftFilter, isFilter, setFilter]);

    const handleCancelFilter = useCallback(() => {
        setDraftFilter(appliedFilter);
        setState((prev) => ({ ...prev, showFilter: false }));
    }, [appliedFilter]);

    const handleOpenChange = (open) => {
        if (open) {
            setDraftFilter(appliedFilter);
            setState((prev) => ({ ...prev, showFilter: true }));
        } else {
            handleCancelFilter();
        }
    };

    const handleRemoveAppliedFilter = useCallback((name, val) => {
        const nextFilter = {
            ...appliedFilter,
            [name]: toArray(appliedFilter[name]).filter((v) => String(v) !== String(val)),
        };
        setState((prev) => ({ ...prev, filter: nextFilter }));
        setDraftFilter(nextFilter);
        if (isFilter && typeof setFilter === 'function') {
            setFilter(nextFilter);
        }
    }, [appliedFilter, isFilter, setFilter]);

    const handleClearAllAppliedFilters = useCallback(() => {
        setState((prev) => ({ ...prev, filter: emptyFilter }));
        setDraftFilter(emptyFilter);
        if (isFilter && typeof setFilter === 'function') {
            setFilter(emptyFilter);
        }
    }, [emptyFilter, isFilter, setFilter]);

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

    const totalAppliedFilters = useMemo(() => countValues(appliedFilter), [appliedFilter]);
    const totalDraftFilters = useMemo(() => countValues(draftFilter), [draftFilter]);

    const effectivePlaceholder = placeholder || placeholderText || 'Search...';
    const hasFilters = isFilter && filterFields.length > 0;

    return (
        <div className={`flex w-full flex-col gap-2.5 ${className}`}>
            <form onSubmit={handleSubmit} role="search" className="w-full">
                <InputGroup className="h-10 bg-background">
                    <InputGroupAddon aria-hidden="true">
                        <LuSearch />
                    </InputGroupAddon>
                    <InputGroupInput
                        type="search"
                        name="search"
                        placeholder={effectivePlaceholder}
                        autoComplete="off"
                        maxLength={SEARCH_MAX_LENGTH}
                        value={inputValue}
                        onChange={handleChange}
                        aria-label={effectivePlaceholder}
                        className="[&::-webkit-search-cancel-button]:hidden"
                    />
                    <InputGroupAddon align="inline-end">
                        {pending ? (
                            <Spinner className="text-muted-foreground" aria-label="Loading results" />
                        ) : inputValue.length > 0 ? (
                            <InputGroupButton size="icon-xs" onClick={handleClearSearch} aria-label="Clear search">
                                <LuX />
                            </InputGroupButton>
                        ) : null}

                        {hasFilters && (
                            isMobile ? (
                                <Sheet open={state.showFilter} onOpenChange={handleOpenChange}>
                                    <SheetTrigger asChild>
                                        <InputGroupButton
                                            size="sm"
                                            variant="ghost"
                                            className="data-[state=open]:bg-accent"
                                            aria-label={totalAppliedFilters > 0 ? `Filters, ${totalAppliedFilters} applied` : 'Filters'}
                                        >
                                            <LuSlidersHorizontal />
                                            <span className="max-sm:sr-only">Filters</span>
                                            {totalAppliedFilters > 0 && (
                                                <Badge variant="primary" className="h-4 min-w-4 px-1 tabular">
                                                    {totalAppliedFilters}
                                                </Badge>
                                            )}
                                        </InputGroupButton>
                                    </SheetTrigger>
                                    <SheetContent
                                        side="bottom"
                                        showCloseButton={false}
                                        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl border-t bg-background p-0"
                                    >
                                        <div className="mx-auto my-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                                        <SheetHeader className="sr-only">
                                            <SheetTitle>Filters</SheetTitle>
                                            <SheetDescription>Filter search results</SheetDescription>
                                        </SheetHeader>
                                        <FilterFormBody
                                            totalDraftFilters={totalDraftFilters}
                                            handleResetDraftFilter={handleResetDraftFilter}
                                            filterFields={filterFields}
                                            draftFilter={draftFilter}
                                            setDraftValues={setDraftValues}
                                            handleCancelFilter={handleCancelFilter}
                                            handleApplyFilter={handleApplyFilter}
                                            isMobile={true}
                                        />
                                    </SheetContent>
                                </Sheet>
                            ) : (
                                <Popover open={state.showFilter} onOpenChange={handleOpenChange}>
                                    <PopoverTrigger asChild>
                                        <InputGroupButton
                                            size="sm"
                                            variant="ghost"
                                            className="data-[state=open]:bg-accent"
                                            aria-label={totalAppliedFilters > 0 ? `Filters, ${totalAppliedFilters} applied` : 'Filters'}
                                        >
                                            <LuSlidersHorizontal />
                                            <span className="max-sm:sr-only">Filters</span>
                                            {totalAppliedFilters > 0 && (
                                                <Badge variant="primary" className="h-4 min-w-4 px-1 tabular">
                                                    {totalAppliedFilters}
                                                </Badge>
                                            )}
                                        </InputGroupButton>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
                                        <FilterFormBody
                                            totalDraftFilters={totalDraftFilters}
                                            handleResetDraftFilter={handleResetDraftFilter}
                                            filterFields={filterFields}
                                            draftFilter={draftFilter}
                                            setDraftValues={setDraftValues}
                                            handleCancelFilter={handleCancelFilter}
                                            handleApplyFilter={handleApplyFilter}
                                            isMobile={false}
                                        />
                                    </PopoverContent>
                                </Popover>
                            )
                        )}
                    </InputGroupAddon>
                </InputGroup>
            </form>

            {hasFilters && totalAppliedFilters > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
                    {filterFields.map((field) => {
                        const items = Array.isArray(field.items) ? field.items : [];
                        return toArray(appliedFilter[field.name]).map((val) => {
                            const label = items.find((it) => String(it.value) === String(val))?.name || val;
                            return (
                                <Button
                                    key={`${field.name}-${val}`}
                                    variant="outline"
                                    size="xs"
                                    onClick={() => handleRemoveAppliedFilter(field.name, val)}
                                    aria-label={`Remove filter ${labelFor(field.name)}: ${label}`}
                                    className="h-7 gap-1.5 font-normal"
                                >
                                    <span className="text-muted-foreground">{labelFor(field.name)}:</span>
                                    <span className="font-medium">{label}</span>
                                    <LuX className="text-muted-foreground" />
                                </Button>
                            );
                        });
                    })}
                    <Button variant="ghost" size="xs" className="h-7 text-muted-foreground" onClick={handleClearAllAppliedFilters}>
                        Reset filters
                    </Button>
                </div>
            )}
        </div>
    );
}

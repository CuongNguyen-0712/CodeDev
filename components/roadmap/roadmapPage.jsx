'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roadmapQueries } from '@/queries/roadmap.query';
import { useRouterActions } from '@/router/useRouterActions';
import { levelMapping } from '@/constants/constants';

import { LoadingContent } from '@/components/ui/loading';
import { ErrorReload } from '@/components/ui/error';
import SearchBar from '@/components/ui/searchBar';

import { LuSparkles, LuCompass, LuLayers } from 'react-icons/lu';
import { FaRoute } from 'react-icons/fa6';
import {
    HiArrowRight,
    HiCodeBracket,
    HiServerStack,
    HiCommandLine,
    HiCpuChip
} from 'react-icons/hi2';

import '@/styles/roadmap/roadmap.css';

const FILTER_MAPPING = [
    {
        name: 'level',
        items: [
            { name: 'Beginner', value: 'beginner' },
            { name: 'Intermediate', value: 'intermediate' },
            { name: 'Advanced', value: 'advanced' },
        ],
    },
];

const DEFAULT_FILTER = {};

/**
 * Returns contextual track icon for card
 */
function getTrackIcon(title = '') {
    const lower = title.toLowerCase();
    if (lower.includes('front') || lower.includes('react') || lower.includes('vue') || lower.includes('web') || lower.includes('ui')) {
        return <HiCodeBracket className="track-icon" />;
    }
    if (lower.includes('back') || lower.includes('node') || lower.includes('api') || lower.includes('java') || lower.includes('python')) {
        return <HiServerStack className="track-icon" />;
    }
    if (lower.includes('devops') || lower.includes('cloud') || lower.includes('docker') || lower.includes('linux')) {
        return <HiCommandLine className="track-icon" />;
    }
    if (lower.includes('ai') || lower.includes('data') || lower.includes('ml')) {
        return <HiCpuChip className="track-icon" />;
    }
    return <LuCompass className="track-icon" />;
}

export default function RoadmapPage() {
    const { navigate } = useRouterActions();
    const { data, isLoading, isError, error, refetch } = useQuery(roadmapQueries.list());

    const [state, setState] = useState({
        filter: { ...DEFAULT_FILTER },
        search: '',
    });

    // Safely extract roadmaps array
    const roadmaps = useMemo(() => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        return [];
    }, [data]);

    const hasActiveFilters = Boolean(
        state.search.trim() ||
        (state.filter?.level && state.filter.level.length > 0)
    );

    // Filter roadmaps by search query & level filter
    const filteredRoadmaps = useMemo(() => {
        return roadmaps.filter((item) => {
            const query = state.search.trim().toLowerCase();
            const matchesSearch =
                !query ||
                item.title?.toLowerCase().includes(query) ||
                item.description?.toLowerCase().includes(query);

            const selectedLevels = state.filter?.level || [];
            const matchesLevel =
                selectedLevels.length === 0 ||
                selectedLevels.some(
                    (lvl) => item.level && item.level.toLowerCase() === lvl.toLowerCase()
                );

            return matchesSearch && matchesLevel;
        });
    }, [roadmaps, state.search, state.filter?.level]);

    const handleClearFilters = useCallback(() => {
        setState({
            filter: { ...DEFAULT_FILTER },
            search: '',
        });
    }, []);

    const handleCardClick = (id) => {
        if (!id) return;
        navigate({ path: `roadmap/${id}` });
    };

    return (
        <section className="shared_section" id="roadmap">
            {/* Hero Header Banner */}
            <div className="roadmap-hero-banner">
                <div className="hero-badge">
                    <LuSparkles fontSize={14} />
                    <span>Career Roadmaps</span>
                </div>
                <h1 className="hero-title">Developer Roadmaps</h1>
                <p className="hero-subtitle">
                    Step-by-step career paths and milestone guides to help you navigate modern software development, master essential tools, and build production-ready projects.
                </p>
            </div>

            {/* Search and Filters Bar */}
            <div className="roadmap_header">
                <SearchBar
                    data={FILTER_MAPPING}
                    filter={state.filter}
                    search={state.search}
                    resultsCount={filteredRoadmaps.length}
                    setSearch={(val) => setState((prev) => ({ ...prev, search: val }))}
                    setFilter={(val) => setState((prev) => ({ ...prev, filter: val }))}
                    defaultFilter={DEFAULT_FILTER}
                    pending={isLoading}
                    placeholderText="Search roadmaps by role, title, or skills..."
                />
            </div>


            {/* Status Bar */}
            {!isLoading && !isError && (
                <div className="roadmaps-status-bar">
                    <span className="roadmap-count">
                        Showing <strong>{filteredRoadmaps.length}</strong> {filteredRoadmaps.length === 1 ? 'roadmap' : 'roadmaps'}
                    </span>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="clear-filters-link"
                            onClick={handleClearFilters}
                        >
                            Reset all filters
                        </button>
                    )}
                </div>
            )}

            {/* Roadmaps Grid */}
            <div className="roadmaps-grid">
                {isLoading ? (
                    <div className="roadmaps-loading-wrapper">
                        <LoadingContent color="var(--color-primary)" />
                    </div>
                ) : isError ? (
                    <div className="roadmaps-error-wrapper">
                        <ErrorReload data={error} refetch={refetch} />
                    </div>
                ) : filteredRoadmaps.length > 0 ? (
                    filteredRoadmaps.map((roadmap) => {
                        const levelKey = roadmap.level?.toLowerCase() || 'beginner';
                        const levelConfig = levelMapping[levelKey] || {
                            label: roadmap.level || 'All Levels',
                            color: 'var(--color-primary)',
                            bg: 'var(--palette-1)',
                        };

                        const nodeCount = parseInt(roadmap.nodes, 10) || 0;

                        return (
                            <article
                                key={roadmap.id}
                                className="roadmap-card"
                                role="button"
                                tabIndex={0}
                                onClick={() => handleCardClick(roadmap.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleCardClick(roadmap.id);
                                    }
                                }}
                            >
                                <div className="card-accent-bar" />

                                <div className="roadmap-card-header">
                                    <div className="card-icon-box">
                                        {getTrackIcon(roadmap.title)}
                                    </div>
                                    <span
                                        className="roadmap-level-badge"
                                        style={{
                                            color: levelConfig.color,
                                            background: levelConfig.bg,
                                        }}
                                    >
                                        {levelConfig.label}
                                    </span>
                                </div>

                                <div className="roadmap-card-body">
                                    <h3 className="roadmap-title">{roadmap.title}</h3>
                                    <p className="roadmap-description">{roadmap.description}</p>
                                </div>

                                <div className="roadmap-properties">
                                    <div className="property">
                                        <FaRoute />
                                        <span>{nodeCount} {nodeCount === 1 ? 'Step' : 'Steps'}</span>
                                    </div>
                                    <div className="property">
                                        <LuLayers />
                                        <span>Structured Path</span>
                                    </div>
                                </div>

                                <div className="roadmap-card-footer">
                                    <span className="explore-link">
                                        <span>Explore Roadmap</span>
                                        <HiArrowRight className="arrow-icon" />
                                    </span>
                                </div>
                            </article>
                        );
                    })
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <LuCompass />
                        </div>
                        <h3>No roadmaps found</h3>
                        <p>
                            {hasActiveFilters
                                ? "We couldn't find any roadmaps matching your criteria. Try adjusting your search query or reset your filters."
                                : 'No roadmaps are currently available. Please check back soon!'}
                        </p>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                className="empty-reset-btn"
                                onClick={handleClearFilters}
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
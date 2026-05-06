'use client'
import { useState, useEffect, useCallback } from "react"
import { usePathname, useSearchParams } from "next/navigation";

import useKey from "@/app/hooks/useKey";
import SearchBar from "@/app/component/ui/searchBar";
import { useQuery } from "@/app/router/useQuery";

import { IoSearch, IoClose, IoTime, IoArrowBack } from "react-icons/io5";
import { FaLink } from "react-icons/fa6";
import { HiOutlineDocumentText, HiOutlineFolder, HiOutlineGlobeAlt } from "react-icons/hi2";
import { RiCommandLine } from "react-icons/ri";

import Form from "next/form"
import Link from "next/link";

const STORAGE_KEY = 'search_history';
const MAX_HISTORY = 5;

const categories = [
    { id: 'all', label: 'All', icon: null },
    { id: 'links', label: 'Links', icon: FaLink },
    { id: 'pages', label: 'Pages', icon: HiOutlineDocumentText },
    { id: 'projects', label: 'Projects', icon: HiOutlineFolder },
];

export default function Search() {
    useKey({ key: 'Escape', param: 'search' });

    const queryNavigate = useQuery();
    const pathname = usePathname();
    const params = useSearchParams();
    const search = params.get('search');

    const [state, setState] = useState({
        query: "",
        links: [],
        history: [],
        activeCategory: 'all',
        isLoading: false
    });

    const closeSearch = useCallback(() => {
        queryNavigate(pathname, { search: null });
    }, [queryNavigate, pathname]);

    const addToHistory = (term) => {
        if (!term.trim()) return;
        const newHistory = [term, ...state.history.filter(h => h !== term)].slice(0, MAX_HISTORY);
        setState(prev => ({ ...prev, history: newHistory }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    };

    const removeFromHistory = (term, e) => {
        e.preventDefault();
        e.stopPropagation();
        const newHistory = state.history.filter(h => h !== term);
        setState(prev => ({ ...prev, history: newHistory }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    };

    const submitSearch = (e) => {
        e.preventDefault();
        if (state.query.trim()) {
            addToHistory(state.query.trim());
        }
    };

    const filteredLinks = state.links.filter(link => {
        const matchesQuery = !state.query ||
            link.name?.toLowerCase().includes(state.query.toLowerCase()) ||
            link.description?.toLowerCase().includes(state.query.toLowerCase());
        const matchesCategory = state.activeCategory === 'all' || link.category === state.activeCategory;
        return matchesQuery && matchesCategory;
    });

    useEffect(() => {
        const savedHistory = localStorage.getItem(STORAGE_KEY);
        if (savedHistory) {
            setState(prev => ({ ...prev, history: JSON.parse(savedHistory) }));
        }

        fetch('/data/links.json')
            .then(res => res.json())
            .then(data => {
                setState(prev => ({ ...prev, links: data }));
            });
    }, []);

    if (!search) return null;

    return (
        <div className="search-modal" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="search-header">
                    <button type="button" className="search-back" onClick={closeSearch}>
                        <IoArrowBack />
                    </button>
                    <SearchBar
                        setSearch={(value) => setState(prev => ({ ...prev, query: value }))}
                        onSubmit={submitSearch}
                        placeholder="Search for pages, links, projects..."
                        isFilter={false}
                        />
                    <div className="search-shortcuts">
                        <kbd>Esc</kbd>
                        <span>to close</span>
                    </div>
            </div>

            {/* Categories */}
            <div className="search-categories">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        className={`category-tab ${state.activeCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setState(prev => ({ ...prev, activeCategory: cat.id }))}
                    >
                        {cat.icon && <cat.icon />}
                        <span>{cat.label}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="search-content">
                {/* History Section */}
                {!state.query && state.history.length > 0 && (
                    <div className="search-section">
                        <div className="section-header">
                            <IoTime />
                            <span>Recent Searches</span>
                        </div>
                        <div className="history-list">
                            {state.history.map((term, index) => (
                                <button
                                    key={index}
                                    className="history-item"
                                    onClick={() => handleHistoryClick(term)}
                                >
                                    <span>{term}</span>
                                    <IoClose
                                        className="history-remove"
                                        onClick={(e) => removeFromHistory(term, e)}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Results Section */}
                {(state.query || filteredLinks.length > 0) && (
                    <div className="search-section">
                        {state.query && (
                            <div className="section-header">
                                <HiOutlineGlobeAlt />
                                <span>Results</span>
                                <span className="result-count">{filteredLinks.length}</span>
                            </div>
                        )}

                        {filteredLinks.length > 0 ? (
                            <div className="results-list">
                                {filteredLinks.map((link, index) => (
                                    <Link
                                        href={link.path || '#'}
                                        key={index}
                                        className="result-item"
                                        onClick={() => addToHistory(state.query || link.name)}
                                    >
                                        <div className="result-icon">
                                            <FaLink />
                                        </div>
                                        <div className="result-info">
                                            <h4>{link.name}</h4>
                                            <p>{link.description}</p>
                                        </div>
                                        <div className="result-shortcut">
                                            <RiCommandLine />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : state.query && (
                            <div className="search-empty">
                                <div className="empty-icon">
                                    <IoSearch />
                                </div>
                                <h3>No results found</h3>
                                <p>Try searching for something else or check your spelling</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Empty State - No query, no history */}
                {!state.query && state.history.length === 0 && (
                    <div className="search-empty">
                        <div className="empty-icon">
                            <IoSearch />
                        </div>
                        <h3>Start searching</h3>
                        <p>Find pages, links, and projects across the platform</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="search-footer">
                <div className="footer-hints">
                    <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
                    <span><kbd>Enter</kbd> to select</span>
                    <span><kbd>Esc</kbd> to close</span>
                </div>
            </div>
        </div>
    );
}

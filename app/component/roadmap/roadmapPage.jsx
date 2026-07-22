'use client';
import { useState, useEffect } from 'react';

import { useSearchParams } from 'next/navigation';

import { LoadingContent } from '../ui/loading';
import { ErrorReload } from '../ui/error';

import { api } from '@/app/lib/axios';

import { useRouterActions } from '@/app/router/useRouterActions';

import { FaChevronRight, FaRoute } from 'react-icons/fa';
import Link from 'next/link';

export default function RoadmapPage() {
    const params = useSearchParams();
    const { navigate } = useRouterActions();

    const [roadmaps, setRoadmap] = useState({
        data: [],
        error: null,
        pending: true,
    });

    const [nodes, setNode] = useState({
        data: [],
        error: null,
        pending: true,
    });

    const [target, setTarget] = useState(0);

    const fetchRoadmap = async () => {
        try {
            const response = await api.get('/get/getRoadmap');

            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : [];

                if (data.length === 0) {
                    setRoadmap({
                        data: [],
                        error: {
                            status: response.status,
                            message: 'No roadmap data available',
                        },
                    });
                } else {
                    setRoadmap({
                        data: data,
                        error: null,
                    });
                }
            } else {
                setRoadmap({
                    data: [],
                    error: {
                        status: response.status,
                        message: response.data.message || 'Failed to fetch roadmap',
                    },
                });
            }
        } catch (error) {
            setRoadmap({
                data: [],
                error: {
                    status: error.response?.status || 500,
                    message: error.response?.data?.message || error.message || 'Internal Server Error',
                },
            });
        } finally {
            setRoadmap(prev => ({ ...prev, pending: false }));
        }
    };

    const fetchRoadmapNodes = async () => {
        if (!isSelected) return;
        setNode(prev => ({ ...prev, pending: true }));

        try {
            const response = await api.get('/get/getRoadmapNodes', {
                params: {
                    roadmapId: isSelected,
                },
            });

            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : [];

                if (data.length === 0) {
                    setNode({
                        data: [],
                        error: {
                            status: response.status,
                            message: 'No node data available',
                        },
                    });
                } else {
                    setNode({
                        data: data,
                        error: null,
                    });
                }
            } else {
                setNode({
                    data: [],
                    error: {
                        status: response.status,
                        message: response.data.message || 'Failed to fetch roadmap nodes',
                    },
                });
            }
        } catch (error) {
            setNode({
                data: [],
                error: {
                    status: error.response?.status || 500,
                    message: error.response?.data?.message || error.message || 'Internal Server Error',
                },
            });
        } finally {
            setNode(prev => ({ ...prev, pending: false }));
        }
    };

    const handleNodeClick = (index) => {
        setTarget(index);
    }

    const handleRoadmapClick = (roadmapId) => {
        navigate({ path: 'roadmap', query: { id: roadmapId } });
    };

    useEffect(() => {
        fetchRoadmap();
    }, []);

    useEffect(() => {
        if (!isSelected) return;
        fetchRoadmapNodes();
    }, [isSelected]);

    const selectedRoadmap = roadmaps.data.find(r => r.id === isSelected);

    return isSelected ? (
        <div id="roadmap_details">
            <div id="roadmap_badge">
                <div className="roadmap_breadcrumb">
                    <Link href="/roadmap" className="prev_breadcrumb_link" >Roadmaps</Link>
                    <FaChevronRight fontSize={12} />
                    <Link href={`/roadmap?id=${isSelected}`} className="current_breadcrumb_link" >
                        {selectedRoadmap?.title}
                    </Link>
                </div>
                {selectedRoadmap && (
                    <div className="badge_card">
                        <span>
                            {target + 1}
                        </span>
                        <div className="badge_stats">
                        </div>
                    </div>
                )}
            </div>
            <div id="roadmap_nodes">
                {nodes.pending ? (
                    <LoadingContent color={'var(--color-primary)'} />
                ) : nodes.error ? (
                    <ErrorReload data={nodes.error} />
                ) : (
                    nodes.data.map((node, index) => <Node key={index} data={node} handleNodeClick={() => handleNodeClick(index)} />)
                )}
            </div>
        </div>
    ) : (
        <section id="roadmap">
            <div className="roadmap-header">
                <h1>Developer Roadmaps</h1>
                <p>
                    Follow these career paths to structure your learning journey, master core technologies, and
                    discover recommended courses.
                </p>
            </div>
            {roadmaps.pending ? (
                <LoadingContent color={'var(--color-primary)'} />
            ) : roadmaps.error ? (
                <ErrorReload data={roadmaps.error} />
            ) : (
                <div id="roadmap_list">
                    {roadmaps.data.map((roadmap, index) => (
                        <div
                            key={index}
                            className="roadmap_card"
                            onClick={() => handleRoadmapClick(roadmap.id)}
                        >
                            <div className="card_decor_line"></div>
                            <div className="card_header">
                                <h3>{roadmap.title}</h3>
                                <span className="card_nodes_count">
                                    <FaRoute /> {roadmap.nodes} steps
                                </span>
                            </div>
                            <p>{roadmap.description}</p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
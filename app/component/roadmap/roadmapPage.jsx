'use client';
import { LoadingContent } from '../ui/loading';
import { ErrorReload } from '../ui/error';

import { useRouterActions } from '@/app/router/useRouterActions';

import { HiSparkles } from 'react-icons/hi2';

import { useQuery } from "@tanstack/react-query";
import { roadmapQueries } from "@/app/query/roadmap.query";

import { FaRoute } from 'react-icons/fa';

import "@/app/style/roadmap/roadmap.css";

export default function RoadmapPage() {
    const { navigate } = useRouterActions();

    const { data, isLoading, isError, error, refetch } = useQuery(roadmapQueries.list());

    return (
        // <div id="roadmap_details">
        //     <div id="roadmap_badge">
        //         <div className="roadmap_breadcrumb">
        //             <Link href="/roadmap" className="prev_breadcrumb_link" >Roadmaps</Link>
        //             <FaChevronRight fontSize={12} />
        //             <Link href={`/roadmap?id=${isSelected}`} className="current_breadcrumb_link" >
        //                 {selectedRoadmap?.title}
        //             </Link>
        //         </div>
        //         {selectedRoadmap && (
        //             <div className="badge_card">
        //                 <span>
        //                     {target + 1}
        //                 </span>
        //                 <div className="badge_stats">
        //                 </div>
        //             </div>
        //         )}
        //     </div>
        //     <div id="roadmap_nodes">
        //         {nodes.pending ? (
        //             <LoadingContent color={'var(--color-primary)'} />
        //         ) : nodes.error ? (
        //             <ErrorReload data={nodes.error} />
        //         ) : (
        //             nodes.data.map((node, index) => <Node key={index} data={node} handleNodeClick={() => handleNodeClick(index)} />)
        //         )}
        //     </div>
        // </div>
        <section className="shared_section" id="roadmap">
            <div className="header-content">
                <div className="header-text">
                    <span className="header-label">
                        <HiSparkles />
                        <span>Roadmaps</span>
                    </span>
                    <h1>Developr Roadmaps</h1>
                    <p>Follow these career paths to structure your learning journey, master core technologies, and discover recommended courses.</p>
                </div>
            </div>

            {
                isLoading ?
                    <LoadingContent color={'var(--color-primary)'} />
                    : isError ?
                        <ErrorReload data={error} refetch={() => refetch()} />
                        :
                        <div id="roadmap_list">
                            {data.map((roadmap, index) => (
                                <div
                                    key={index}
                                    className="roadmap_card"
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
            }
        </section>
    );
}
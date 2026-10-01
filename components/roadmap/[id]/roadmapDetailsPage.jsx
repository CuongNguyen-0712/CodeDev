'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouterActions } from '@/router/useRouterActions';
import { useQuery } from '@tanstack/react-query';
import { roadmapQueries } from '@/queries/roadmap.query';

import {
    FaPlay,
    FaClock,
    FaAward,
    FaSignal,
    FaChevronDown,
    FaChevronLeft,
    FaChevronRight,
    FaTrashAlt,
    FaEllipsisH,
    FaSearch,
    FaMinus,
    FaPlus,
    FaExpand,
    FaCompress,
    FaRoute,
    FaHistory,
    FaBookmark,
    FaRegLightbulb
} from 'react-icons/fa';

import {
    FiSend,
    FiShare2,
    FiMousePointer,
    FiMove,
    FiType,
    FiGitBranch,
    FiCheck,
    FiX,
    FiLayers
} from 'react-icons/fi';

import {
    HiSparkles,
    HiOutlineChatBubbleLeftRight
} from 'react-icons/hi2';

import {
    RiDashboardLine,
    RiPieChartLine,
    RiSettings4Line,
    RiUser3Line,
    RiLogoutBoxRLine
} from 'react-icons/ri';

import { LoadingContent } from '@/components/ui/loading';
import { ErrorReload } from '@/components/ui/error';

import '@/styles/roadmap/roadmapDetails.css';

// Initial chat history matching the reference screenshot
const INITIAL_CHAT_MESSAGES = [
    { id: 1, sender: 'user', text: 'can you generate me a road map for me to become a web developer ?' },
    { id: 2, sender: 'ai', text: 'Making A roadmap .....' },
    { id: 3, sender: 'ai', text: 'Here are a complete roadmap that you can follow for your web development career.' },
    { id: 4, sender: 'user', text: "I don't like the way it combines with other lessons, I want it to be more digestible" },
    { id: 5, sender: 'ai', text: 'Fixing the roadmap....' },
    { id: 6, sender: 'ai', text: 'Here are a revised roadmap version for more digestible content. Reminder that this will cost you more than the combined courses.' },
    { id: 7, sender: 'user', text: 'yeah, figures. How about combine the beginner or a lesson that is easy enough so that I can save some for the complex lesson' },
    { id: 8, sender: 'ai', text: 'Sure, here are more budget friendly option that you can choose from.' }
];

export default function RoadmapDetailsPage({ params, initialData = null }) {
    const { id } = params;
    const { navigate } = useRouterActions();

    // Query roadmap details
    const { data: queryData, isLoading, isError, error, refetch } = useQuery({
        ...roadmapQueries.details(id),
        initialData: initialData ? { success: true, data: initialData } : undefined,
    });

    const roadmapData = queryData?.data || initialData || {};
    const nodes = roadmapData?.nodes || [];
    const allRoadmaps = roadmapData?.allRoadmaps || [];

    // UI state
    const [isChatOpen, setIsChatOpen] = useState(true);
    const [isRoadmapDropdownOpen, setIsRoadmapDropdownOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState(INITIAL_CHAT_MESSAGES);
    const [chatInput, setChatInput] = useState('');
    const [activeTool, setActiveTool] = useState('select'); // 'select', 'connect', 'text', 'pan'
    const [previewCourse, setPreviewCourse] = useState(null);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    // Canvas Transform State (Pan & Zoom)
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 60, y: 60 });
    const [isPanning, setIsPanning] = useState(false);
    const [startPan, setStartPan] = useState({ x: 0, y: 0 });

    const canvasRef = useRef(null);
    const chatScrollRef = useRef(null);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Toast helper
    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3000);
    };

    // Pan Handlers
    const handleMouseDown = (e) => {
        // Only pan when clicking stage directly or if pan tool is selected
        if (e.target.closest('.map_node_card') || e.target.closest('.canvas_topbar') || e.target.closest('.canvas_floating_tools') || e.target.closest('.canvas_floating_zoom')) {
            return;
        }
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e) => {
        if (!isPanning) return;
        setPan({
            x: e.clientX - startPan.x,
            y: e.clientY - startPan.y
        });
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    // Wheel zoom
    const handleWheel = (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            setZoom((prev) => Math.min(Math.max(prev + delta, 0.4), 1.8));
        } else {
            // Regular wheel pans vertically/horizontally
            setPan((prev) => ({
                x: prev.x - e.deltaX * 0.8,
                y: prev.y - e.deltaY * 0.8
            }));
        }
    };

    // Zoom Controls
    const zoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 1.8));
    const zoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.4));
    const resetZoom = () => {
        setZoom(1);
        setPan({ x: 60, y: 60 });
    };

    // Send chat message
    const handleSendMessage = (e) => {
        e?.preventDefault();
        if (!chatInput.trim()) return;

        const userMsg = {
            id: Date.now(),
            sender: 'user',
            text: chatInput.trim()
        };

        setChatMessages((prev) => [...prev, userMsg]);
        const userPrompt = chatInput.trim().toLowerCase();
        setChatInput('');

        // Simulated AI response tailored to roadmap
        setTimeout(() => {
            let reply = "I can definitely help optimize this path for your learning goals! Click on any node to preview its courses or ask for recommended study durations.";
            if (userPrompt.includes('time') || userPrompt.includes('long') || userPrompt.includes('hours')) {
                reply = "Based on this roadmap, you can complete the core curriculum in approximately 12-16 weeks with 10 hours of focused study per week.";
            } else if (userPrompt.includes('beginner') || userPrompt.includes('easy')) {
                reply = "We recommend starting with the foundation nodes (HTML, CSS, Web Basics) before tackling modern frameworks. Each course has interactive quizzes to test your understanding.";
            } else if (userPrompt.includes('javascript') || userPrompt.includes('js')) {
                reply = "JavaScript is a core milestone in this roadmap! It unlocks both frontend frameworks (React, Vue) and backend development with Node.js.";
            }

            setChatMessages((prev) => [
                ...prev,
                { id: Date.now() + 1, sender: 'ai', text: reply }
            ]);
        }, 600);
    };

    // Copy share link
    const handleShare = () => {
        if (typeof window !== 'undefined') {
            navigator.clipboard.writeText(window.location.href);
            showToast('Roadmap link copied to clipboard!');
        }
    };

    /* ---------------------------------------------------------
       Graph Layout Generator
       Arranges nodes into a branching horizontal workflow matching Figure 1:
       Column 0: Node 1 (Root, centered)
       Column 1: Node 2 (Top branch), Node 3 (Bottom branch)
       Column 2: Node 4 (Converging milestone)
       Column 3+: Subsequent branching pairs or milestones
    --------------------------------------------------------- */
    const CARD_WIDTH = 300;
    const COL_GAP = 140; // horizontal gap between columns
    const ROW_GAP = 30;  // vertical gap between cards

    const nodePositions = [];
    const connections = [];

    if (nodes && nodes.length > 0) {
        // Layout algorithm:
        // Index 0 -> Col 0, center
        // Index 1, 2 -> Col 1, top & bottom (branches from Index 0)
        // Index 3 -> Col 2, center (converges from 1 & 2)
        // Index 4, 5 -> Col 3, top & bottom (branches from Index 3)
        // Index 6 -> Col 4, center
        let col = 0;
        let i = 0;

        while (i < nodes.length) {
            const colX = col * (CARD_WIDTH + COL_GAP);

            if (col % 2 === 0) {
                // Single centered card column
                const y = 230;
                nodePositions.push({
                    node: nodes[i],
                    x: colX,
                    y: y,
                    col,
                    isBranch: false,
                    index: i
                });

                // Connect from previous col
                if (col > 0) {
                    // Check if previous column had 2 branch nodes
                    const prevBranches = nodePositions.filter(p => p.col === col - 1);
                    prevBranches.forEach(prev => {
                        connections.push({
                            fromId: prev.node.id,
                            fromX: prev.x + CARD_WIDTH,
                            fromY: prev.y + 200,
                            toId: nodes[i].id,
                            toX: colX,
                            toY: y + 200
                        });
                    });
                }
                i += 1;
            } else {
                // Double branch column (2 cards stacked vertically)
                const nodeTop = nodes[i];
                const nodeBottom = nodes[i + 1];

                const topY = 40;
                const bottomY = 450;

                const prevCenter = nodePositions.find(p => p.col === col - 1);

                if (nodeTop) {
                    nodePositions.push({
                        node: nodeTop,
                        x: colX,
                        y: topY,
                        col,
                        isBranch: true,
                        branchPos: 'top',
                        index: i
                    });
                    if (prevCenter) {
                        connections.push({
                            fromId: prevCenter.node.id,
                            fromX: prevCenter.x + CARD_WIDTH,
                            fromY: prevCenter.y + 200,
                            toId: nodeTop.id,
                            toX: colX,
                            toY: topY + 200
                        });
                    }
                }

                if (nodeBottom) {
                    nodePositions.push({
                        node: nodeBottom,
                        x: colX,
                        y: bottomY,
                        col,
                        isBranch: true,
                        branchPos: 'bottom',
                        index: i + 1
                    });
                    if (prevCenter) {
                        connections.push({
                            fromId: prevCenter.node.id,
                            fromX: prevCenter.x + CARD_WIDTH,
                            fromY: prevCenter.y + 200,
                            toId: nodeBottom.id,
                            toX: colX,
                            toY: bottomY + 200
                        });
                    }
                }

                i += 2;
            }
            col += 1;
        }
    }

    if (isLoading && !initialData) {
        return (
            <div className="roadmap_map_container" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <LoadingContent color="#2563eb" />
            </div>
        );
    }

    if (isError && !initialData) {
        return (
            <div className="roadmap_map_container" style={{ alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                <ErrorReload data={error} refetch={() => refetch()} />
            </div>
        );
    }

    return (
        <div className="roadmap_map_container">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="roadmap_toast">
                    <FiCheck /> {toastMessage}
                </div>
            )}

            {/* 1. FAR-LEFT NAVIGATION RAIL */}
            <aside className="map_nav_rail">
                <Link href="/home" className="map_nav_logo" title="CodeDev Home">
                    L.
                </Link>

                <div className="map_nav_links">
                    <button
                        className="map_nav_btn"
                        title="Dashboard"
                        onClick={() => navigate({ path: 'home' })}
                    >
                        <RiDashboardLine />
                    </button>
                    <button
                        className="map_nav_btn active"
                        title="Roadmaps"
                        onClick={() => navigate({ path: 'roadmap' })}
                    >
                        <FaRoute />
                    </button>
                    <button
                        className="map_nav_btn"
                        title="Analytics"
                        onClick={() => navigate({ path: 'learning' })}
                    >
                        <RiPieChartLine />
                    </button>
                    <button
                        className="map_nav_btn"
                        title="Settings"
                        onClick={() => navigate({ path: 'settings' })}
                    >
                        <RiSettings4Line />
                    </button>
                </div>

                <div className="map_nav_bottom">
                    <button
                        className="map_nav_btn"
                        title="My Profile"
                        onClick={() => navigate({ path: 'profile' })}
                    >
                        <RiUser3Line />
                    </button>
                    <button
                        className="map_nav_btn"
                        title="Logout / Exit"
                        onClick={() => navigate({ path: 'home' })}
                    >
                        <RiLogoutBoxRLine />
                    </button>
                </div>
            </aside>

            {/* 2. AI CHAT / ASSISTANT SIDEBAR */}
            <aside className={`map_chat_sidebar ${isChatOpen ? '' : 'collapsed'}`}>
                {/* Toggle Tab */}
                <button
                    className="chat_toggle_tab"
                    title={isChatOpen ? 'Collapse Chat' : 'Expand Chat'}
                    onClick={() => setIsChatOpen(!isChatOpen)}
                >
                    {isChatOpen ? <FaChevronLeft /> : <FaChevronRight />}
                </button>

                {isChatOpen && (
                    <>
                        <div className="chat_sidebar_header">
                            <div className="chat_action_pills">
                                <button
                                    className="chat_pill_btn"
                                    onClick={() => setChatMessages(INITIAL_CHAT_MESSAGES)}
                                >
                                    <HiSparkles color="#2563eb" /> New Chat
                                </button>
                                <button
                                    className="chat_pill_btn"
                                    onClick={() => navigate({ path: 'roadmap' })}
                                >
                                    <FaBookmark color="#10b981" /> My Roadmap
                                </button>
                                <button className="chat_pill_btn">
                                    <FaHistory color="#6b7280" /> History
                                </button>
                            </div>

                            <div className="chat_model_selector">
                                <div className="chat_model_dropdown">
                                    <HiSparkles color="#8b5cf6" />
                                    <span>Lernr 1.4</span>
                                    <FaChevronDown fontSize={10} color="#94a3b8" />
                                </div>
                                <div className="chat_model_actions">
                                    <button
                                        className="chat_icon_btn"
                                        title="Clear chat"
                                        onClick={() => setChatMessages([])}
                                    >
                                        <FaTrashAlt />
                                    </button>
                                    <button className="chat_icon_btn" title="Options">
                                        <FaEllipsisH />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="chat_messages_scroll" ref={chatScrollRef}>
                            {chatMessages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`chat_message_item ${msg.sender === 'user' ? 'user' : 'ai'}`}
                                >
                                    <div className={`chat_avatar ${msg.sender === 'user' ? 'user' : 'ai'}`}>
                                        {msg.sender === 'user' ? 'U' : 'L.'}
                                    </div>
                                    <div className="chat_bubble">
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Chat Input Bar */}
                        <div className="chat_input_container">
                            <form className="chat_input_box" onSubmit={handleSendMessage}>
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="+ Ask Anything"
                                />
                                <button type="submit" className="chat_send_btn">
                                    <FiSend />
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </aside>

            {/* 3. MAIN MAP CANVAS VIEWPORT */}
            <main
                className="map_canvas_viewport"
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
            >
                {/* CANVAS TOP BAR */}
                <header className="canvas_topbar">
                    {/* Roadmap Title Dropdown */}
                    <div style={{ position: 'relative' }}>
                        <button
                            className="roadmap_dropdown_btn"
                            onClick={() => setIsRoadmapDropdownOpen(!isRoadmapDropdownOpen)}
                        >
                            <span>{roadmapData?.title || 'Web Development Roadmap'}</span>
                            <FaChevronDown fontSize={11} color="#64748b" />
                        </button>

                        {isRoadmapDropdownOpen && (
                            <div className="roadmap_dropdown_menu">
                                {allRoadmaps.map((r, idx) => (
                                    <div
                                        key={idx}
                                        className={`roadmap_dropdown_item ${r.id === id ? 'active' : ''}`}
                                        onClick={() => {
                                            setIsRoadmapDropdownOpen(false);
                                            navigate({ path: `roadmap/${r.id}` });
                                        }}
                                    >
                                        <span>{r.title}</span>
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{r.nodes} steps</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Top Actions */}
                    <div className="canvas_top_actions">
                        <button
                            className="top_action_btn"
                            onClick={() => setShowSummaryModal(true)}
                        >
                            <HiSparkles color="#2563eb" /> AI Summary
                        </button>
                        <button
                            className="top_action_btn"
                            onClick={handleShare}
                        >
                            <FiShare2 /> Share
                        </button>
                        <button
                            className="top_action_btn icon_only"
                            onClick={() => setIsRoadmapDropdownOpen(!isRoadmapDropdownOpen)}
                        >
                            <FaEllipsisH />
                        </button>
                    </div>
                </header>

                {/* INTERACTIVE STAGE */}
                <div
                    className={`canvas_stage ${isPanning ? 'is_panning' : ''}`}
                >
                    <div
                        className="canvas_transform_layer"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
                        }}
                    >
                        {/* SVG CONNECTORS OVERLAY */}
                        <svg className="canvas_svg_overlay">
                            <defs>
                                <marker
                                    id="map-arrow"
                                    markerWidth="8"
                                    markerHeight="8"
                                    refX="6"
                                    refY="4"
                                    orient="auto"
                                >
                                    <path d="M 1 1 L 7 4 L 1 7 Z" fill="#94a3b8" />
                                </marker>
                            </defs>

                            {connections.map((conn, idx) => {
                                // Orthogonal stepped line matching Figure 1
                                const midX = conn.fromX + (conn.toX - conn.fromX) / 2;
                                const pathData = `M ${conn.fromX} ${conn.fromY} L ${midX} ${conn.fromY} L ${midX} ${conn.toY} L ${conn.toX - 2} ${conn.toY}`;

                                return (
                                    <path
                                        key={idx}
                                        d={pathData}
                                        className="canvas_svg_line"
                                        markerEnd="url(#map-arrow)"
                                    />
                                );
                            })}
                        </svg>

                        {/* NODES LAYER */}
                        <div className="canvas_nodes_layer">
                            {nodePositions.map(({ node, x, y }, index) => {
                                const primaryCourse = (node.courses && node.courses[0]) || {};
                                const lessonsCount = primaryCourse.lessons || 10;
                                const durationText = `${lessonsCount > 10 ? lessonsCount + '+' : '10+'} Hours`;
                                const avgTimeText = `${Math.round(lessonsCount * 0.8) || 11} hours`;
                                const rewardXP = primaryCourse.reward ? `+${primaryCourse.reward}.000` : '+5.000';
                                const instructor = primaryCourse.language ? `${primaryCourse.language} Specialist` : 'Hannah Morgan';

                                // Gradient thumbnails for rich visuals matching Figure 1
                                const defaultThumbnails = [
                                    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80',
                                    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
                                    'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&auto=format&fit=crop&q=80',
                                    'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=600&auto=format&fit=crop&q=80',
                                    'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&auto=format&fit=crop&q=80'
                                ];
                                const thumbnailSrc = primaryCourse.image && !primaryCourse.image.endsWith('.ico')
                                    ? primaryCourse.image
                                    : defaultThumbnails[index % defaultThumbnails.length];

                                return (
                                    <div
                                        key={node.id}
                                        className="map_node_card"
                                        style={{ left: `${x}px`, top: `${y}px` }}
                                        onClick={() => {
                                            if (primaryCourse.id) {
                                                navigate({ path: `course/${primaryCourse.id}` });
                                            } else {
                                                setPreviewCourse({ ...primaryCourse, nodeTitle: node.title, nodeDesc: node.description });
                                            }
                                        }}
                                    >
                                        {/* Thumbnail Media */}
                                        <div className="node_thumbnail_wrap">
                                            <img
                                                src={thumbnailSrc}
                                                alt={node.title}
                                                className="node_thumbnail_img"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = defaultThumbnails[0];
                                                }}
                                            />
                                            <button
                                                className="node_play_overlay"
                                                title="Preview Course"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPreviewCourse({
                                                        ...primaryCourse,
                                                        nodeTitle: node.title,
                                                        nodeDesc: node.description,
                                                        thumbnailSrc
                                                    });
                                                }}
                                            >
                                                <FaPlay style={{ marginLeft: '2px' }} />
                                            </button>
                                        </div>

                                        {/* Card Body */}
                                        <div className="node_card_body">
                                            <div className="node_title_row">
                                                <h3 className="node_title_text">{node.title}</h3>
                                                <span className="node_duration_badge">{durationText}</span>
                                            </div>

                                            <span className="node_author_text">{instructor}</span>

                                            <p className="node_desc_text">
                                                {node.description || 'Comprehensive step covering core foundations, best practices, and practical projects.'}
                                            </p>

                                            {/* 3 Stats Grid */}
                                            <div className="node_stats_grid">
                                                <div className="node_stat_col">
                                                    <span className="node_stat_label">Avg. Time</span>
                                                    <FaClock className="node_stat_icon" />
                                                    <span className="node_stat_val">{avgTimeText}</span>
                                                </div>
                                                <div className="node_stat_col">
                                                    <span className="node_stat_label">Certificate</span>
                                                    <FaAward className="node_stat_icon" />
                                                    <span className="node_stat_val">Yes</span>
                                                </div>
                                                <div className="node_stat_col">
                                                    <span className="node_stat_label">Difficulty</span>
                                                    <FaSignal className="node_stat_icon" />
                                                    <span className="node_stat_val">
                                                        {roadmapData?.level ? roadmapData.level.charAt(0).toUpperCase() + roadmapData.level.slice(1) : 'Beginner'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Footer XP */}
                                        <div className="node_card_footer">
                                            <span className="node_xp_label">XP Earn</span>
                                            <span className="node_xp_value">{rewardXP}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 4. FLOATING BOTTOM CONTROLS */}
                {/* Center Toolbar */}
                <div className="canvas_floating_tools">
                    <button
                        className={`canvas_tool_btn ${activeTool === 'select' ? 'active' : ''}`}
                        title="Select Tool"
                        onClick={() => setActiveTool('select')}
                    >
                        <FiMousePointer />
                    </button>
                    <button
                        className={`canvas_tool_btn ${activeTool === 'connect' ? 'active' : ''}`}
                        title="Connect Nodes"
                        onClick={() => setActiveTool('connect')}
                    >
                        <FiGitBranch />
                    </button>
                    <button
                        className={`canvas_tool_btn ${activeTool === 'text' ? 'active' : ''}`}
                        title="Add Annotation"
                        onClick={() => setActiveTool('text')}
                    >
                        <FiType />
                    </button>
                    <button
                        className={`canvas_tool_btn ${activeTool === 'pan' ? 'active' : ''}`}
                        title="Hand / Pan Tool"
                        onClick={() => setActiveTool('pan')}
                    >
                        <FiMove />
                    </button>
                </div>

                {/* Bottom-Right Zoom Widget */}
                <div className="canvas_floating_zoom">
                    <button className="zoom_btn" title="Search nodes">
                        <FaSearch fontSize={11} />
                    </button>
                    <span
                        className="zoom_level_label"
                        title="Click to reset zoom"
                        onClick={resetZoom}
                    >
                        {Math.round(zoom * 100)}% <FaChevronDown fontSize={8} />
                    </span>
                    <button className="zoom_btn" title="Zoom Out" onClick={zoomOut}>
                        <FaMinus fontSize={10} />
                    </button>
                    <button className="zoom_btn" title="Zoom In" onClick={zoomIn}>
                        <FaPlus fontSize={10} />
                    </button>
                    <button className="zoom_btn" title="Fit View" onClick={resetZoom}>
                        <FaExpand fontSize={10} />
                    </button>
                </div>
            </main>

            {/* PREVIEW MODAL */}
            {previewCourse && (
                <div className="roadmap_modal_backdrop" onClick={() => setPreviewCourse(null)}>
                    <div className="roadmap_modal_box" onClick={(e) => e.stopPropagation()}>
                        <div className="modal_header_cover">
                            <img
                                src={previewCourse.thumbnailSrc || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80'}
                                alt={previewCourse.nodeTitle}
                            />
                            <button className="modal_close_btn" onClick={() => setPreviewCourse(null)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal_body_content">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                                    {previewCourse.nodeTitle}
                                </h2>
                                <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>
                                    {previewCourse.lessons || 14} Lessons
                                </span>
                            </div>

                            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                                {previewCourse.nodeDesc || 'Master core concepts with hands-on practice, real-world examples, and certification upon completion.'}
                            </p>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                                {previewCourse.id ? (
                                    <Link
                                        href={`/course/${previewCourse.id}`}
                                        className="modal_course_link_btn"
                                        style={{ flex: 1 }}
                                    >
                                        <FaPlay fontSize={12} /> Start Course
                                    </Link>
                                ) : (
                                    <button
                                        className="modal_course_link_btn"
                                        style={{ flex: 1 }}
                                        onClick={() => {
                                            setPreviewCourse(null);
                                            showToast('Course enrolled!');
                                        }}
                                    >
                                        <FaPlay fontSize={12} /> View Syllabus
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI SUMMARY MODAL */}
            {showSummaryModal && (
                <div className="roadmap_modal_backdrop" onClick={() => setShowSummaryModal(false)}>
                    <div className="roadmap_modal_box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <HiSparkles color="#2563eb" fontSize={20} />
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>AI Roadmap Summary</h3>
                            </div>
                            <button className="modal_close_btn" style={{ position: 'static', background: '#f1f5f9', color: '#334155' }} onClick={() => setShowSummaryModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#334155', margin: 0 }}>
                                <strong>{roadmapData?.title}</strong> is structured across <strong>{nodes.length} essential learning milestones</strong>. Completing this path prepares you with industry-level competencies, portfolio projects, and key architectural understanding.
                            </p>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>⚡ Recommended Pace:</span>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>• 10-12 hours per week for steady progress</span>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>• Estimated total duration: ~3 months</span>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>• Practice coding exercises after each milestone</span>
                            </div>
                            <button
                                className="modal_course_link_btn"
                                onClick={() => setShowSummaryModal(false)}
                            >
                                Got it, Let's Learn!
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

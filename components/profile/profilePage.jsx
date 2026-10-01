'use client';

import { useSession } from "next-auth/react";
import { useRouterActions } from "@/router/useRouterActions";
import { useApp } from "@/contexts/appContext";

import {
    FaBell,
    FaSearch,
    FaDownload,
    FaPen,
    FaFire,
    FaCheck,
    FaBolt,
    FaCertificate
} from "react-icons/fa";

import "@/styles/profile.css";

export default function ProfilePage() {
    const { data: session } = useSession();
    const { navigate } = useRouterActions();
    const { showAlert } = useApp();

    const user = session?.user || {
        name: "Alex Rivera",
        email: "alex.rivera@codedev.io",
        image: "/image/static/no_image.png",
        role: "Fullstack Engineer",
        track: "Web & Cloud Architecture",
        level: "Level 5 (Advanced)",
        experience: "3+ Years",
        status: "Pro Member",
        registeredDate: "20 Jan, 2023",
        rank: "#42 Global",
        devId: "#CD-0365",
        streak: 14,
        exercisesSolved: 120,
        codeVelocity: 97,
        retention: 85
    };

    const historyData = [
        {
            date: "20 Jan, 2024",
            course: "Next.js 15 & React 19 Fullstack Systems",
            complexity: "High",
            complexityType: "high",
            lessons: "48 / 48",
            status: "Certified",
            statusType: "cured"
        },
        {
            date: "12 Dec, 2023",
            course: "High-Performance Node.js & Microservices",
            complexity: "High",
            complexityType: "high",
            lessons: "52 / 52",
            status: "Certified",
            statusType: "cured"
        },
        {
            date: "20 Oct, 2023",
            course: "PostgreSQL Schema Design & High-Scale DB",
            complexity: "Medium",
            complexityType: "medium",
            lessons: "36 / 36",
            status: "Certified",
            statusType: "cured"
        },
        {
            date: "15 Sep, 2023",
            course: "Modern TypeScript Architecture & Clean Code",
            complexity: "Medium",
            complexityType: "medium",
            lessons: "42 / 42",
            status: "Certified",
            statusType: "cured"
        },
        {
            date: "02 Aug, 2023",
            course: "Docker, Kubernetes & Cloud Deployment",
            complexity: "High",
            complexityType: "high",
            lessons: "28 / 34",
            status: "In Progress",
            statusType: "pending"
        }
    ];

    const handleDownload = (item) => {
        showAlert(200, `Downloading verified certificate for: ${item.course}`);
    };

    return (
        <div className="profile-page-container">
            {/* TOP BREADCRUMB & ACTION BUTTONS */}
            <div className="profile-top-bar">
                <div className="profile-breadcrumbs">
                    <span className="crumb-step" onClick={() => navigate({ path: "home" })}>Dashboard</span>
                    <span className="crumb-sep">&gt;</span>
                    <span className="crumb-step">Developer Profile</span>
                    <span className="crumb-sep">&gt;</span>
                    <span className="crumb-current">{user.name}</span>
                </div>

                <div className="profile-header-actions">
                    <button
                        type="button"
                        className="profile-icon-btn"
                        onClick={() => showAlert(200, "You are up to date! No unread notifications.")}
                        title="Notifications"
                    >
                        <FaBell fontSize={15} />
                    </button>
                    <button
                        type="button"
                        className="profile-icon-btn"
                        onClick={() => navigate({ path: "settings" })}
                        title="Settings"
                    >
                        <FaSearch fontSize={15} />
                    </button>
                </div>
            </div>

            {/* HERO PROFILE CARD */}
            <div className="profile-hero-card">
                <div className="hero-user-column">
                    <div className="hero-avatar-wrap">
                        <img
                            src={user.image || "/image/static/no_image.png"}
                            alt={user.name}
                            className="hero-avatar-img"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "/image/static/no_image.png";
                            }}
                        />
                    </div>
                    <h2>{user.name}</h2>
                    <p className="user-email">{user.email}</p>
                    <button
                        type="button"
                        className="edit-profile-pill-btn"
                        onClick={() => navigate({ path: "settings" })}
                    >
                        <FaPen fontSize={11} />
                        <span>Edit Profile</span>
                    </button>
                </div>

                <div className="hero-divider" />

                <div className="hero-details-grid">
                    <div className="detail-item">
                        <span className="detail-label">Track</span>
                        <span className="detail-value">{user.track || "Fullstack Web"}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Skill Level</span>
                        <span className="detail-value">{user.level || "Level 5 (Advanced)"}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Experience</span>
                        <span className="detail-value">{user.experience || "3+ Years"}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Membership</span>
                        <span className="detail-value">{user.status || "Pro Member"}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Primary Stack</span>
                        <span className="detail-value">TypeScript / Next.js</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Member Since</span>
                        <span className="detail-value">{user.registeredDate || "20 Jan, 2023"}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Global Rank</span>
                        <span className="detail-value">{user.rank || "#42 Global"}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Developer ID</span>
                        <span className="detail-value">{user.devId || "#CD-0365"}</span>
                    </div>
                </div>
            </div>

            {/* CODING VITALS / STATS SECTION */}
            <div className="profile-vitals-section">
                <h3 className="section-headline">Developer Coding Vitals</h3>

                <div className="vitals-grid">
                    <div className="vital-card">
                        <span className="vital-label">Coding Streak</span>
                        <div className="vital-metric">
                            <span className="vital-value">{user.streak || 14}</span>
                            <span className="vital-unit">days</span>
                        </div>
                        <span className="vital-status status-green">🔥 In the zone</span>
                    </div>

                    <div className="vital-card">
                        <span className="vital-label">Exercises Solved</span>
                        <div className="vital-metric">
                            <span className="vital-value">{user.exercisesSolved || 120}</span>
                            <span className="vital-unit">tasks</span>
                        </div>
                        <span className="vital-status status-orange">⚡ Top 5% speed</span>
                    </div>

                    <div className="vital-card">
                        <span className="vital-label">Code Velocity</span>
                        <div className="vital-metric">
                            <span className="vital-value">{user.codeVelocity || 97}</span>
                            <span className="vital-unit">pts/wk</span>
                        </div>
                        <span className="vital-status status-green">✓ High output</span>
                    </div>

                    <div className="vital-card">
                        <span className="vital-label">Course Mastery</span>
                        <div className="vital-metric">
                            <span className="vital-value">{user.retention || 85}</span>
                            <span className="vital-unit">%</span>
                        </div>
                        <span className="vital-status status-green">✓ On track</span>
                    </div>
                </div>
            </div>

            {/* LEARNING HISTORY & CERTIFICATIONS TABLE */}
            <div className="profile-history-section">
                <div className="history-header-row">
                    <h3 className="section-headline">Course Learning & Certifications</h3>
                    <span className="history-total-count">Total 5 Courses Completed</span>
                </div>

                <div className="history-table-card">
                    <table className="history-table">
                        <thead>
                            <tr>
                                <th>Date Completed</th>
                                <th>Course / Track</th>
                                <th>Complexity</th>
                                <th>Progress</th>
                                <th>Status</th>
                                <th>Credential</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyData.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.date}</td>
                                    <td style={{ fontWeight: 600, color: "var(--color-text-heading)" }}>
                                        {item.course}
                                    </td>
                                    <td>
                                        <div className="severity-cell">
                                            <span className={`severity-bar bar-${item.complexityType}`} />
                                            <span className="severity-text">{item.complexity}</span>
                                        </div>
                                    </td>
                                    <td>{item.lessons}</td>
                                    <td>
                                        <span className={`status-pill status-${item.statusType}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="action-download-btn"
                                            onClick={() => handleDownload(item)}
                                        >
                                            <FaDownload />
                                            <span>Certificate</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
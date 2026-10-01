'use client';

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouterActions } from "@/router/useRouterActions";
import { useApp } from "@/contexts/appContext";

import {
    FaUser,
    FaLock,
    FaBell,
    FaCamera,
    FaGithub,
    FaGlobe,
    FaCode
} from "react-icons/fa";

import "@/styles/settings.css";

export default function SettingsPage() {
    const { data: session } = useSession();
    const { navigate } = useRouterActions();
    const { showAlert } = useApp();

    const [activeTab, setActiveTab] = useState("profile");

    const [formData, setFormData] = useState({
        fullName: session?.user?.name || "Alex Rivera",
        email: session?.user?.email || "alex.rivera@codedev.io",
        username: "alexrivera_dev",
        track: "Fullstack Web & Cloud Architecture",
        experience: "3+ Years",
        github: "https://github.com/alexrivera-dev",
        portfolio: "https://alexrivera.dev",
        bio: "Passionate software engineer learning fullstack Next.js, Node.js microservices, and distributed cloud systems on CodeDev.",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        streakAlerts: true,
        courseUpdates: true,
        codeReviewAlerts: true,
        weeklyDigest: true
    });

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = (e) => {
        e.preventDefault();
        showAlert(200, "Developer preferences and settings have been saved successfully!");
    };

    return (
        <div className="settings-page-container">
            {/* TOP BREADCRUMB */}
            <div className="settings-top-bar">
                <div className="settings-breadcrumbs">
                    <span className="crumb-step" onClick={() => navigate({ path: "home" })}>Dashboard</span>
                    <span className="crumb-sep">&gt;</span>
                    <span className="crumb-step" onClick={() => navigate({ path: "profile" })}>Profile</span>
                    <span className="crumb-sep">&gt;</span>
                    <span className="crumb-current">Developer Settings</span>
                </div>
            </div>

            {/* SETTINGS TABS */}
            <div className="settings-tabs-bar">
                <button
                    type="button"
                    className={`settings-tab-pill ${activeTab === "profile" ? "active" : ""}`}
                    onClick={() => setActiveTab("profile")}
                >
                    <FaUser fontSize={13} />
                    <span>Personal & Tech Info</span>
                </button>

                <button
                    type="button"
                    className={`settings-tab-pill ${activeTab === "security" ? "active" : ""}`}
                    onClick={() => setActiveTab("security")}
                >
                    <FaLock fontSize={13} />
                    <span>Security & Auth</span>
                </button>

                <button
                    type="button"
                    className={`settings-tab-pill ${activeTab === "notifications" ? "active" : ""}`}
                    onClick={() => setActiveTab("notifications")}
                >
                    <FaBell fontSize={13} />
                    <span>Learning Alerts</span>
                </button>
            </div>

            {/* SETTINGS MAIN FORM CARD */}
            <form onSubmit={handleSave} className="settings-card">
                {activeTab === "profile" && (
                    <>
                        <div className="settings-card-header">
                            <h3>Developer Profile Information</h3>
                            <p>Update your public developer identity, primary programming stack, and social links.</p>
                        </div>

                        {/* Avatar Row */}
                        <div className="settings-avatar-row">
                            <div className="settings-avatar-wrap">
                                <img
                                    src={session?.user?.image || "/image/static/no_image.png"}
                                    alt="User Avatar"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = "/image/static/no_image.png";
                                    }}
                                />
                            </div>
                            <div className="avatar-upload-actions">
                                <button
                                    type="button"
                                    className="btn-upload-avatar"
                                    onClick={() => showAlert(200, "Photo upload dialog opened")}
                                >
                                    <FaCamera />
                                    <span>Upload New Avatar</span>
                                </button>
                                <span className="avatar-hint">Recommended: Square JPG/PNG, minimum 400x400px</span>
                            </div>
                        </div>

                        {/* Form Grid */}
                        <div className="settings-form-grid">
                            <div className="settings-form-group">
                                <label className="settings-label">Full Name</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    value={formData.fullName}
                                    onChange={(e) => handleChange("fullName", e.target.value)}
                                    placeholder="Enter full name"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">Email Address</label>
                                <input
                                    type="email"
                                    className="settings-input"
                                    value={formData.email}
                                    onChange={(e) => handleChange("email", e.target.value)}
                                    placeholder="Enter email address"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">Username</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    value={formData.username}
                                    onChange={(e) => handleChange("username", e.target.value)}
                                    placeholder="username"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">Primary Track & Specialty</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    value={formData.track}
                                    onChange={(e) => handleChange("track", e.target.value)}
                                    placeholder="e.g. Fullstack Web & Cloud Architecture"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">GitHub Profile URL</label>
                                <input
                                    type="url"
                                    className="settings-input"
                                    value={formData.github}
                                    onChange={(e) => handleChange("github", e.target.value)}
                                    placeholder="https://github.com/username"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">Portfolio / Blog Website</label>
                                <input
                                    type="url"
                                    className="settings-input"
                                    value={formData.portfolio}
                                    onChange={(e) => handleChange("portfolio", e.target.value)}
                                    placeholder="https://yourdomain.dev"
                                />
                            </div>

                            <div className="settings-form-group full-width">
                                <label className="settings-label">Developer Bio & Summary</label>
                                <textarea
                                    className="settings-textarea"
                                    value={formData.bio}
                                    onChange={(e) => handleChange("bio", e.target.value)}
                                    placeholder="Share your engineering background, favorite tech stack, and goals..."
                                />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === "security" && (
                    <>
                        <div className="settings-card-header">
                            <h3>Security & Authentication</h3>
                            <p>Manage your account password, active sessions, and multi-factor authentication.</p>
                        </div>

                        <div className="settings-form-grid">
                            <div className="settings-form-group full-width">
                                <label className="settings-label">Current Password</label>
                                <input
                                    type="password"
                                    className="settings-input"
                                    value={formData.currentPassword}
                                    onChange={(e) => handleChange("currentPassword", e.target.value)}
                                    placeholder="••••••••"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">New Password</label>
                                <input
                                    type="password"
                                    className="settings-input"
                                    value={formData.newPassword}
                                    onChange={(e) => handleChange("newPassword", e.target.value)}
                                    placeholder="••••••••"
                                />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">Confirm New Password</label>
                                <input
                                    type="password"
                                    className="settings-input"
                                    value={formData.confirmPassword}
                                    onChange={(e) => handleChange("confirmPassword", e.target.value)}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="toggle-settings-list">
                            <div className="toggle-item">
                                <div className="toggle-info">
                                    <span className="toggle-title">Two-Factor Authentication (2FA)</span>
                                    <span className="toggle-desc">Require an authenticator code (Google Authenticator / 1Password) on sign in.</span>
                                </div>
                                <label className="switch-control">
                                    <input type="checkbox" defaultChecked />
                                    <span className="slider-round" />
                                </label>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === "notifications" && (
                    <>
                        <div className="settings-card-header">
                            <h3>Learning & Platform Alerts</h3>
                            <p>Customize how and when you want to receive course progress, streak, and community updates.</p>
                        </div>

                        <div className="toggle-settings-list">
                            <div className="toggle-item">
                                <div className="toggle-info">
                                    <span className="toggle-title">Daily Streak & Practice Reminders</span>
                                    <span className="toggle-desc">Get notified before your coding streak expires to maintain momentum.</span>
                                </div>
                                <label className="switch-control">
                                    <input
                                        type="checkbox"
                                        checked={formData.streakAlerts}
                                        onChange={(e) => handleChange("streakAlerts", e.target.checked)}
                                    />
                                    <span className="slider-round" />
                                </label>
                            </div>

                            <div className="toggle-item">
                                <div className="toggle-info">
                                    <span className="toggle-title">Course Releases & Curriculum Updates</span>
                                    <span className="toggle-desc">Stay informed when new exercises, modules, or tracks are published.</span>
                                </div>
                                <label className="switch-control">
                                    <input
                                        type="checkbox"
                                        checked={formData.courseUpdates}
                                        onChange={(e) => handleChange("courseUpdates", e.target.checked)}
                                    />
                                    <span className="slider-round" />
                                </label>
                            </div>

                            <div className="toggle-item">
                                <div className="toggle-info">
                                    <span className="toggle-title">Weekly Developer Performance Digest</span>
                                    <span className="toggle-desc">Receive a summary of problems solved, XP gained, and global rank every Monday.</span>
                                </div>
                                <label className="switch-control">
                                    <input
                                        type="checkbox"
                                        checked={formData.weeklyDigest}
                                        onChange={(e) => handleChange("weeklyDigest", e.target.checked)}
                                    />
                                    <span className="slider-round" />
                                </label>
                            </div>
                        </div>
                    </>
                )}

                {/* ACTION FOOTER */}
                <div className="settings-actions-footer">
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => navigate({ path: "profile" })}
                    >
                        Cancel
                    </button>
                    <button type="submit" className="btn-save-settings">
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
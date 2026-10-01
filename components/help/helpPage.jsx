'use client';

import { useState } from "react";
import { useRouterActions } from "@/router/useRouterActions";
import { useApp } from "@/contexts/appContext";

import {
    FaSearch,
    FaTerminal,
    FaGraduationCap,
    FaCertificate,
    FaCreditCard,
    FaChevronDown,
    FaHeadset,
    FaCode,
    FaRocket
} from "react-icons/fa";

import "@/styles/help.css";

const CATEGORIES = [
    {
        id: "getting-started",
        title: "Getting Started",
        desc: "Learn how to navigate CodeDev, follow roadmaps, and solve your first exercise.",
        icon: FaRocket,
        colorClass: ""
    },
    {
        id: "compiler",
        title: "Compiler & Sandbox",
        desc: "How automated test cases evaluate code, debugging tips, and terminal commands.",
        icon: FaTerminal,
        colorClass: "blue"
    },
    {
        id: "certificates",
        title: "Certificates & Badges",
        desc: "Earning verified milestone certificates, accumulating XP, and daily streaks.",
        icon: FaCertificate,
        colorClass: "green"
    },
    {
        id: "membership",
        title: "Membership & Billing",
        desc: "Manage CodeDev Pro subscriptions, team seat licenses, and invoice history.",
        icon: FaCreditCard,
        colorClass: "amber"
    }
];

const FAQS = [
    {
        q: "How does the in-browser compiler evaluate my code submissions?",
        a: "When you click 'Run Code' or 'Submit', your code is executed in an isolated, secure container sandbox. It runs against hidden test cases, edge cases, and performance criteria to verify algorithmic correctness before awarding XP and marking the lesson complete."
    },
    {
        q: "How do I earn verified course completion certificates?",
        a: "Complete 100% of the lessons, practice exercises, and the final milestone project in any curriculum track. Once verified, a signed digital certificate with a verifiable credential ID and QR code is generated for download and LinkedIn sharing."
    },
    {
        q: "What happens if I miss a day on my daily coding streak?",
        a: "Daily streaks count consecutive days where you solved at least one lesson or coding problem. If you miss a 24-hour cycle, your streak resets. CodeDev Pro members receive 1 automatic 'Streak Freeze' each month to protect their progress."
    },
    {
        q: "Can I connect my GitHub profile to showcase completed projects?",
        a: "Yes! In your Developer Settings, you can link your GitHub account. CodeDev can automatically sync your milestone repositories, display your verified skill badges, and feature your projects on your developer profile."
    },
    {
        q: "How do I upgrade or extend my CodeDev Pro membership?",
        a: "You can click on the 'Check Now' button in the sidebar or navigate to Developer Settings > Membership to upgrade to Pro, granting unlimited compiler compute, AI code assistance, and access to all career roadmaps."
    },
    {
        q: "What should I do if my code gets stuck in an infinite loop or times out?",
        a: "Our sandbox enforces an execution timeout (typically 5 seconds) to prevent frozen processes. If your code times out, check your loop exit conditions and recursion base cases. You can also reset the lesson starter template at any time."
    }
];

export default function HelpPage() {
    const { navigate } = useRouterActions();
    const { showAlert } = useApp();

    const [searchQuery, setSearchQuery] = useState("");
    const [openFaq, setOpenFaq] = useState(0);

    const handleCategoryClick = (category) => {
        showAlert(200, `Viewing guides and tutorials for: ${category.title}`);
    };

    const handleQuickTag = (tag) => {
        setSearchQuery(tag);
    };

    const filteredFaqs = FAQS.filter(
        faq =>
            faq.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.a.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="help-page-container">
            {/* TOP BREADCRUMB */}
            <div className="help-top-bar">
                <div className="help-breadcrumbs">
                    <span className="crumb-step" onClick={() => navigate({ path: "home" })}>Dashboard</span>
                    <span className="crumb-sep">&gt;</span>
                    <span className="crumb-current">Developer Help & Documentation</span>
                </div>
            </div>

            {/* HERO SEARCH CARD */}
            <div className="help-hero-card">
                <h2 className="help-hero-title">How can we help you learn today?</h2>
                <p className="help-hero-subtitle">
                    Search documentation, interactive sandbox guides, course FAQs, and developer community resources.
                </p>

                <div className="help-search-box">
                    <FaSearch />
                    <input
                        type="text"
                        className="help-search-input"
                        placeholder="Search courses, compiler errors, certificates, roadmaps..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="help-quick-tags">
                    <span>Popular Topics:</span>
                    <button type="button" className="quick-tag-pill" onClick={() => handleQuickTag("Compiler")}>
                        Compiler Sandbox
                    </button>
                    <button type="button" className="quick-tag-pill" onClick={() => handleQuickTag("Certificate")}>
                        Certificates
                    </button>
                    <button type="button" className="quick-tag-pill" onClick={() => handleQuickTag("Streak")}>
                        Coding Streak
                    </button>
                    <button type="button" className="quick-tag-pill" onClick={() => handleQuickTag("Pro")}>
                        Pro Membership
                    </button>
                </div>
            </div>

            {/* CATEGORIES SECTION */}
            <div className="help-categories-section">
                <h3 className="section-headline">Browse Documentation By Category</h3>

                <div className="help-categories-grid">
                    {CATEGORIES.map((cat) => {
                        const IconComponent = cat.icon;
                        return (
                            <div
                                key={cat.id}
                                className="help-category-card"
                                onClick={() => handleCategoryClick(cat)}
                            >
                                <div className={`category-icon-box ${cat.colorClass}`}>
                                    <IconComponent />
                                </div>
                                <h4>{cat.title}</h4>
                                <p>{cat.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* FAQ SECTION */}
            <div className="help-faq-section">
                <h3 className="section-headline">Frequently Asked Questions</h3>

                <div className="faq-card-container">
                    {filteredFaqs.length > 0 ? (
                        filteredFaqs.map((faq, index) => {
                            const isOpen = openFaq === index;
                            return (
                                <div key={index} className={`faq-item ${isOpen ? "open" : ""}`}>
                                    <button
                                        type="button"
                                        className="faq-question-btn"
                                        onClick={() => setOpenFaq(isOpen ? null : index)}
                                    >
                                        <span>{faq.q}</span>
                                        <FaChevronDown className="faq-chevron" />
                                    </button>
                                    {isOpen && (
                                        <div className="faq-answer">
                                            {faq.a}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div style={{ padding: "30px", textAlign: "center", color: "var(--color-text-secondary)" }}>
                            No matching documentation or FAQs found for "{searchQuery}".
                        </div>
                    )}
                </div>
            </div>

            {/* SUPPORT CONTACT CARD */}
            <div className="help-support-card">
                <div className="support-left">
                    <div className="support-icon-circle">
                        <FaHeadset />
                    </div>
                    <div className="support-text">
                        <h4>Need assistance with a coding exercise or account?</h4>
                        <p>Our engineering mentors and developer support team are available 24/7 to help you keep building.</p>
                    </div>
                </div>

                <button
                    type="button"
                    className="btn-contact-support"
                    onClick={() => showAlert(200, "Support ticket created. A mentor will reach out shortly!")}
                >
                    Contact Mentor Support
                </button>
            </div>
        </div>
    );
}
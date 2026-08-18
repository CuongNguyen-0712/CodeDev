"use client";

import { useState } from "react";
import { useRouterActions } from "@/app/router/useRouterActions";
import {
    FaRocket,
    FaGraduationCap,
    FaArrowRight,
    FaTrophy,
    FaTerminal,
    FaLaptopCode,
    FaStar,
    FaFire
} from "react-icons/fa";
import { TbSourceCode, TbRoute, TbUsersGroup, TbCertificate } from "react-icons/tb";

import "@/app/style/index.css";

export default function IndexPage() {
    const { navigate } = useRouterActions();
    const [activeTab, setActiveTab] = useState("js");

    const codeSnippets = {
        js: `// Welcome to CodeDev Interactive Platform
const developer = {
name: "Alex",
level: "Fullstack Engineer",
skills: ["React", "Next.js", "Node.js", "PostgreSQL"],
streak: "14 Days"
};

function startLearning(track) {
console.log(\`🚀 Launching career track: \${track}\`);
return { status: "Active", progress: "100%" };
}

startLearning("Fullstack Mastery");`,
        python: `# CodeDev Python Data & Backend Track
class Developer:
    def __init__(self, name, track):
        self.name = name
        self.track = track
        self.points = 1250

    def complete_lesson(self, lesson_id):
        self.points += 50
        print(f"✅ Mastered {lesson_id}! XP: {self.points}")

dev = Developer("Sarah", "Backend Systems")
dev.complete_lesson("Asyncio Microservices")`,
        sql: `-- Real-time Database Queries
SELECT 
    u.username,
    r.name AS role,
    COUNT(c.id) AS completed_courses
FROM private.users u
JOIN private.user_roles ur ON u.id = ur.user_id
JOIN private.roles r ON ur.role_id = r.id
LEFT JOIN course.register c ON u.public_id = c.user_id
GROUP BY u.username, r.name
ORDER BY completed_courses DESC;`
    };

    return (
        <div id="index_page">
            {/* HERO SECTION */}
            <section className="hero_section">
                <div className="hero_badge">
                    <span className="badge_icon">
                        <FaFire fontSize={16} color={'var(--orange-500)'} />
                    </span>
                    <span>Next-Gen Interactive Developer Platform</span>
                </div>

                <h1 className="hero_title">
                    Master Modern Coding & Build <span className="text_gradient">Real Engineering Careers</span>
                </h1>

                <p className="hero_description">
                    Empowering developers with structured career roadmaps, interactive coding courses, real-time code runners, and an active developer community.
                </p>

                <div className="hero_actions">
                    <button className="btn_primary" onClick={() => navigate({ path: '/course' })}>
                        <FaRocket /> Explore Courses <FaArrowRight />
                    </button>
                    <button className="btn_secondary" onClick={() => navigate({ path: '/roadmap' })}>
                        <TbRoute /> Career Roadmaps
                    </button>
                    <button className="btn_tertiary" onClick={() => navigate({ path: '/auth' })}>
                        <FaLaptopCode /> Get Started Free
                    </button>
                </div>

                {/* IDE MOCKUP */}
                <div className="hero_ide_wrapper">
                    <div className="ide_window">
                        <div className="ide_header">
                            <div className="ide_dots">
                                <span className="dot dot_red"></span>
                                <span className="dot dot_yellow"></span>
                                <span className="dot dot_green"></span>
                            </div>
                            <div className="ide_tabs">
                                <button
                                    type="button"
                                    className={`ide_tab ${activeTab === 'js' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('js')}
                                >
                                    main.js
                                </button>
                                <button
                                    type="button"
                                    className={`ide_tab ${activeTab === 'python' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('python')}
                                >
                                    app.py
                                </button>
                                <button
                                    type="button"
                                    className={`ide_tab ${activeTab === 'sql' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('sql')}
                                >
                                    query.sql
                                </button>
                            </div>
                            <span className="ide_status_badge">
                                <span className="pulse_dot"></span> Live Runner
                            </span>
                        </div>
                        <div className="ide_body">
                            <pre className="ide_code">
                                <code>{codeSnippets[activeTab]}</code>
                            </pre>
                        </div>
                        <div className="ide_footer">
                            <div className="ide_output">
                                <FaTerminal className="term_icon" />
                                <span>Output: Process executed successfully with 0 errors</span>
                            </div>
                            <span className="ide_lang">{activeTab.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* STATS STRIP */}
            <section className="stats_section">
                <div className="stat_item">
                    <h3>15,000+</h3>
                    <p>Active Learners</p>
                </div>
                <div className="stat_divider"></div>
                <div className="stat_item">
                    <h3>50+</h3>
                    <p>Interactive Courses</p>
                </div>
                <div className="stat_divider"></div>
                <div className="stat_item">
                    <h3>120+</h3>
                    <p>Practical Lessons</p>
                </div>
                <div className="stat_divider"></div>
                <div className="stat_item">
                    <h3>99.4%</h3>
                    <p>Satisfaction Rate</p>
                </div>
            </section>

            {/* FEATURES GRID */}
            <section className="features_section">
                <div className="section_header">
                    <span className="section_tag">WHY CHOOSE CODEDEV</span>
                    <h2>Everything You Need to Succeed in Tech</h2>
                    <p>An all-in-one learning ecosystem optimized for developers from beginner to senior.</p>
                </div>

                <div className="features_grid">
                    <div className="feature_card">
                        <div className="feature_icon_box icon_blue">
                            <TbSourceCode />
                        </div>
                        <h3>Interactive Code Runner</h3>
                        <p>Write, execute, and test code directly in your browser with instant automated feedback — zero local setup required.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_teal">
                            <TbRoute />
                        </div>
                        <h3>Guided Career Roadmaps</h3>
                        <p>Follow clear, step-by-step learning paths tailored for Frontend, Backend, Fullstack, and Cloud Engineering.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_purple">
                            <TbUsersGroup />
                        </div>
                        <h3>Dev Community & Teams</h3>
                        <p>Connect with fellow developers, form project teams, share insights, and join interactive coding challenges.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_amber">
                            <FaTrophy />
                        </div>
                        <h3>Gamified Progress & Badges</h3>
                        <p>Earn XP points, unlock achievements, maintain study streaks, and rank on the global leaderboard.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_emerald">
                            <FaLaptopCode />
                        </div>
                        <h3>Real-World Projects</h3>
                        <p>Build portfolio-ready web apps, REST APIs, and database schemas with production-grade tools.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_rose">
                            <TbCertificate />
                        </div>
                        <h3>Verified Certificates</h3>
                        <p>Validate your skills with shareable certificates and completion badges recognized by top employers.</p>
                    </div>
                </div>
            </section>

            {/* ROADMAP PREVIEW */}
            <section className="roadmaps_preview_section">
                <div className="section_header">
                    <span className="section_tag">STRUCTURED LEARNING</span>
                    <h2>Popular Career Roadmaps</h2>
                    <p>Choose your track and master the exact skills top tech companies look for.</p>
                </div>

                <div className="roadmap_cards_grid">
                    <div className="roadmap_card" onClick={() => navigate({ path: '/roadmap' })}>
                        <div className="roadmap_card_header">
                            <span className="badge_pill pill_blue">Frontend</span>
                            <FaStar className="star_icon" />
                        </div>
                        <h3>Frontend Web Engineer</h3>
                        <p>Master modern web interfaces with HTML5, CSS3, JavaScript ES6+, React, Next.js, and Web Performance.</p>
                        <div className="roadmap_card_footer">
                            <span>12 Chapters • 45 Lessons</span>
                            <span className="link_text">View Path <FaArrowRight /></span>
                        </div>
                    </div>

                    <div className="roadmap_card" onClick={() => navigate({ path: '/roadmap' })}>
                        <div className="roadmap_card_header">
                            <span className="badge_pill pill_teal">Backend</span>
                            <FaStar className="star_icon" />
                        </div>
                        <h3>Backend Systems & APIs</h3>
                        <p>Build high-performance servers, database architectures, REST & GraphQL APIs with Node.js, Express, and PostgreSQL.</p>
                        <div className="roadmap_card_footer">
                            <span>14 Chapters • 52 Lessons</span>
                            <span className="link_text">View Path <FaArrowRight /></span>
                        </div>
                    </div>

                    <div className="roadmap_card" onClick={() => navigate({ path: '/roadmap' })}>
                        <div className="roadmap_card_header">
                            <span className="badge_pill pill_purple">Fullstack</span>
                            <FaStar className="star_icon" />
                        </div>
                        <h3>Fullstack Web Specialist</h3>
                        <p>Combine frontend UI elegance with backend power. Deploy end-to-end applications to Vercel and Cloud environments.</p>
                        <div className="roadmap_card_footer">
                            <span>18 Chapters • 70 Lessons</span>
                            <span className="link_text">View Path <FaArrowRight /></span>
                        </div>
                    </div>
                </div>
            </section>

            {/* CALL TO ACTION */}
            <section className="cta_section">
                <div className="cta_card">
                    <div className="cta_content">
                        <h2>Ready to Elevate Your Developer Career?</h2>
                        <p>Join CodeDev today for free and start building software that matters.</p>
                        <div className="cta_buttons">
                            <button className="btn_primary_white" onClick={() => navigate({ path: '/auth' })}>
                                <FaRocket /> Create Free Account
                            </button>
                            <button className="btn_outline_white" onClick={() => navigate({ path: '/course' })}>
                                <FaGraduationCap /> Browse All Courses
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
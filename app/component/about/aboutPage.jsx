'use client';

import { useRouterActions } from "@/app/router/useRouterActions";
import {
    FaRocket,
    FaGraduationCap,
    FaArrowRight,
    FaTrophy,
    FaTerminal,
    FaLaptopCode,
    FaCode,
    FaUsers,
    FaHeart,
    FaLightbulb,
    FaAward,
    FaCompass,
    FaLayerGroup,
    FaShieldAlt,
    FaCheckCircle,
    FaFire
} from "react-icons/fa";
import {
    TbSourceCode,
    TbRoute,
    TbUsersGroup,
    TbCertificate,
    TbTargetArrow,
    TbSparkles,
    TbCpu,
    TbLayersLinked
} from "react-icons/tb";
import { HiSparkles } from "react-icons/hi2";

import "@/app/style/about.css";

export default function AboutPage() {
    const { navigate } = useRouterActions();

    const values = [
        {
            icon: <TbSourceCode />,
            colorClass: "icon_blue",
            title: "Practice-First Learning",
            description: "We believe programming is best learned by writing real code. Every lesson is paired with interactive in-browser execution, tests, and instant feedback."
        },
        {
            icon: <TbRoute />,
            colorClass: "icon_teal",
            title: "Structured Roadmaps",
            description: "No more guessing what to learn next. Our curated paths guide developers from foundational syntax to production-ready software engineering."
        },
        {
            icon: <TbUsersGroup />,
            colorClass: "icon_purple",
            title: "Collaborative Community",
            description: "Learning is exponential when shared. Connect with peers, form study teams, review pull requests, and solve challenges together."
        },
        {
            icon: <FaLightbulb />,
            colorClass: "icon_amber",
            title: "Modern Industry Standards",
            description: "Curriculum built around contemporary stacks: React 19, Next.js App Router, Serverless PostgreSQL, Node.js, and Cloud architectures."
        },
        {
            icon: <FaShieldAlt />,
            colorClass: "icon_emerald",
            title: "Accessible & Open",
            description: "Quality engineering education should be barrier-free. We design inclusive, responsive interfaces optimized for learners worldwide."
        },
        {
            icon: <TbCertificate />,
            colorClass: "icon_rose",
            title: "Verifiable Outcomes",
            description: "Earn demonstrable credentials, build portfolio-grade projects, and gain real-world confidence demanded by top tech companies."
        }
    ];

    const milestones = [
        {
            phase: "Phase 01",
            title: "The Inception",
            tag: "Foundation",
            desc: "Started with a core vision: replace passive video tutorials with an interactive, in-browser sandbox runner."
        },
        {
            phase: "Phase 02",
            title: "Career Tracks Launch",
            tag: "Curriculum",
            desc: "Introduced full-length career roadmaps for Frontend, Backend, and Fullstack systems with structured milestones."
        },
        {
            phase: "Phase 03",
            title: "Ecosystem & Collaboration",
            tag: "Community",
            desc: "Integrated serverless database environments (Neon DB), role-based permissions, teams, and social profiles."
        },
        {
            phase: "Phase 04",
            title: "Intelligent Future",
            tag: "Innovation",
            desc: "Expanding with AI-assisted code diagnostics, interactive system architecture sandboxes, and global hackathons."
        }
    ];

    const stats = [
        { count: "15,000+", label: "Active Developers" },
        { count: "50+", label: "Structured Modules" },
        { count: "120+", label: "Interactive Lessons" },
        { count: "99.4%", label: "Satisfaction Rate" }
    ];

    return (
        <div id="about_page">
            {/* HERO SECTION */}
            <section className="about_hero">
                <div className="about_badge">
                    <HiSparkles className="badge_sparkle" />
                    <span>Our Story & Mission</span>
                </div>

                <h1 className="about_hero_title">
                    Pioneering the Future of <span className="text_gradient">Developer Education</span>
                </h1>

                <p className="about_hero_desc">
                    CodeDev was founded on a singular premise: anyone with curiosity and dedication deserves a practical, high-impact pathway to becoming a world-class software engineer.
                </p>

                <div className="about_tags_strip">
                    <span className="tag_pill"><FaLaptopCode /> Interactive IDE</span>
                    <span className="tag_pill"><TbRoute /> Career Tracks</span>
                    <span className="tag_pill"><TbUsersGroup /> Dev Community</span>
                    <span className="tag_pill"><FaTrophy /> Gamified Progress</span>
                </div>
            </section>

            {/* MISSION & VISION DUAL CARDS */}
            <section className="about_mission_section">
                <div className="mission_card mission_gradient">
                    <div className="card_header_icon icon_primary">
                        <TbTargetArrow />
                    </div>
                    <span className="card_sub_title">OUR PURPOSE</span>
                    <h2>Our Mission</h2>
                    <p>
                        To eliminate the divide between theoretical coding concepts and real-world engineering reality. We equip learners with hands-on problem-solving skills, deep architectural understanding, and the mental models needed to build scalable digital systems.
                    </p>
                    <ul className="mission_highlights">
                        <li><FaCheckCircle className="check_icon" /> Zero-setup browser IDE runner for immediate practice</li>
                        <li><FaCheckCircle className="check_icon" /> Real-world project blueprints reflecting actual industry requirements</li>
                        <li><FaCheckCircle className="check_icon" /> Mentorship and peer-review culture that accelerates mastery</li>
                    </ul>
                </div>

                <div className="mission_card vision_gradient">
                    <div className="card_header_icon icon_secondary">
                        <FaCompass />
                    </div>
                    <span className="card_sub_title">OUR HORIZON</span>
                    <h2>Our Vision</h2>
                    <p>
                        To become the global home for developers — where aspiring coders evolve into architects, where experienced engineers refine their craft, and where continuous learning is as natural as writing code.
                    </p>
                    <ul className="mission_highlights">
                        <li><FaCheckCircle className="check_icon" /> Universal access to high-caliber software engineering curricula</li>
                        <li><FaCheckCircle className="check_icon" /> Seamless transition from education to high-growth tech careers</li>
                        <li><FaCheckCircle className="check_icon" /> A vibrant, collaborative global network of creators and engineers</li>
                    </ul>
                </div>
            </section>

            {/* PLATFORM METRICS */}
            <section className="about_stats_section">
                {stats.map((stat, idx) => (
                    <div key={idx} className="about_stat_item">
                        <h3>{stat.count}</h3>
                        <p>{stat.label}</p>
                    </div>
                ))}
            </section>

            {/* CORE VALUES */}
            <section className="about_values_section">
                <div className="section_header">
                    <span className="section_tag">OUR PILLARS</span>
                    <h2>Values That Guide Everything We Build</h2>
                    <p>The engineering principles and educational philosophy behind every feature on CodeDev.</p>
                </div>

                <div className="values_grid">
                    {values.map((v, idx) => (
                        <div key={idx} className="value_card">
                            <div className={`value_icon_box ${v.colorClass}`}>
                                {v.icon}
                            </div>
                            <h3>{v.title}</h3>
                            <p>{v.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ENGINEERING PHILOSOPHY */}
            <section className="about_philosophy_section">
                <div className="philosophy_content">
                    <span className="section_tag">ENGINEERING PHILOSOPHY</span>
                    <h2>Why Interactive Learning Outperforms Video Tutorials</h2>
                    <p>
                        Passive video consumption often creates the illusion of competence. At CodeDev, we structure every single concept around the active loop of reading, implementing, breaking, and debugging.
                    </p>
                    
                    <div className="philosophy_features">
                        <div className="phil_item">
                            <div className="phil_num">01</div>
                            <div>
                                <h4>Instant Cognitive Feedback</h4>
                                <p>Execute code against automated test assertions within milliseconds to lock in comprehension immediately.</p>
                            </div>
                        </div>
                        <div className="phil_item">
                            <div className="phil_num">02</div>
                            <div>
                                <h4>Production-Grade Architecture</h4>
                                <p>Learn patterns used by high-scale companies: microservices, state machines, clean APIs, and relational schemas.</p>
                            </div>
                        </div>
                        <div className="phil_item">
                            <div className="phil_num">03</div>
                            <div>
                                <h4>Continuous Gamified Motivation</h4>
                                <p>XP rewards, streak counters, and skill badges designed to turn consistent daily practice into an effortless habit.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* JOURNEY & MILESTONES */}
            <section className="about_timeline_section">
                <div className="section_header">
                    <span className="section_tag">OUR JOURNEY</span>
                    <h2>How CodeDev Has Evolved</h2>
                    <p>From an experimental interactive runner to a comprehensive developer career platform.</p>
                </div>

                <div className="timeline_grid">
                    {milestones.map((m, idx) => (
                        <div key={idx} className="timeline_card">
                            <div className="timeline_meta">
                                <span className="timeline_phase">{m.phase}</span>
                                <span className="timeline_tag">{m.tag}</span>
                            </div>
                            <h3>{m.title}</h3>
                            <p>{m.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CALL TO ACTION */}
            <section className="about_cta_section">
                <div className="about_cta_card">
                    <div className="about_cta_content">
                        <h2>Ready to Accelerate Your Developer Journey?</h2>
                        <p>Join thousands of learners mastering modern programming through interactive lessons, real projects, and career roadmaps.</p>
                        
                        <div className="about_cta_actions">
                            <button className="btn_primary_white" onClick={() => navigate({ path: '/course' })}>
                                <FaRocket /> Explore Courses
                            </button>
                            <button className="btn_outline_white" onClick={() => navigate({ path: '/roadmap' })}>
                                <TbRoute /> View Career Roadmaps <FaArrowRight />
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
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
                    <FaFire className="badge_icon" />
                    <span>Nền tảng Lập trình Tương tác Thế hệ Mới</span>
                </div>

                <h1 className="hero_title">
                    Học Lập Trình Thực Chiến & Xây Dựng <span className="text_gradient">Sự Nghiệp Lập Trình Viên</span>
                </h1>

                <p className="hero_description">
                    Cung cấp lộ trình học bài bản, khóa học tương tác thực hành trực tiếp trên trình duyệt, hệ thống chạy code thời gian thực và cộng đồng kết nối lập trình viên.
                </p>

                <div className="hero_actions">
                    <button className="btn_primary" onClick={() => navigate({ path: '/course' })}>
                        <FaRocket /> Khám Phá Khóa Học <FaArrowRight />
                    </button>
                    <button className="btn_secondary" onClick={() => navigate({ path: '/roadmap' })}>
                        <TbRoute /> Lộ Trình Sự Nghiệp
                    </button>
                    <button className="btn_tertiary" onClick={() => navigate({ path: '/auth' })}>
                        <FaLaptopCode /> Đăng Ký Miễn Phí
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
                                <span className="pulse_dot"></span> Trình chạy Trực tiếp
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
                                <span>Output: Tiến trình hoàn tất 0 lỗi</span>
                            </div>
                            <span className="ide_lang">{activeTab.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* STATS STRIP */}
            <section className="stats_section">
                <div className="stat_item">
                    <h3>15.000+</h3>
                    <p>Học viên Hoạt động</p>
                </div>
                <div className="stat_divider"></div>
                <div className="stat_item">
                    <h3>50+</h3>
                    <p>Khóa học Tương tác</p>
                </div>
                <div className="stat_divider"></div>
                <div className="stat_item">
                    <h3>120+</h3>
                    <p>Bài học Thực hành</p>
                </div>
                <div className="stat_divider"></div>
                <div className="stat_item">
                    <h3>99.4%</h3>
                    <p>Đánh giá Hài lòng</p>
                </div>
            </section>

            {/* FEATURES GRID */}
            <section className="features_section">
                <div className="section_header">
                    <span className="section_tag">TẠI SAO CHỌN CODEDEV</span>
                    <h2>Tất Cả Công Cụ Giúp Bạn Thành Công</h2>
                    <p>Hệ sinh thái học tập tối ưu cho lập trình viên từ cơ bản đến nâng cao.</p>
                </div>

                <div className="features_grid">
                    <div className="feature_card">
                        <div className="feature_icon_box icon_blue">
                            <TbSourceCode />
                        </div>
                        <h3>Chạy Code Trực Tiếp</h3>
                        <p>Viết, thực thi và kiểm tra code ngay trên trình duyệt với phản hồi tự động tức thì mà không cần cài đặt môi trường phức tạp.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_teal">
                            <TbRoute />
                        </div>
                        <h3>Lộ Trình Bài Bản</h3>
                        <p>Theo đuổi các đường hướng rõ ràng dành riêng cho Frontend, Backend, Fullstack và Cloud Engineering.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_purple">
                            <TbUsersGroup />
                        </div>
                        <h3>Cộng Đồng Kết Nối</h3>
                        <p>Giao lưu cùng các lập trình viên khác, lập đội nhóm làm dự án, chia sẻ kinh nghiệm và tham gia thử thách code.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_amber">
                            <FaTrophy />
                        </div>
                        <h3>Thành Tích & Huy Hiệu</h3>
                        <p>Tích lũy điểm XP, mở khóa thành tựu, duy trì chuỗi ngày học tập và thăng hạng trên bảng xếp hạng toàn cầu.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_emerald">
                            <FaLaptopCode />
                        </div>
                        <h3>Dự Án Thực Tế</h3>
                        <p>Xây dựng các ứng dụng Web, API RESTful và cơ sở dữ liệu hoàn chỉnh sẵn sàng đưa vào Portfolio công việc.</p>
                    </div>

                    <div className="feature_card">
                        <div className="feature_icon_box icon_rose">
                            <TbCertificate />
                        </div>
                        <h3>Chứng Nhận Hoàn Thành</h3>
                        <p>Khẳng định năng lực với chứng chỉ và huy hiệu hoàn thành khóa học có thể xác thực với nhà tuyển dụng.</p>
                    </div>
                </div>
            </section>

            {/* ROADMAP PREVIEW */}
            <section className="roadmaps_preview_section">
                <div className="section_header">
                    <span className="section_tag">LỘ TRÌNH NỔI BẬT</span>
                    <h2>Định Hướng Sự Nghiệp Rõ Ràng</h2>
                    <p>Lựa chọn lộ trình phù hợp để làm chủ các kỹ năng doanh nghiệp đang tìm kiếm.</p>
                </div>

                <div className="roadmap_cards_grid">
                    <div className="roadmap_card" onClick={() => navigate({ path: '/roadmap' })}>
                        <div className="roadmap_card_header">
                            <span className="badge_pill pill_blue">Frontend</span>
                            <FaStar className="star_icon" />
                        </div>
                        <h3>Frontend Web Engineer</h3>
                        <p>Làm chủ giao diện web hiện đại với HTML5, CSS3, JavaScript ES6+, React, Next.js và tối ưu hiệu năng Web.</p>
                        <div className="roadmap_card_footer">
                            <span>12 Chương • 45 Bài học</span>
                            <span className="link_text">Xem Lộ Trình <FaArrowRight /></span>
                        </div>
                    </div>

                    <div className="roadmap_card" onClick={() => navigate({ path: '/roadmap' })}>
                        <div className="roadmap_card_header">
                            <span className="badge_pill pill_teal">Backend</span>
                            <FaStar className="star_icon" />
                        </div>
                        <h3>Backend Systems & APIs</h3>
                        <p>Xây dựng máy chủ hiệu năng cao, kiến trúc cơ sở dữ liệu, REST & GraphQL APIs với Node.js, Express và PostgreSQL.</p>
                        <div className="roadmap_card_footer">
                            <span>14 Chương • 52 Bài học</span>
                            <span className="link_text">Xem Lộ Trình <FaArrowRight /></span>
                        </div>
                    </div>

                    <div className="roadmap_card" onClick={() => navigate({ path: '/roadmap' })}>
                        <div className="roadmap_card_header">
                            <span className="badge_pill pill_purple">Fullstack</span>
                            <FaStar className="star_icon" />
                        </div>
                        <h3>Fullstack Web Specialist</h3>
                        <p>Kết hợp sức mạnh giao diện và xử lý hệ thống. Triển khai ứng dụng hoàn chỉnh từ A-Z lên môi trường Cloud.</p>
                        <div className="roadmap_card_footer">
                            <span>18 Chương • 70 Bài học</span>
                            <span className="link_text">Xem Lộ Trình <FaArrowRight /></span>
                        </div>
                    </div>
                </div>
            </section>

            {/* CALL TO ACTION */}
            <section className="cta_section">
                <div className="cta_card">
                    <div className="cta_content">
                        <h2>Sẵn Sàng Bắt Đầu Hành Trình Lập Trình?</h2>
                        <p>Tham gia CodeDev ngay hôm nay hoàn toàn miễn phí và nâng tầm kỹ năng của bạn.</p>
                        <div className="cta_buttons">
                            <button className="btn_primary_white" onClick={() => navigate({ path: '/auth' })}>
                                <FaRocket /> Tạo Tài Khoản Miễn Phí
                            </button>
                            <button className="btn_outline_white" onClick={() => navigate({ path: '/course' })}>
                                <FaGraduationCap /> Xem Danh Sách Khóa Học
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
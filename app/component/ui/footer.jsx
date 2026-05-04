'use client'
import { FaFacebookF, FaGithub } from "react-icons/fa";

import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer id="footer">
            <div className="footer-wrapper">
                <div className="footer-grid">
                    {/* Brand */}
                    <div className="footer-column">
                        <Link href="/home" className="footer-brand">
                            <Image
                                src="/image/static/logo.svg"
                                alt="CodeDev"
                                width={32}
                                height={24}
                            />
                            <span>CodeDev</span>
                        </Link>
                        <p className="footer-text">Learn, create, and grow with CodeDev.</p>
                    </div>

                    {/* Quick Links */}
                    <div className="footer-column">
                        <h4 className="footer-title">Navigation</h4>
                        <nav className="footer-nav">
                            <Link href="/home">Home</Link>
                            <Link href="/course">Courses</Link>
                            <Link href="/project">Projects</Link>
                            <Link href="/event">Events</Link>
                        </nav>
                    </div>

                    {/* Resources */}
                    <div className="footer-column">
                        <h4 className="footer-title">Resources</h4>
                        <nav className="footer-nav">
                            <Link href="/home?search=true">Search</Link>
                            <Link href="/home?tab=learning">My Learning</Link>
                            <Link href="/help">Help</Link>
                            <Link href="/contact">Contact</Link>
                        </nav>
                    </div>

                    {/* Social */}
                    <div className="footer-column">
                        <h4 className="footer-title">Follow Us</h4>
                        <div className="footer-socials">
                            <Link href="https://www.facebook.com/cuongnguyen0712?locale=vi_VN" target='_blank' aria-label="Facebook">
                                <FaFacebookF />
                            </Link>
                            <Link href="https://github.com/CuongNguyen-0712" target='_blank' aria-label="GitHub">
                                <FaGithub />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Bottom */}
                <div className="footer-bottom">
                    <p>&copy; {currentYear} CodeDev. All rights reserved.</p>
                    <div className="footer-links">
                        <a href="#privacy">Privacy</a>
                        <a href="#terms">Terms</a>
                        <a href="#cookies">Cookies</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}

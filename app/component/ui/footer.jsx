'use client'
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
                            <a href="#facebook" aria-label="Facebook">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                            </a>
                            <a href="#twitter" aria-label="Twitter">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M23.953 4.57a10 10 0 002.856-2.856c-.96.426-1.96.726-3.001.924a4.93 4.93 0 001.646-2.72 9.86 9.86 0 01-3.127 1.195 4.916 4.916 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417a9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                                </svg>
                            </a>
                            <a href="#github" aria-label="GitHub">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                            </a>
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

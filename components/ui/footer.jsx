import Link from 'next/link';

import { FaFacebookF, FaGithub } from "react-icons/fa";

import { Button } from '@/components/shadcn/button';

const LINKS = [
    { href: '/course', label: 'Courses' },
    { href: '/roadmap', label: 'Roadmap' },
    { href: '/blog', label: 'Blog' },
    { href: '/about', label: 'About' },
    { href: '/help', label: 'Help' },
];

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="mt-auto w-full border-t">
            <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p>&copy; {currentYear} CodeDev</p>

                <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
                    {LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="inline-flex min-h-6 items-center rounded-sm hover:text-foreground"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
                        <a href="https://github.com/CuongNguyen-0712" target="_blank" rel="noopener noreferrer" aria-label="CodeDev on GitHub">
                            <FaGithub />
                        </a>
                    </Button>
                    <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
                        <a href="https://www.facebook.com/cuongnguyen0712?locale=vi_VN" target="_blank" rel="noopener noreferrer" aria-label="CodeDev on Facebook">
                            <FaFacebookF />
                        </a>
                    </Button>
                </div>
            </div>
        </footer>
    );
}

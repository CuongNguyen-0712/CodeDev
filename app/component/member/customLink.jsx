import Link from "next/link";

export default function CustomLink({ href, children }) {
    const isDisabled = !href || href.trim() === '';

    return (
        <Link href={href || "#"} target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
                if (isDisabled) {
                    e.preventDefault()
                }
            }}
            style={{
                cursor: isDisabled ? 'not-allowed' : 'pointer',
            }}
            >
            {children}
        </Link>
    )
}
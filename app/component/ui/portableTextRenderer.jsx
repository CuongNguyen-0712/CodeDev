"use client";

import { useState, useEffect, useRef } from "react";
import { PortableText } from "@portabletext/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import { MdOutlineContentCopy } from "react-icons/md";
import { FaCheck } from "react-icons/fa6";

export default function PortableTextRenderer({ value }) {
    const CodeBlock = ({ value }) => {
        const { language, filename, code } = value;

        const ref = useRef(null);
        const [copied, setCopied] = useState(false);

        const handleCopy = () => {
            if (copied) return;
            navigator.clipboard.writeText(code);
            setCopied(true);
        };

        useEffect(() => {
            if (!copied) return;
            const timer = setTimeout(() => setCopied(false), 1000);
            return () => clearTimeout(timer);
        }, [copied]);

        return (
            <div className="code_block">
                <div className="code_block_header">
                    {filename && <span className="code_filename">{filename}</span>}

                    {code && (
                        <button
                            className="copy_code_button"
                            onClick={handleCopy}
                            ref={ref}
                        >
                            {
                                ref.current && copied ?
                                    <FaCheck fontSize={18} />
                                    :
                                    <MdOutlineContentCopy fontSize={18} />
                            }
                        </button>
                    )}
                </div>

                <SyntaxHighlighter language={language}>
                    {code}
                </SyntaxHighlighter>
            </div>
        );
    };

    return (
        <PortableText
            value={value}
            components={{
                types: {
                    codeBlock: ({ value }) => <CodeBlock value={value} />,
                },
            }}
        />
    );
}

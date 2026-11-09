"use client";

import React from "react";
import { PortableText } from "@portabletext/react";
import createImageUrlBuilder from "@sanity/image-url";
import CodeBlock from "@/components/ui/codeBlock";
import { ImageLightbox } from "@/components/ui/imageLightbox";
import { isAllowedMediaUrl } from "@/lib/media/mediaOrigins.mjs";

import {
    LuCircleAlert,
    LuCircleCheck,
    LuExternalLink,
    LuInfo,
    LuTriangleAlert,
    LuZap,
} from "react-icons/lu";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4sw0c7mz";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
// Inlined at build time by next.config.js (env.NEXT_PUBLIC_MEDIA_ORIGINS).
const MEDIA_ORIGINS = (process.env.NEXT_PUBLIC_MEDIA_ORIGINS || "https://res.cloudinary.com").split(",");
const imageBuilder = (projectId && dataset) ? createImageUrlBuilder({ projectId, dataset }) : null;

function urlForImage(source) {
    if (!imageBuilder || !source?.asset) return null;
    return imageBuilder.image(source).auto("format").fit("max").url();
}


function Callout({ value }) {
    const { type, content, title } = value || {};
    const normalizedType = String(type || "info").toLowerCase();

    const config = {
        info: {
            icon: <LuInfo />,
            title: title || "Note",
            className: "callout_info",
        },
        warning: {
            icon: <LuTriangleAlert />,
            title: title || "Important Warning",
            className: "callout_warning",
        },
        success: {
            icon: <LuCircleCheck />,
            title: title || "Best Practice / Key Takeaway",
            className: "callout_success",
        },
        error: {
            icon: <LuCircleAlert />,
            title: title || "Common Pitfall",
            className: "callout_error",
        },
        danger: {
            icon: <LuCircleAlert />,
            title: title || "Danger",
            className: "callout_error",
        },
        tip: {
            icon: <LuZap />,
            title: title || "Pro Tip",
            className: "callout_tip",
        },
    };

    const current = config[normalizedType] || config.info;

    return (
        <div className={`callout ${current.className}`}>
            <div className="callout_header">
                <span className="callout_icon">{current.icon}</span>
                {current.title && <span className="callout_title">{current.title}</span>}
            </div>
            <div className="callout_content">
                {typeof content === "string" ? (
                    content
                ) : Array.isArray(content) ? (
                    <PortableTextRenderer value={content} />
                ) : (
                    content
                )}
            </div>
        </div>
    );
}

function ImageBlock({ value }) {
    const { alt, caption } = value || {};
    const imageUrl = urlForImage(value) || value?.asset?.url || value?.url;

    if (!imageUrl) return null;

    return (
        <figure className="lesson_image_wrapper">
            <ImageLightbox src={imageUrl} alt={alt || "Lesson illustrative figure"} caption={caption} label="View larger image" className="lesson_image_button">
                <img
                    src={imageUrl}
                    alt={alt || "Lesson illustrative figure"}
                    loading="lazy"
                    className="lesson_image"
                />
            </ImageLightbox>
            {caption && <figcaption className="lesson_image_caption">{caption}</figcaption>}
        </figure>
    );
}

// Lesson diagram from an allowed media origin (Cloudinary, or local Payload outside production); width/height reserve space to avoid layout shift.
function MediaImage({ value }) {
    const { url, alt, caption, width, height } = value || {};
    if (!isAllowedMediaUrl(url, MEDIA_ORIGINS)) return null;

    return (
        <figure className="lesson_image_wrapper">
            <ImageLightbox src={url} alt={alt || ""} caption={caption} label={alt ? `View larger: ${alt}` : "View larger image"} className="lesson_image_button">
                <img
                    src={url}
                    alt={alt || ""}
                    width={width || undefined}
                    height={height || undefined}
                    loading="lazy"
                    decoding="async"
                    className="lesson_image h-auto"
                />
            </ImageLightbox>
            {caption && <figcaption className="lesson_image_caption">{caption}</figcaption>}
        </figure>
    );
}

function VideoEmbed({ value }) {
    const { url, title } = value || {};
    if (!url) return null;

    // Support YouTube embed conversion
    let embedUrl = url;
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    const isIframe = embedUrl.includes("youtube.com") || embedUrl.includes("vimeo.com");
    if (!isIframe && !isAllowedMediaUrl(url, MEDIA_ORIGINS)) return null;

    return (
        <div className="lesson_video_container">
            {isIframe ? (
                <iframe
                    src={embedUrl}
                    title={title || "Lesson Video"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="lesson_video_iframe"
                />
            ) : (
                <video controls className="lesson_video_player" src={url}>
                    Your browser does not support the video tag.
                </video>
            )}
        </div>
    );
}

// `types`: extra block renderers supplied by the page (e.g. `challengeEmbed` in a lesson).
// Unknown block types without a renderer are skipped.
export default function PortableTextRenderer({ value, types = null }) {
    if (!value || (Array.isArray(value) && value.length === 0)) {
        return null;
    }

    return (
        <PortableText
            value={value}
            onMissingComponent={false}
            components={{
                types: {
                    codeBlock: ({ value }) => <CodeBlock value={value} />,
                    callout: ({ value }) => <Callout value={value} />,
                    image: ({ value }) => <ImageBlock value={value} />,
                    cloudinaryImage: ({ value }) => <MediaImage value={value} />,
                    video: ({ value }) => <VideoEmbed value={value} />,
                    challengeEmbed: () => null,
                    ...types,
                },
                marks: {
                    strong: ({ children }) => <strong className="lesson_strong">{children}</strong>,
                    em: ({ children }) => <em className="lesson_em">{children}</em>,
                    code: ({ children }) => <code className="lesson_inline_code">{children}</code>,
                    underline: ({ children }) => <u className="lesson_underline">{children}</u>,
                    "strike-through": ({ children }) => <del className="lesson_strike">{children}</del>,
                    link: ({ value, children }) => {
                        const href = value?.href || "#";
                        const isExternal = href.startsWith("http://") || href.startsWith("https://");
                        return (
                            <a
                                href={href}
                                target={isExternal ? "_blank" : undefined}
                                rel={isExternal ? "noopener noreferrer" : undefined}
                                className="lesson_link"
                            >
                                {children}
                                {isExternal && <LuExternalLink className="lesson_external_icon" />}
                            </a>
                        );
                    },
                },
                block: {
                    h1: ({ children }) => <h1 className="lesson_h1">{children}</h1>,
                    h2: ({ children }) => <h2 className="lesson_h2">{children}</h2>,
                    h3: ({ children }) => <h3 className="lesson_h3">{children}</h3>,
                    h4: ({ children }) => <h4 className="lesson_h4">{children}</h4>,
                    normal: ({ children }) => <p className="lesson_p">{children}</p>,
                    blockquote: ({ children }) => <blockquote className="lesson_quote">{children}</blockquote>,
                },
                list: {
                    bullet: ({ children }) => <ul className="lesson_ul">{children}</ul>,
                    number: ({ children }) => <ol className="lesson_ol">{children}</ol>,
                },
                listItem: {
                    bullet: ({ children }) => <li className="lesson_li_bullet">{children}</li>,
                    number: ({ children }) => <li className="lesson_li_number">{children}</li>,
                },
            }}
        />
    );
}

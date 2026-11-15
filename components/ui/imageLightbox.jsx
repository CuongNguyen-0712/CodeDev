'use client';

import { useState } from "react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";

import { LuChevronLeft, LuChevronRight, LuExternalLink, LuX } from "react-icons/lu";

/**
 * Provider avatars come as small thumbnails; ask for a 512px one so the large view is not a
 * blown-up 96px image. Other URLs (Cloudinary avatars are stored at 512px) are left as they are.
 */
export function largeImageUrl(src) {
    try {
        const url = new URL(src);
        if (url.hostname.endsWith("googleusercontent.com")) {
            return src.replace(/=s\d+(-c)?$/, "=s512-c");
        }
        if (url.hostname === "avatars.githubusercontent.com") {
            url.searchParams.set("s", "512");
            return url.toString();
        }
    } catch {
        // not an absolute URL: use it as it is
    }
    return src;
}

const closeButton = (className) => (
    <DialogClose asChild>
        <Button type="button" variant="secondary" size="icon" className={cn("rounded-full shadow-md", className)}>
            <LuX aria-hidden="true" />
            <span className="sr-only">Close</span>
        </Button>
    </DialogClose>
);

const navButton = (name, Icon, onClick, position) => (
    <Button type="button" variant="secondary" size="icon" aria-label={name} onClick={onClick} className={cn("absolute top-1/2 z-10 -translate-y-1/2 rounded-full shadow-md", position)}>
        <Icon aria-hidden="true" />
    </Button>
);

/**
 * Wraps an image (the children) in a button that opens it larger.
 * `variant="avatar"`: a round photo at a fixed size over the page.
 * Default: a full-screen viewer, the image fitted to the screen (scaled up when smaller), caption below.
 * `label` names the button and the dialog; `caption` is shown under the image.
 * Optional gallery (image variant): `images` ([{ src, alt, original? }]) opens at `index`, with previous / next
 * buttons and the arrow keys when there is more than one; `original` adds an "Open original" link.
 * Without `images`, `src` / `alt` is a single image, as before.
 */
export function ImageLightbox({ src, alt = "", images, index = 0, label = "View larger image", caption, variant = "image", className, children }) {
    const [open, setOpen] = useState(false);
    const [zoomed, setZoomed] = useState(false);
    const [current, setCurrent] = useState(index);
    const [failed, setFailed] = useState(() => new Set());
    const list = images?.length ? images : src ? [{ src, alt }] : [];
    if (!list.length) return children;
    const avatar = variant === "avatar";
    const at = Math.min(Math.max(current, 0), list.length - 1);
    const shown = list[at];
    const many = list.length > 1;
    const go = (step) => { setCurrent((at + step + list.length) % list.length); setZoomed(false); };

    return (
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); setZoomed(false); if (next) setCurrent(index); }}>
            <DialogTrigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    className={cn(
                        "cursor-zoom-in outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        className
                    )}
                >
                    {children}
                </button>
            </DialogTrigger>
            {avatar ? (
                <DialogContent
                    showCloseButton={false}
                    className="w-auto max-w-[calc(100%-2rem)] justify-items-center gap-3 border-0 bg-transparent p-0 shadow-none"
                >
                    <DialogTitle className="sr-only">{label}</DialogTitle>
                    <DialogDescription className="sr-only">{alt || caption || label}</DialogDescription>
                    <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={largeImageUrl(src)}
                            alt={alt}
                            className="size-[min(80vw,22rem)] rounded-full border-4 border-background bg-background object-cover shadow-xl"
                        />
                        {closeButton("absolute top-0 right-0")}
                    </div>
                    {caption && (
                        <p className="max-w-full rounded-full bg-background px-3 py-1 text-center text-sm font-medium text-foreground shadow-md">
                            {caption}
                        </p>
                    )}
                </DialogContent>
            ) : (
                <DialogContent
                    showCloseButton={false}
                    onKeyDown={(event) => {
                        if (!many) return;
                        if (event.key === "ArrowLeft") go(-1);
                        if (event.key === "ArrowRight") go(1);
                    }}
                    className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black/90 p-0 text-white shadow-none sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
                >
                    <div className="flex items-center justify-end gap-2 px-4 py-3">
                        <DialogTitle className="sr-only">{label}</DialogTitle>
                        {shown.original && (
                            <Button asChild variant="secondary" size="sm" className="mr-auto shadow-md">
                                <a href={shown.original} target="_blank" rel="noopener noreferrer"><LuExternalLink aria-hidden="true" />Open original</a>
                            </Button>
                        )}
                        {closeButton()}
                    </div>
                    {/* Clicking the dark space around the image closes it, like the overlay would. */}
                    <div
                        className={cn("relative min-h-0 flex-1 px-2 sm:px-6", zoomed ? "overflow-auto" : "flex items-center justify-center")}
                        onClick={(event) => event.target === event.currentTarget && setOpen(false)}
                    >
                        {many && navButton("Previous image", LuChevronLeft, () => go(-1), "left-2 sm:left-6")}
                        {many && navButton("Next image", LuChevronRight, () => go(1), "right-2 sm:right-6")}
                        {failed.has(shown.src) ? (
                            <p role="alert" className="text-sm text-white/80">This image could not be loaded</p>
                        ) : (
                        // Fitted to the screen; a tap shows it at full size to pan around (wide diagrams on phones).
                        <button
                            type="button"
                            onClick={() => setZoomed((value) => !value)}
                            aria-label={zoomed ? "Fit image to screen" : "Show image at full size"}
                            className={cn(
                                "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                zoomed ? "block cursor-zoom-out" : "size-full cursor-zoom-in"
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                key={shown.src}
                                src={shown.src}
                                alt={shown.alt ?? ""}
                                onError={() => setFailed((prev) => new Set(prev).add(shown.src))}
                                className={zoomed ? "max-w-none" : "size-full object-contain"}
                            />
                        </button>
                        )}
                    </div>
                    <div className="mx-auto max-w-prose space-y-1 px-4 pt-3 pb-5 text-center">
                        {caption
                            ? <DialogDescription className="text-sm text-white/80">{caption}</DialogDescription>
                            : <DialogDescription className="sr-only">{label}</DialogDescription>}
                        {many && <p className="text-xs text-white/60">{at + 1} / {list.length}</p>}
                        <p className="text-xs text-white/60">{zoomed ? "Drag to look around. Tap the image to fit it." : "Tap the image to see it at full size."}</p>
                    </div>
                </DialogContent>
            )}
        </Dialog>
    );
}

export default ImageLightbox;

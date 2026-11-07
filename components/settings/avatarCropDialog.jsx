'use client';

import { useState } from "react";
import Cropper from "react-easy-crop";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Slider } from "@/components/shadcn/slider";

import { LuCircleAlert, LuLoaderCircle, LuZoomIn, LuZoomOut } from "react-icons/lu";

// The server stores avatars at most 512x512 (services/media.service.js), so nothing larger is sent.
const OUTPUT_MAX = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read the image"));
        image.src = src;
    });
}

/** Draws the chosen square of `src` into a new file: JPEG for a JPEG, else PNG (keeps transparency). */
async function cropToFile(src, area, source) {
    const image = await loadImage(src);
    const size = Math.max(1, Math.min(OUTPUT_MAX, Math.round(area.width)));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d").drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);

    const type = source.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new Error("Could not crop the image");
    const name = `${source.name.replace(/\.[^.]+$/, "") || "avatar"}.${type === "image/png" ? "png" : "jpg"}`;
    return new File([blob], name, { type });
}

/**
 * Square crop + zoom for a picked avatar `file`, shown from `src` (its object URL, owned by the
 * caller). Calls onApply(croppedFile) or onCancel().
 */
export default function AvatarCropDialog({ file, src, open, onApply, onCancel }) {
    const [pending, setPending] = useState(false);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
            <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
                <DialogHeader>
                    <DialogTitle>Adjust photo</DialogTitle>
                    <DialogDescription>Drag to position the photo and use the slider to zoom.</DialogDescription>
                </DialogHeader>
                {/* Keyed per image so position and zoom start fresh for each pick. */}
                {src && <CropBody key={src} file={file} src={src} pending={pending} setPending={setPending} onApply={onApply} onCancel={onCancel} />}
            </DialogContent>
        </Dialog>
    );
}

function CropBody({ file, src, pending, setPending, onApply, onCancel }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(MIN_ZOOM);
    const [area, setArea] = useState(null);
    const [error, setError] = useState(null);

    const apply = async () => {
        if (!area || pending) return;
        setPending(true);
        setError(null);
        try {
            onApply(await cropToFile(src, area, file));
        } catch (err) {
            setError(err?.message || "Could not crop the image");
        } finally {
            setPending(false);
        }
    };

    return (
        <>
            <div className="relative h-72 w-full overflow-hidden rounded-md bg-muted">
                {src && (
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        minZoom={MIN_ZOOM}
                        maxZoom={MAX_ZOOM}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_, pixels) => setArea(pixels)}
                    />
                )}
            </div>
            <div className="flex items-center gap-3">
                <LuZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Slider
                    value={[zoom]}
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.05}
                    onValueChange={([value]) => setZoom(value)}
                    aria-label="Zoom"
                />
                <LuZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            {file?.type === "image/gif" && (
                <p className="text-xs text-muted-foreground">Animated GIFs are saved as a still image.</p>
            )}
            {error && (
                <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
                    <LuCircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                </p>
            )}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
                <Button type="button" onClick={apply} disabled={!area || pending}>
                    {pending && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                    Apply
                </Button>
            </DialogFooter>
        </>
    );
}

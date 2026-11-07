'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useApp } from "@/contexts/appContext";
import { userQueries } from "@/queries/user.query";
import { useDeleteAvatar, useRestoreAvatar } from "@/mutations/user.mutation";

import { ErrorReload } from "@/components/ui/error";
import { ImageLightbox } from "@/components/ui/imageLightbox";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Avatar, AvatarImage } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuLoaderCircle, LuRotateCcw, LuTrash2 } from "react-icons/lu";

const formatDate = (value) => new Date(value).toLocaleDateString();

function PhotoItem({ item, onRestore, onDelete, busy }) {
    const date = formatDate(item.createdAt);

    return (
        <li className="flex flex-col items-center gap-2">
            <ImageLightbox src={item.url} alt={`Profile photo from ${date}`} label={`View photo from ${date}`} caption={`Uploaded ${date}`} variant="avatar" className="rounded-full">
                <Avatar className="size-14 border">
                    <AvatarImage src={item.url} alt="" className="object-cover" />
                </Avatar>
            </ImageLightbox>
            {item.current ? (
                <Badge variant="success">Current</Badge>
            ) : (
                <div className="flex gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRestore(item.id)}
                        disabled={busy}
                        aria-label={`Use photo from ${date}`}
                    >
                        {busy ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <LuRotateCcw aria-hidden="true" />}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDelete(item)}
                        disabled={busy}
                        aria-label={`Delete photo from ${date}`}
                    >
                        <LuTrash2 aria-hidden="true" />
                    </Button>
                </div>
            )}
        </li>
    );
}

/** The user's kept profile photos (newest 10): view larger, use again, or delete. */
export default function AvatarHistory() {
    const { status } = useSession();
    const { showAlert: alert } = useApp();

    const { data, isLoading, isError, error, refetch } = useQuery(userQueries.avatars(status));
    const restore = useRestoreAvatar();
    const remove = useDeleteAvatar();
    const [confirm, setConfirm] = useState(null);

    const photos = Array.isArray(data) ? data : [];
    const pendingId = (restore.isPending && restore.variables) || (remove.isPending && remove.variables) || null;

    const handleRestore = (assetId) => {
        restore.mutate(assetId, {
            onSuccess: () => alert(200, "Your profile photo has been updated."),
            onError: (err) => alert(err?.status || 500, err?.message || "Could not use that photo."),
        });
    };

    const handleDelete = () => {
        const target = confirm;
        remove.mutate(target.id, {
            onSuccess: () => {
                setConfirm(null);
                alert(200, "Photo deleted.");
            },
            onError: (err) => {
                setConfirm(null);
                alert(err?.status || 500, err?.message || "Could not delete that photo.");
            },
        });
    };

    return (
        <div className="border-t p-4">
            <p className="text-sm font-medium text-foreground">Previous photos</p>
            <p className="text-xs text-muted-foreground">Your last 10 photos are kept. Use one again or delete it.</p>

            {isLoading ? (
                <div className="mt-3 flex gap-3" role="status" aria-busy="true" aria-label="Loading previous photos">
                    {[0, 1, 2].map((index) => <Skeleton key={index} className="size-14 rounded-full" />)}
                </div>
            ) : isError ? (
                <div className="mt-3">
                    <ErrorReload data={error} refetch={refetch} title="Could not load your previous photos" />
                </div>
            ) : photos.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Photos you upload will show here.</p>
            ) : (
                <ul className="mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-3">
                    {photos.map((item) => (
                        <PhotoItem
                            key={item.id}
                            item={item}
                            onRestore={handleRestore}
                            onDelete={setConfirm}
                            busy={pendingId === item.id}
                        />
                    ))}
                </ul>
            )}

            <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && !remove.isPending && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The photo is removed from your previous photos and cannot be restored.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={(event) => {
                                event.preventDefault();
                                handleDelete();
                            }}
                            disabled={remove.isPending}
                        >
                            {remove.isPending && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                            Delete photo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

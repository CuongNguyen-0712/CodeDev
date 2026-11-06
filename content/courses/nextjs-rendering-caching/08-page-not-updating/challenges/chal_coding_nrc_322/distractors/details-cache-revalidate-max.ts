// @piece details-cache: Refresh the cached course after saving details
revalidateTag(`course:${id}`, "max");

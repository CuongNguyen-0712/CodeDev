import fs from "node:fs";
import path from "node:path";

/** Course folders -> catalog cover updates from course.local.json; folders without it are listed in `missing` (by folder name). */
export function localCoverUpdates(courseDirs) {
    const updates = [];
    const missing = [];
    for (const dir of courseDirs) {
        const localFile = path.join(dir, "course.local.json");
        if (!fs.existsSync(localFile)) {
            missing.push(path.basename(dir));
            continue;
        }
        const { publicId } = JSON.parse(fs.readFileSync(path.join(dir, "course.json"), "utf8"));
        updates.push({ publicId, image: JSON.parse(fs.readFileSync(localFile, "utf8")).image });
    }
    return { updates, missing };
}

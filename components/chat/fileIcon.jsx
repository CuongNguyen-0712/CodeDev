import { extensionOf } from "@/lib/chat/fileInfo";

import { LuFileArchive, LuFileCode, LuFileText } from "react-icons/lu";

const CODE = new Set(["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "go", "rs", "sql", "json"]);

/** Icon for a file name by its extension: zip, code, or plain text for everything else. */
export default function FileIcon({ name, className }) {
    const ext = extensionOf(name);
    const Icon = ext === "zip" ? LuFileArchive : CODE.has(ext) ? LuFileCode : LuFileText;
    return <Icon aria-hidden="true" className={className} />;
}

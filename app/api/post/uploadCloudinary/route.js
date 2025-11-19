import cloudinary from "@/app/lib/cloudinary";

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !file.type.startsWith("image/")) {
            return new Response(JSON.stringify({ error: "Invalid file type" }), { status: 400 });
        }

        if (file.size > 5 * 1024 * 1024) {
            return new Response(JSON.stringify({ error: "File too large" }), { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUri = `data:${file.type};base64,${base64}`;

        const uploadResult = await cloudinary.uploader.upload(dataUri, { folder: "codedev" });

        return new Response(JSON.stringify({ url: uploadResult.secure_url }), { status: 200 });

    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

export function siteOrigin() {
    try {
        return new URL(process.env.NEXTAUTH_URL || "http://localhost:3000").origin;
    } catch {
        return "http://localhost:3000";
    }
}

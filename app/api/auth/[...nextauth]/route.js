import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { createSession } from "@/app/lib/session";
import { sql } from "@/app/lib/db";
import { v4 as uuidv4 } from "uuid";

export const authOptions = {
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            authorization: {
                params: {
                    scope: "read:user user:email",
                },
            },
        })
    ],

    callbacks: {
        async signIn({ user, account, profile }) {
            // user = [id, name, email, image]
            // account = [provider, providerAccountId, type]
            // profile = [login, id, node_id, avatar_url, gravatar_id, url, html_url, followers_url, following_url, gists_url, starred_url, subscriptions_url, organizations_url, repos_url, events_url, received_events_url, type, site_admin]
            try {
                if (!account || !account.provider) {
                    console.error("Missing account info");
                    return false;
                }

                const email = user.email || (profile.emails && profile.emails[0] && profile.emails[0].value);
                if (!email) {
                    console.error("Email not found in user or profile");
                    return false;
                }

                const resImg = await fetch(user.image);

                if (!resImg.ok) {
                    console.error("Failed to fetch avatar");
                    return false;
                }

                const arrayBuffer = await resImg.arrayBuffer();
                const contentType = resImg.headers.get("content-type") || "image/jpeg";

                const base64 = Buffer.from(arrayBuffer).toString("base64");
                const image = `data:${contentType};base64,${base64}`;

                const _id = uuidv4();

                const query = `
                    SELECT auth_with_provider($1, $2, $3, $4, $5, $6) AS id;
                `;

                const params = [
                    _id,
                    user.name,
                    email,
                    image,
                    account.provider,
                    account.providerAccountId,
                ];

                const res = await sql.query(query, params);

                if (!res || res.length === 0) {
                    console.error("Failed to create or retrieve user session");
                    return false;
                }

                const userId = res[0].id;

                const sessionData = {
                    userId,
                    username: user.name || profile.login,
                    email: email
                };

                await createSession(sessionData);

                return true;

            } catch (error) {
                console.error("Error during sign in:", error);
                return false;
            }
        },
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
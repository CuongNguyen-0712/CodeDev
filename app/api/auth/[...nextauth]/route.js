import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";

import { ApiError } from "@/app/lib/error/apiError";

import { sql } from "@/app/lib/db";

import bcrypt from "bcryptjs";
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
        }),

        CredentialsProvider({
            name: "credentials",
            credentials: {
                username: {},
                password: {},
            },
            async authorize(credentials) {
                const { username, password } = credentials;

                if (!username || !password) {
                    return null;
                }

                try {
                    const data = await sql.query(
                        `SELECT * FROM log_in($1)`,
                        [username]
                    );

                    if (!data || data.length === 0) {
                        return null;
                    }

                    const user = data[0];

                    const isValid = await bcrypt.compare(password, user.password);

                    if (!isValid) {
                        return null;
                    }

                    return {
                        id: user.id,
                        name: user.username,
                        email: user.email,
                    };

                } catch (err) {
                    console.error(err);
                    throw new Error("Internal server error");
                }
            }
        }),
    ],

    callbacks: {
        async jwt({ token, user, account, profile }) {
            if (account && user) {
                try {
                    const email =
                        user.email ||
                        profile?.emails?.[0]?.value;

                    if (!email) {
                        throw new ApiError("Email is required", 400);
                    }

                    const image = user.image || null;

                    if (account.provider === "github") {

                        const res = await sql.query(
                            `SELECT auth_with_provider($1, $2, $3, $4, $5, $6) AS id`,
                            [
                                uuidv4(),
                                user.name,
                                email,
                                image,
                                account.provider,
                                account.providerAccountId,
                            ]
                        );

                        if (!res || res.length === 0) {
                            throw new ApiError("Authentication failed", 401);
                        }

                        token.id = res[0].id;
                    }

                    if (account.provider === "credentials") {
                        token.id = user.id;
                    }

                    token.username = user.name;
                    token.email = email;
                    token.provider = account.provider;

                } catch (err) {
                    console.error("JWT error:", err);
                    throw new ApiError("Internal Server Error", 500);
                }
            }

            return token;
        },

        async session({ session, token }) {
            session.user.id = token.id;
            session.user.username = token.username;
            session.user.email = token.email;
            session.user.provider = token.provider;

            return session;
        },

        async redirect({ url, baseUrl }) {
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            if (new URL(url).origin === baseUrl) return url;
            return baseUrl;
        },
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
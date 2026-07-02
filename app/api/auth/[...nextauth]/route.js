import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

import { ApiError } from "@/app/lib/error/apiError";
import { generateSonyflake } from "@/app/lib/sonyflake";
import { sql } from "@/app/lib/db";

import { ulid } from "ulid";

import bcrypt from "bcryptjs";

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

        GoogleProvider({
            clientId: process.env.GOOGLE_ID,
            clientSecret: process.env.GOOGLE_SECRET,
            authorization: {
                params: {
                    scope: "openid email profile",
                },
            }
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
                        username: user.username,
                        provider: 'credentials',
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
                    if (account.provider === "credentials") {
                        token.id = user.id;
                        token.username = user.username;
                        token.provider = user.provider;

                        return token;
                    }

                    const email =
                        user.email ||
                        profile?.email ||
                        profile?.emails?.[0]?.value;

                    if (!email) {
                        throw new ApiError("Email is required", 400);
                    }

                    const image = user.image || null;

                    const public_id = ulid();
                    const id = generateSonyflake();

                    const response = await sql.query(
                        `SELECT * FROM auth_with_provider($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            id,
                            public_id,
                            user.username || user.name,
                            email,
                            image,
                            account.provider,
                            account.providerAccountId,
                        ]
                    );

                    if (!response || response.length === 0) {
                        throw new ApiError("Authentication failed", 401);
                    }

                    const result = response[0];

                    token.id = result.id;
                    token.username = result.username;
                    token.provider = result.provider;

                } catch (err) {
                    console.error("JWT error:", err);
                    throw new Error("Internal Server Error");
                }
            }

            return token;
        },
        async session({ session, token }) {
            return {
                user: {
                    id: token.id,
                    username: token.username,
                    provider: token.provider
                }
            };
        },

        async redirect({ url, baseUrl }) {
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            if (new URL(url).origin === baseUrl) return url;
            return baseUrl;
        },
    },
    pages: {
        signIn: "/auth",
        error: "/auth/error",
    }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 
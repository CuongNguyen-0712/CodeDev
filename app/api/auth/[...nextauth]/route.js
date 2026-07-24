import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

import { ApiError } from "@/app/lib/error/apiError";

import { authService } from "@/app/services/auth.service";

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
                    throw new ApiError("Missing credentials, try again", 400);
                }

                try {
                    const response = await authService.login({ username, password });

                    if (!response) {
                        throw new ApiError("Authentication failed, try again", 500);
                    }

                    return response;
                } catch (err) {
                    throw new ApiError(err.message || "Authentication failed, try again", err.status || 500);
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
                        token.image = user.image;
                        token.email = user.email;
                        token.role = user.role;
                        token.permissions = user.permissions;

                        return token;
                    }

                    const email =
                        user.email ||
                        profile?.email ||
                        profile?.emails?.[0]?.value;

                    if (!email) {
                        throw new ApiError("Missing credentials, try again", 400);
                    }

                    const image = user.image || null;
                    const username = user.username || user.name;
                    const accountProvider = account.provider;
                    const providerAccountId = account.providerAccountId;

                    const response = await authService.signUpWithProvider({ username, email, image, accountProvider, providerAccountId });

                    token.id = response.id;
                    token.username = response.username;
                    token.provider = response.provider;
                    token.email = response.email;
                    token.image = response.image;
                    token.role = response.role;
                    token.permissions = response.permissions;
                } catch (err) {
                    throw new ApiError("Authentication failed, try again", 500);
                }
            }
            return token;
        },
        async session({ token }) {
            return {
                user: {
                    id: token.id,
                    username: token.username,
                    image: token.image,
                    email: token.email,
                    provider: token.provider,
                    role: token.role,
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
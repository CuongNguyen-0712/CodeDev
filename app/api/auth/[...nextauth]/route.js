import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

import { ApiError } from "@/app/lib/error/apiError";

import { authService } from "@/app/services/auth.service";

import { TOKEN } from "@/app/constants/auth";

const ACCESS_TOKEN_LIFETIME = 15 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_BUFFER = 30 * 1000;

export const authOptions = {
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },

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
                        token.sessionId = user.sessionId;
                        token.tokenId = user.tokenId;
                        token.refreshToken = user.refreshToken;
                        token.expiresAt = Date.now() + ACCESS_TOKEN_LIFETIME; // 15 minutes
                        token.error = undefined;

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
                    token.sessionId = response.sessionId;
                    token.refreshToken = response.refreshToken;
                    token.tokenId = response.tokenId;
                    token.expiresAt = Date.now() + ACCESS_TOKEN_LIFETIME; // 15 minutes
                    token.error = undefined;

                    return token;
                } catch (err) {
                    throw new ApiError("Authentication failed, try again", 500);
                }
            }

            if (!token.sessionId || !token.refreshToken || !token.tokenId) {
                return {
                    ...token,
                    error: "SessionInvalid",
                };
            }

            const expiresAt = Number(token.expiresAt) || 0;

            if (expiresAt > 0 && Date.now() < (expiresAt - ACCESS_TOKEN_REFRESH_BUFFER)) {
                return token;
            }

            try {
                const response = await authService.refreshSession({
                    userId: token.id,
                    sessionId: token.sessionId,
                    tokenId: token.tokenId,
                    refreshToken: token.refreshToken
                });


                if (!response) {
                    return token;
                }

                switch (response.status) {
                    case TOKEN.REFRESH:
                        return {
                            ...token,
                            sessionId: response.sessionId,
                            tokenId: response.tokenId,
                            refreshToken: response.refreshToken,
                            expiresAt: Date.now() + ACCESS_TOKEN_LIFETIME,
                            error: undefined,
                        };

                    case TOKEN.INVALID:
                        return {
                            ...token,
                            error: "SessionInvalid",
                        };

                    case TOKEN.EXPIRED:
                        return {
                            ...token,
                            error: "SessionExpired",
                        };

                    case TOKEN.REVOKED:
                        return {
                            ...token,
                            error: "SessionRevoked",
                        };

                    case TOKEN.CONCURRENT:
                        return {
                            ...token,
                            sessionId: response.sessionId || token.sessionId,
                            tokenId: response.tokenId || token.tokenId,
                            refreshToken: response.refreshToken || token.refreshToken,
                            expiresAt: Date.now() + ACCESS_TOKEN_LIFETIME,
                            error: undefined,
                        };

                    case TOKEN.FAILED:
                    default:
                        return {
                            ...token,
                            expiresAt: Date.now() + 30 * 1000,
                        };
                }
            } catch (err) {
                console.error("JWT refresh failed:", err);

                return {
                    ...token,
                    expiresAt: Date.now() + 30 * 1000,
                };
            }
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
                    permissions: token.permissions,
                    sessionId: token.sessionId,
                },
                error: token.error,
            };
        },
    },
    pages: {
        signIn: "/auth",
        error: "/auth/error",
    }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 
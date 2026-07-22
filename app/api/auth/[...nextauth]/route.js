import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

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
                    throw new Error('MissingCredentials');
                }

                try {
                    const data = await sql.query(
                        `SELECT * FROM log_in($1)`,
                        [username]
                    );

                    if (!data || data.length === 0) {
                        throw new Error('InvalidCredentials');
                    }

                    const user = data[0];

                    const isValid = await bcrypt.compare(password, user.password);

                    if (!isValid) {
                        throw new Error('InvalidCredentials');
                    }

                    return {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        image: user.image,
                        role: user.role,
                        provider: 'credentials',
                    };

                } catch (err) {
                    console.error(err);
                    if (err.message === "InvalidCredentials" || err.message === "MissingCredentials") {
                        throw err;
                    }
                    throw new Error('Authentication failed, try again');
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

                        const permissions = await sql.query(
                            `SELECT 
                                distinct (p.resource || '.' || p.action) as permissions
                            FROM private.permissions p
                            JOIN private.role_permissions rp ON rp.permission_id = p.id 
                            JOIN private.roles r ON rp.role_id = r.id
                            JOIN private.user_roles ur ON r.id = ur.role_id
                            JOIN private.users u ON u.id = ur.user_id
                            WHERE u.public_id = $1`,
                            [user.id]
                        );

                        token.permissions = permissions.map(p => p.permissions);

                        return token;
                    }

                    const email =
                        user.email ||
                        profile?.email ||
                        profile?.emails?.[0]?.value;

                    if (!email) {
                        throw new Error('MissingCredentials');
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
                        throw new Error('Authentication failed, try again');
                    }

                    const result = response[0];

                    token.id = result.id;
                    token.username = result.username;
                    token.provider = result.provider;
                    token.email = result.email;
                    token.image = result.image;
                    token.role = result.role;

                    const permissions = await sql.query(
                        `SELECT 
                            distinct (p.resource || '.' || p.action) as permissions
                        FROM private.permissions p
                        JOIN private.role_permissions rp ON rp.permission_id = p.id
                        JOIN private.roles r ON rp.role_id = r.id
                        JOIN private.user_roles ur ON r.id = ur.role_id
                        JOIN private.users u ON u.id = ur.user_id
                        WHERE u.public_id = $1`,
                        [result.public_id]
                    );

                    token.permissions = permissions.map(p => p.permissions);
                } catch (err) {
                    console.error(err);
                    if (err.message === "MissingCredentials") {
                        throw err;
                    }
                    throw new Error('Authentication failed, try again');
                }
            }
            return token;
        },
        async session({ token }) {
            return {
                user: {
                    id: token.id,
                    username: token.username,
                    provider: token.provider,
                    roles: token.role,
                    image: token.image,
                    email: token.email,
                    permissions: token.permissions,
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
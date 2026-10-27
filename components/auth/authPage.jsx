'use client'
import { useState } from "react"
import Link from "next/link"
import Logo from "@/components/ui/logo"

import Login from "./login"
import Signup from "./signup"

import { Button } from "@/components/shadcn/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs"

import {
    LuArrowLeft,
    LuLibrary,
    LuSquareTerminal,
    LuTrendingUp,
} from "react-icons/lu"

const ACCOUNT_FEATURES = [
    {
        icon: LuLibrary,
        title: "Enroll in courses",
        desc: "Join courses from the catalog and work through their lessons in order.",
    },
    {
        icon: LuSquareTerminal,
        title: "Submit challenges",
        desc: "Solve coding challenges in the browser and get them graded against hidden tests.",
    },
    {
        icon: LuTrendingUp,
        title: "Keep your progress",
        desc: "Your progress is saved to your account, so you can continue on any device.",
    },
]

const COPY = {
    login: {
        title: "Sign in to CodeDev",
        desc: "Welcome back. Sign in to continue your courses.",
    },
    signup: {
        title: "Create your account",
        desc: "It takes two short steps. You can also sign up with GitHub or Google.",
    },
}

export default function AuthPage() {
    const [activeForm, setActiveForm] = useState('login')
    const [signedUpUsername, setSignedUpUsername] = useState('')

    const isLogin = activeForm === 'login'
    const isSignup = activeForm === 'signup'
    const copy = COPY[activeForm] || COPY.login

    return (
        <main className="flex min-h-full w-full flex-1 flex-col lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
                    <Link
                        href="/"
                        className="rounded-md text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                        <Logo size={24} />
                    </Link>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/">
                            <LuArrowLeft />
                            Back to home
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:px-6 sm:pt-0">
                    <div className="flex w-full max-w-sm flex-col gap-6">
                        <header className="flex flex-col gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                                {copy.title}
                            </h1>
                            <p className="text-sm text-muted-foreground">{copy.desc}</p>
                        </header>

                        <Tabs value={activeForm} onValueChange={setActiveForm} className="gap-6">
                            <TabsList className="w-full" aria-label="Sign in or create an account">
                                <TabsTrigger value="login">Sign in</TabsTrigger>
                                <TabsTrigger value="signup">Create account</TabsTrigger>
                            </TabsList>

                            {/* Both forms stay mounted so typed values survive switching tabs. */}
                            <TabsContent value="login" forceMount className="data-[state=inactive]:hidden">
                                {/* Remounts after a sign-up so the new username is already filled in. */}
                                <Login
                                    key={signedUpUsername}
                                    active={isLogin}
                                    initialUsername={signedUpUsername}
                                    changeForm={() => setActiveForm('signup')}
                                />
                            </TabsContent>
                            <TabsContent value="signup" forceMount className="data-[state=inactive]:hidden">
                                <Signup
                                    active={isSignup}
                                    changeForm={() => setActiveForm('login')}
                                    onSignedUp={setSignedUpUsername}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>

            <aside
                aria-labelledby="auth-aside-title"
                className="hidden w-full max-w-md shrink-0 flex-col justify-center gap-8 border-l bg-muted/40 px-10 py-12 lg:flex xl:max-w-lg xl:px-14"
            >
                <div className="flex flex-col gap-2">
                    <h2 id="auth-aside-title" className="text-lg font-semibold tracking-tight text-foreground">
                        What an account gives you
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        You can browse courses without signing in. An account lets you enroll and keeps your work.
                    </p>
                </div>

                <ul className="flex list-none flex-col gap-5">
                    {ACCOUNT_FEATURES.map(({ icon: Icon, title, desc }) => (
                        <li key={title} className="flex items-start gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-foreground">
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <div className="flex flex-col gap-0.5">
                                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                            </div>
                        </li>
                    ))}
                </ul>

                <Button asChild variant="outline" className="self-start">
                    <Link href="/course">
                        <LuLibrary />
                        Browse courses first
                    </Link>
                </Button>
            </aside>
        </main>
    )
}

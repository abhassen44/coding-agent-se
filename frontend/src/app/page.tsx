import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Bot, FolderGit2, TerminalSquare, Upload, Wrench } from "lucide-react";

const featureCards = [
    {
        title: "Conversational Coding",
        description: "Ask implementation questions, refine prompts, and turn responses into working changes.",
        icon: <Bot className="h-5 w-5" />,
    },
    {
        title: "Repository Context",
        description: "Index codebases, search relevant chunks, and keep answers grounded in the actual repo.",
        icon: <FolderGit2 className="h-5 w-5" />,
    },
    {
        title: "Execution + Diagnosis",
        description: "Run code in isolated sandboxes and diagnose failures without leaving the product.",
        icon: <TerminalSquare className="h-5 w-5" />,
    },
    {
        title: "Workspace Agent",
        description: "Open a workspace, inspect files, run tools, and iterate on changes with the AI panel.",
        icon: <Wrench className="h-5 w-5" />,
    },
];

export default function HomePage() {
    return (
        <div className="relative overflow-hidden px-6 py-10 md:px-10 md:py-16">
            <div className="soft-grid pointer-events-none absolute inset-0 opacity-25" />

            <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
                <section className="panel p-8 md:p-12">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-primary)]/25 bg-[color:var(--accent-primary)]/10 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-[color:var(--accent-primary)]">
                        Intelligent Coding Agent
                    </div>

                    <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-[color:var(--text-primary)] md:text-6xl lg:text-7xl">
                        One surface for repo context, execution, and AI-assisted code changes.
                    </h1>

                    <p className="mt-6 max-w-2xl text-base leading-7 text-[color:var(--text-secondary)] md:text-lg">
                        Use chat for fast answers, repository search for grounded context, execution for proof, and workspace mode for
                        actual file changes. The product already has the right primitives. This pass makes them easier to reach and use.
                    </p>

                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                            href="/chat"
                            className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--accent-primary)] px-5 py-3 text-sm font-semibold text-[color:var(--bg-primary)] transition-colors hover:bg-[color:var(--accent-secondary)]"
                        >
                            Start in Chat
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/repository"
                            className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-elevated)] px-5 py-3 text-sm font-medium text-[color:var(--text-primary)] transition-colors hover:border-[color:var(--accent-primary)]/35 hover:text-[color:var(--accent-primary)]"
                        >
                            Browse Repositories
                        </Link>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        {featureCards.map((card) => (
                            <div key={card.title} className="rounded-3xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)]/80 p-5">
                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--accent-primary)]/20 bg-[color:var(--accent-primary)]/10 text-[color:var(--accent-primary)]">
                                    {card.icon}
                                </div>
                                <h2 className="mb-2 text-xl font-semibold text-[color:var(--text-primary)]">{card.title}</h2>
                                <p className="text-sm leading-6 text-[color:var(--text-secondary)]">{card.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <aside className="flex flex-col gap-5">
                    <div className="panel p-6">
                        <div className="mb-4 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Fast Paths</div>
                        <div className="space-y-3">
                            <ActionCard
                                href="/repository"
                                icon={<FolderGit2 className="h-4 w-4" />}
                                title="Import a codebase"
                                description="Upload files or pull from GitHub and build repository context."
                            />
                            <ActionCard
                                href="/execute"
                                icon={<TerminalSquare className="h-4 w-4" />}
                                title="Run code"
                                description="Test snippets, inspect output, and ask for AI diagnosis on failures."
                            />
                            <ActionCard
                                href="/upload"
                                icon={<Upload className="h-4 w-4" />}
                                title="Feed knowledge"
                                description="Attach documents, source files, or screenshots for richer answers."
                            />
                            <ActionCard
                                href="/workspace"
                                icon={<Wrench className="h-4 w-4" />}
                                title="Open a workspace"
                                description="Edit files, run terminal commands, and let the AI agent iterate."
                            />
                        </div>
                    </div>

                    <div className="panel p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Workflow</span>
                            <span className="rounded-full border border-[color:var(--accent-primary)]/25 bg-[color:var(--accent-primary)]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--accent-primary)]">
                                Suggested
                            </span>
                        </div>
                        <div className="space-y-4">
                            <Step number="01" title="Search the repo" text="Start with repository context before asking the model to edit anything." />
                            <Step number="02" title="Validate by running" text="Use the execution surface to prove behavior instead of trusting generated code." />
                            <Step number="03" title="Move into workspace" text="Only after context and proof should the agent touch real files." />
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ActionCard({
    href,
    icon,
    title,
    description,
}: {
    href: string;
    icon: ReactNode;
    title: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="group flex items-start gap-3 rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)]/80 p-4 transition-colors hover:border-[color:var(--accent-primary)]/35"
        >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--accent-primary)]/20 bg-[color:var(--accent-primary)]/10 text-[color:var(--accent-primary)]">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[color:var(--text-primary)] transition-colors group-hover:text-[color:var(--accent-primary)]">
                    {title}
                </div>
                <p className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 text-[color:var(--text-muted)] transition-colors group-hover:text-[color:var(--accent-primary)]" />
        </Link>
    );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
    return (
        <div className="flex gap-4 rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)]/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-primary)]">{number}</div>
            <div>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</div>
                <p className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">{text}</p>
            </div>
        </div>
    );
}

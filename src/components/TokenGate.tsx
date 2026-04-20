import { useState } from "react";
import { getToken, setToken } from "../lib/api";

// First-run password gate. On success the token is cached in localStorage
// and every /api call is signed with it. There is no server-side session —
// the token itself is the credential.

export function TokenGate({ children }: { children: React.ReactNode }) {
    const [token, setTokenState] = useState<string | null>(getToken());
    const [draft, setDraft] = useState("");
    const [err, setErr] = useState<string | null>(null);

    if (token) return <>{children}</>;

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    setErr(null);
                    // Validate by hitting a cheap tool.
                    try {
                        const res = await fetch(
                            `${import.meta.env.VITE_FUNCTIONS_URL}/api`,
                            {
                                method: "POST",
                                headers: {
                                    "content-type": "application/json",
                                    authorization: `Bearer ${draft}`,
                                },
                                body: JSON.stringify({ tool: "list_experiments" }),
                            },
                        );
                        if (!res.ok) {
                            const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                            throw new Error(error);
                        }
                        setToken(draft);
                        setTokenState(draft);
                    } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e));
                    }
                }}
                className="w-full max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-6"
            >
                <h1 className="text-xl font-semibold">Weightless</h1>
                <p className="text-sm text-slate-400">
                    Enter your access token to continue. Same token as the one Claude uses.
                </p>
                <input
                    type="password"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="WEIGHTLESS_TOKEN"
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                {err && <p className="text-sm text-rose-400">{err}</p>}
                <button
                    type="submit"
                    className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500"
                >
                    Unlock
                </button>
            </form>
        </div>
    );
}

// Browser-side fetch wrapper. All SPA data goes through the `api` Edge
// Function as `{tool, args}` bodies. The bearer token is stored in
// localStorage and applied to every request.

const TOKEN_KEY = "weightless.token";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export function getFunctionsUrl(): string {
    const url = import.meta.env.VITE_FUNCTIONS_URL as string | undefined;
    if (!url) throw new Error("VITE_FUNCTIONS_URL is not configured");
    return url.replace(/\/$/, "");
}

export async function call<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    const token = getToken();
    if (!token) throw new Error("not authenticated");
    const res = await fetch(`${getFunctionsUrl()}/api`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tool, args }),
    });
    const text = await res.text();
    let body: unknown;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { error: text };
    }
    if (!res.ok) {
        const msg = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return body as T;
}

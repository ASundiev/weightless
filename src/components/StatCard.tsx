export function StatCard({
    label,
    value,
    hint,
    tone = "default",
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: "default" | "positive" | "warning";
}) {
    const toneClass = tone === "positive"
        ? "text-emerald-400"
        : tone === "warning"
            ? "text-amber-400"
            : "text-slate-100";
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
            <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
            {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
        </div>
    );
}

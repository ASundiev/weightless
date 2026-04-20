import { useState } from "react";
import { call } from "../lib/api";

export function Log() {
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const [kg, setKg] = useState("");
    const [note, setNote] = useState("");
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [err, setErr] = useState<string | null>(null);

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                setStatus("saving");
                setErr(null);
                try {
                    await call("log_weight", {
                        date,
                        kg: Number(kg),
                        note: note || undefined,
                    });
                    setStatus("saved");
                    setKg("");
                    setNote("");
                } catch (e) {
                    setStatus("error");
                    setErr(e instanceof Error ? e.message : String(e));
                }
            }}
            className="max-w-sm space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4"
        >
            <h2 className="text-sm font-medium text-slate-300">Log a weigh-in</h2>
            <label className="block text-xs text-slate-400">
                date
                <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                    required
                />
            </label>
            <label className="block text-xs text-slate-400">
                weight (kg)
                <input
                    type="number"
                    step="0.05"
                    min="20"
                    max="300"
                    value={kg}
                    onChange={(e) => setKg(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                    required
                />
            </label>
            <label className="block text-xs text-slate-400">
                note (optional)
                <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                />
            </label>
            <button
                type="submit"
                disabled={status === "saving"}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
                {status === "saving" ? "Saving…" : "Save"}
            </button>
            {status === "saved" && <p className="text-xs text-emerald-400">Saved.</p>}
            {status === "error" && <p className="text-xs text-rose-400">{err}</p>}
        </form>
    );
}

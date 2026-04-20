import { useEffect, useState } from "react";
import { call } from "../lib/api";

interface Experiment {
    id: number;
    label: string;
    start_date: string;
    end_date: string | null;
    note: string | null;
}

export function Experiments() {
    const [items, setItems] = useState<Experiment[]>([]);
    const [label, setLabel] = useState("");
    const today = new Date().toISOString().slice(0, 10);
    const [start, setStart] = useState(today);
    const [err, setErr] = useState<string | null>(null);

    async function refresh() {
        try {
            setItems(await call<Experiment[]>("list_experiments"));
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    return (
        <div className="space-y-4">
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (!label) return;
                    await call("tag_experiment", { label, start });
                    setLabel("");
                    await refresh();
                }}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3"
            >
                <label className="flex-1 text-xs text-slate-400">
                    label
                    <input
                        type="text"
                        placeholder="16:8 fasting"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                    />
                </label>
                <label className="text-xs text-slate-400">
                    start
                    <input
                        type="date"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        className="mt-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                    />
                </label>
                <button className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500">
                    Tag
                </button>
            </form>
            {err && <p className="text-sm text-rose-400">{err}</p>}
            <ul className="space-y-2">
                {items.map((e) => (
                    <li
                        key={e.id}
                        className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 p-3 text-sm"
                    >
                        <div>
                            <div className="font-medium">{e.label}</div>
                            <div className="text-xs text-slate-400">
                                {e.start_date} → {e.end_date ?? "…"}
                            </div>
                        </div>
                        {!e.end_date && (
                            <button
                                onClick={async () => {
                                    await call("close_experiment", {
                                        experiment_id: e.id,
                                        end: new Date().toISOString().slice(0, 10),
                                    });
                                    await refresh();
                                }}
                                className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                            >
                                Close today
                            </button>
                        )}
                    </li>
                ))}
                {items.length === 0 && (
                    <li className="text-sm text-slate-500">
                        No experiments yet. Tell Claude "I'm starting X today" and it will tag it.
                    </li>
                )}
            </ul>
        </div>
    );
}

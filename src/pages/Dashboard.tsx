import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { StatCard } from "../components/StatCard";
import { WeightChart } from "../components/WeightChart";

interface TrendResp {
    entries: { date: string; value: number }[];
    moving_average_7d: { date: string; value: number }[];
    slope_kg_per_week: number | null;
    latest_kg: number | null;
    latest_date: string | null;
    latest_bmi: number | null;
    bmi_category: string | null;
    goal_kg_low: number;
    goal_kg_high: number;
}

interface EtaResp {
    target_kg: number;
    reachable: boolean;
    etaDate: string | null;
    daysRemaining: number | null;
    weeklyRateKg: number;
    kcalDailyDeficitImplied: number;
    slopeFlat: boolean;
}

interface PlateauResp {
    plateau: boolean;
    slopeKgPerWeek: number;
    windowDays: number;
}

export function Dashboard() {
    const [trend, setTrend] = useState<TrendResp | null>(null);
    const [eta, setEta] = useState<EtaResp | null>(null);
    const [plateau, setPlateau] = useState<PlateauResp | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [t, e, p] = await Promise.all([
                    call<TrendResp>("get_weight_trend", { days: 60 }),
                    call<EtaResp>("compute_goal_eta", { window_days: 14 }),
                    call<PlateauResp>("detect_plateau", { days: 14 }),
                ]);
                setTrend(t);
                setEta(e);
                setPlateau(p);
            } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
            }
        })();
    }, []);

    if (err) return <p className="text-rose-400">Failed to load: {err}</p>;
    if (!trend || !eta) return <p className="text-slate-400">Loading…</p>;

    const weeklyRate = trend.slope_kg_per_week;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                    label="current weight"
                    value={trend.latest_kg !== null ? `${trend.latest_kg.toFixed(1)} kg` : "—"}
                    hint={trend.latest_date ?? undefined}
                />
                <StatCard
                    label="weekly rate"
                    value={
                        weeklyRate !== null
                            ? `${weeklyRate > 0 ? "+" : ""}${weeklyRate.toFixed(2)} kg`
                            : "—"
                    }
                    tone={weeklyRate !== null && weeklyRate < -0.1 ? "positive" : "warning"}
                    hint="last 14 days"
                />
                <StatCard
                    label="ETA to goal"
                    value={eta.etaDate ?? (eta.slopeFlat ? "stalled" : "—")}
                    hint={
                        eta.daysRemaining !== null
                            ? `${eta.daysRemaining} days · ${eta.kcalDailyDeficitImplied} kcal/day deficit`
                            : undefined
                    }
                    tone={eta.reachable && !eta.slopeFlat ? "positive" : "warning"}
                />
                <StatCard
                    label="BMI"
                    value={trend.latest_bmi !== null ? trend.latest_bmi.toFixed(1) : "—"}
                    hint={trend.bmi_category ?? undefined}
                />
            </div>
            {plateau?.plateau && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
                    Plateau: last {plateau.windowDays} days slope is {plateau.slopeKgPerWeek} kg/week.
                    Consider asking Claude for a weekly review.
                </div>
            )}
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                <h2 className="mb-2 text-sm font-medium text-slate-300">Weight (last 60 days)</h2>
                <WeightChart
                    entries={trend.entries}
                    movingAverage={trend.moving_average_7d}
                    goalLow={trend.goal_kg_low}
                    goalHigh={trend.goal_kg_high}
                />
            </div>
        </div>
    );
}

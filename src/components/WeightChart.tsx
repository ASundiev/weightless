import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceArea,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface Point {
    date: string;
    value: number;
}

export function WeightChart({
    entries,
    movingAverage,
    goalLow,
    goalHigh,
}: {
    entries: Point[];
    movingAverage: Point[];
    goalLow: number;
    goalHigh: number;
}) {
    const merged = mergeByDate(entries, movingAverage);
    return (
        <div className="h-72 w-full">
            <ResponsiveContainer>
                <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 8, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis
                        domain={["dataMin - 0.5", "dataMax + 0.5"]}
                        stroke="#64748b"
                        fontSize={11}
                        width={56}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "1px solid #334155",
                            fontSize: 12,
                        }}
                        formatter={(v: number) => v.toFixed(2)}
                    />
                    <ReferenceArea
                        y1={goalLow}
                        y2={goalHigh}
                        fill="#10b981"
                        fillOpacity={0.15}
                        stroke="#10b981"
                        strokeOpacity={0.5}
                    />
                    <Line
                        type="monotone"
                        dataKey="kg"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="weight (kg)"
                    />
                    <Line
                        type="monotone"
                        dataKey="ma"
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                        name="7-day avg"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

function mergeByDate(entries: Point[], ma: Point[]) {
    const byDate = new Map<string, { date: string; kg?: number; ma?: number }>();
    for (const p of entries) {
        byDate.set(p.date, { date: p.date, kg: p.value });
    }
    for (const p of ma) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row.ma = p.value;
        byDate.set(p.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

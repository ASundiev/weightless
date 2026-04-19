import { Link, Route, Routes, useLocation } from "react-router-dom";
import { TokenGate } from "./components/TokenGate";
import { Dashboard } from "./pages/Dashboard";
import { Log } from "./pages/Log";
import { Experiments } from "./pages/Experiments";
import { clearToken } from "./lib/api";

export default function App() {
    return (
        <TokenGate>
            <Shell />
        </TokenGate>
    );
}

function Shell() {
    const { pathname } = useLocation();
    const navClass = (path: string) =>
        `rounded px-3 py-1.5 text-sm ${
            pathname === path ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
        }`;
    return (
        <div className="mx-auto max-w-3xl px-4 py-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Weightless</h1>
                    <p className="text-xs text-slate-500">Your data layer. Ask Claude for coaching.</p>
                </div>
                <button
                    onClick={() => {
                        clearToken();
                        location.reload();
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300"
                >
                    sign out
                </button>
            </header>
            <nav className="mb-6 flex gap-2">
                <Link to="/" className={navClass("/")}>Dashboard</Link>
                <Link to="/log" className={navClass("/log")}>Log</Link>
                <Link to="/experiments" className={navClass("/experiments")}>Experiments</Link>
            </nav>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/log" element={<Log />} />
                <Route path="/experiments" element={<Experiments />} />
            </Routes>
        </div>
    );
}

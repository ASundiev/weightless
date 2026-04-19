import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        goal: "#10b981",
        trend: "#3b82f6",
        warn: "#f59e0b",
      },
    },
  },
  plugins: [],
} satisfies Config;

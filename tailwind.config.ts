import type { Config } from "tailwindcss";

export default {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Cascadia Code", "JetBrains Mono", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "nav-progress": { from: { transform: "scaleX(0.05)" }, to: { transform: "scaleX(0.9)" } },
      },
      animation: { "fade-in": "fade-in .25s ease-out both", "nav-progress": "nav-progress 2.5s cubic-bezier(.1,.7,.3,1) both" },
    },
  },
  plugins: [],
} satisfies Config;

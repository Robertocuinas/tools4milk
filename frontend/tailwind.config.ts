import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Kept in sync with the @theme tokens in src/app/globals.css, which
        // is the source of truth for Tailwind v4 (CSS-first config). This
        // JS config is not wired via @config and is effectively inert, but
        // is kept aligned to avoid reintroducing the old green palette if
        // it's ever picked up again.
        brand: {
          DEFAULT: "#1DA1F2",
          mid: "#1DB6F2",
          accent: "#0DC4D9",
          light: "#E8F6FE",
          dark: "#0A5C8F",
        },
        app: {
          bg: "#F2F2F2",
          surface: "#FFFFFF",
          border: "#DFE3E6",
          text: "#0D0D0D",
          dim: "#5E6A71",
        },
        tv: {
          bg: "#F2F2F2",
          surface: "#FFFFFF",
          surface2: "#F7F7F7",
          border: "#DFE3E6",
          text: "#0D0D0D",
          dim: "#5E6A71",
          accent: "#1DA1F2",
        },
        state: {
          critica: "#DC2626",
          atencion: "#D97706",
          ok: "#16A34A",
          info: "#1E40AF",
          neutral: "#64748B",
        },
      },
      boxShadow: {
        brand: "0 18px 60px rgba(29,161,242,0.28)",
        panel: "0 4px 12px rgba(0,0,0,0.08)",
        deck: "0 30px 80px rgba(0,0,0,0.34)",
        critical: "0 4px 14px #DC262644",
      },
      fontFamily: {
        heading: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

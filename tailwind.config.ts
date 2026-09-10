import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#12100D",
        graphite: "#1E1B17",
        hairline: "#332E27",
        ivory: "#F3EDE1",
        parchment: "#DCD3BF",
        gold: "#C9A24B",
        "gold-dim": "#8A6E33",
        bronze: "#8A5A32",
        crimson: "#8C3B2E",
        sapphire: "#3E5C76",
        verdigris: "#4A6B5A"
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-manrope)", "sans-serif"],
        dial: ["var(--font-spacegrotesk)", "monospace"],
        wordmark: ["var(--font-italiana)", "serif"]
      },
      boxShadow: {
        none: "none"
      }
    }
  },
  plugins: []
};
export default config;

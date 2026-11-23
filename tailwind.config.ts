import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Inter'", "system-ui", "-apple-system", "sans-serif"],
        hand: ["'Caveat'", "'Segoe Print'", "cursive"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        studio: {
          950: "#090b10",
          900: "#10131c",
          850: "#161a26",
          800: "#1e2434",
          700: "#2a3146",
          600: "#3c4663",
        },
      },
    },
  },
  plugins: [],
};

export default config;

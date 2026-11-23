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
        sans: ["'Inter'", "system-ui", "-apple-system", "sans-serif"],
        hand: ["'Caveat'", "'Segoe Print'", "cursive"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        studio: {
          950: "#09090d",
          900: "#111118",
          850: "#171721",
          800: "#1e1e2b",
          700: "#2b2b3d",
          600: "#3d3d54",
        },
      },
    },
  },
  plugins: [],
};

export default config;

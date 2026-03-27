import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Stitch design system tokens */
        primary: "#b4c5ff",
        "primary-container": "#2563eb",
        "on-primary": "#002a78",
        "on-primary-container": "#eeefff",
        "on-primary-fixed-variant": "#003ea8",

        secondary: "#d2bbff",
        "secondary-container": "#6001d1",
        "secondary-fixed-dim": "#d2bbff",
        "on-secondary": "#3f008e",
        "on-secondary-container": "#c9aeff",

        tertiary: "#ffb690",
        "tertiary-container": "#b54e00",
        "tertiary-fixed-dim": "#ffb77c",
        "on-tertiary": "#552100",
        "on-tertiary-container": "#ffece5",

        surface: "#0a0e1a",
        "surface-dim": "#0a0e1a",
        "surface-bright": "#353946",
        "surface-container-lowest": "#0a0e1a",
        "surface-container-low": "#111827",
        "surface-container": "#1b1f2c",
        "surface-container-high": "#262a37",
        "surface-container-highest": "#313442",
        "surface-variant": "#313442",
        "surface-tint": "#b4c5ff",

        "on-surface": "#dfe2f3",
        "on-surface-variant": "#c3c6d7",
        "on-background": "#dfe2f3",
        background: "#0a0e1a",

        outline: "#8d90a0",
        "outline-variant": "#434655",

        error: "#ffb4ab",
        "error-container": "#93000a",
        "on-error": "#690005",
        "on-error-container": "#ffdad6",

        "inverse-surface": "#dfe2f3",
        "inverse-on-surface": "#2c303d",
        "inverse-primary": "#0053db",

        /* Legacy aliases (used by existing donate/stake/dashboard pages) */
        "bg-dark": "#0a0e1a",
        "bg-card": "#111827",
      },
      fontFamily: {
        headline: ["Manrope", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        label: ["Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;

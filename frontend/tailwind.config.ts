import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import defaultColors from "tailwindcss/colors";

/*
 * Theme tokens (ZSH-4). Every colour utility resolves to a CSS variable, so the
 * Dark / Light / Cyber switch in the header re-themes the whole app by
 * swapping variables on <html> - no per-page or per-class overrides.
 *
 * - Palette colours (slate, cyan, rose, ...) keep Tailwind's values in dark.
 *   Light mirrors each scale (50<->950, 100<->900, ... 500 stays), so a pair
 *   like `bg-cyan-950/40 text-cyan-300` keeps its contrast on a light page.
 * - Surface colours replace the hard-coded navy hexes: canvas (page), surface
 *   (sidebar, panels), raised (cards, inputs), overlay (hover, chips), line and
 *   line-strong (borders).
 */
const PALETTES = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green",
  "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
] as const;
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
const MIRROR: Record<string, string> = {
  "50": "950", "100": "900", "200": "800", "300": "700", "400": "600", "500": "500",
  "600": "400", "700": "300", "800": "200", "900": "100", "950": "50",
};

const SURFACES: Record<string, { dark: string; light: string; cyber: string }> = {
  canvas: { dark: "#060911", light: "#eef2f7", cyber: "#010409" },
  surface: { dark: "#080c16", light: "#ffffff", cyber: "#030816" },
  raised: { dark: "#0c111e", light: "#f6f8fb", cyber: "#050d24" },
  overlay: { dark: "#111a2b", light: "#e9eef5", cyber: "#081633" },
  line: { dark: "#162238", light: "#dbe3ee", cyber: "#00606f" },
  "line-strong": { dark: "#1e2b44", light: "#c3cede", cyber: "#0096aa" },
};

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const palette = (name: (typeof PALETTES)[number]) => defaultColors[name] as Record<string, string>;

function themeVars(theme: "dark" | "light" | "cyber"): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of PALETTES) {
    for (const shade of SHADES) {
      vars[`--c-${name}-${shade}`] = rgb(palette(name)[theme === "light" ? MIRROR[shade] : shade]);
    }
  }
  vars["--c-white"] = theme === "light" ? rgb(palette("slate")["900"]) : "255 255 255";
  vars["--c-black"] = theme === "light" ? "255 255 255" : "0 0 0";
  for (const [name, values] of Object.entries(SURFACES)) {
    vars[`--c-${name}`] = rgb(values[theme]);
  }
  return vars;
}

const themeTokens = plugin(({ addBase }) => {
  addBase({
    ":root": { ...themeVars("dark"), colorScheme: "dark" },
    "html.light": { ...themeVars("light"), colorScheme: "light" },
    "html.cyber": { ...themeVars("cyber"), colorScheme: "dark" },
  });
});

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ...Object.fromEntries(
          PALETTES.map((name) => [name, Object.fromEntries(SHADES.map((shade) => [shade, token(`${name}-${shade}`)]))])
        ),
        white: token("white"),
        black: token("black"),
        ...Object.fromEntries(Object.keys(SURFACES).map((name) => [name, token(name)])),
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-line": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { opacity: "0.4" },
          "100%": { opacity: "0.9" },
        },
      },
    },
  },
  plugins: [themeTokens],
};

export default config;

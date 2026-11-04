"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

/*
 * The assistant is themed on its own, not by the host app's Dark/Light/Cyber
 * switch. It ships in light mode and the visitor can switch it. The choice is a
 * display preference only and lives in this browser.
 *
 * Components read `var(--pa-<HEX>)` (backgrounds, borders, rings) and
 * `var(--pa-t-<HEX>)` (text), where <HEX> is the original light-mode colour.
 * That keeps the light values identical to the shipped design and lets dark mode
 * remap each one. Every use has the light hex as a CSS fallback, so a component
 * rendered outside a scope still looks right.
 */
export type AssistantTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "zs_pa_theme";

const DARK_BG: Record<string, string> = {
  FFFFFF: "#0F1B2A",
  "0B2C44": "#0A2236",
  "103848": "#1E6F8F",
  C04044: "#C04044",
  A72F34: "#B83A3F",
  "8E2F34": "#A32F34",
  F1F5F9: "#16263A",
  F7FAFD: "#132133",
  EAF1F7: "#1A2D43",
  F4F7FA: "#142335",
  F6F9FC: "#142335",
  F9FBFD: "#111E2E",
  F5F8FB: "#132133",
  FBFCFE: "#0D1826",
  EEF2F6: "#1C2E44",
  E8EEF4: "#223650",
  E3EAF2: "#223650",
  E2E8F0: "#26394F",
  E1E8F0: "#223650",
  DCE5EE: "#2B4059",
  D8E2EC: "#2B4059",
  CBD6E1: "#34495F",
  B9C7D5: "#3E546B",
  "9FB3C8": "#4F6A84",
  "7B9AB5": "#5F7F9A",
  "7B8FA2": "#6C8198",
  FFF8F8: "#2A1719",
  FFF1F1: "#331B1D",
  E9C8CA: "#5A2A2E",
  F2A6A8: "#8A3A3E",
  D9A5A8: "#7A3A3E",
  FBE3E4: "#3F2023",
  FFF9EC: "#2A2314",
  F0E2C2: "#4D3F1E",
  E7D6B5: "#4D3F1E",
  E8F5EC: "#14301F",
};

const DARK_TEXT: Record<string, string> = {
  "0B2C44": "#E8F0F7",
  "103848": "#9CC5DA",
  "334E63": "#C3D2DF",
  "52677A": "#A3B5C5",
  "63798C": "#94A8BA",
  "7B8FA2": "#8DA1B4",
  "8FA2B3": "#7F93A6",
  A72F34: "#FCA5A8",
  "8E2F34": "#FCA5A8",
  C04044: "#F87B7F",
  "6B4E1E": "#F3D9A0",
  "1D7A43": "#6EE7A0",
  A9761B: "#FCD34D",
  F2A6A8: "#F2A6A8",
};

/** Every colour the light theme uses, found by scanning the components. */
const LIGHT_BG = [
  "FFFFFF", "0B2C44", "103848", "4ADE80", "7B8FA2", "7B9AB5", "8E2F34", "9FB3C8", "A72F34", "B9C7D5",
  "C04044", "CBD6E1", "D8E2EC", "D9A5A8", "DCE5EE", "E1E8F0", "E2E8F0", "E3EAF2", "E7D6B5", "E8EEF4",
  "E8F5EC", "E9C8CA", "EAF1F7", "EEF2F6", "F0E2C2", "F1F5F9", "F2A6A8", "F4F7FA", "F5F8FB", "F6F9FC",
  "F7FAFD", "F9FBFD", "FBE3E4", "FBFCFE", "FCA5A5", "FCD34D", "FFF1F1", "FFF8F8", "FFF9EC",
];
const LIGHT_TEXT = [
  "0B2C44", "103848", "1D7A43", "334E63", "52677A", "63798C", "6B4E1E", "7B8FA2", "8E2F34", "8FA2B3",
  "A72F34", "A9761B", "C04044", "F2A6A8",
];

function buildVars(theme: AssistantTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const hex of LIGHT_BG) vars[`--pa-${hex}`] = theme === "dark" ? (DARK_BG[hex] ?? `#${hex}`) : `#${hex}`;
  for (const hex of LIGHT_TEXT) vars[`--pa-t-${hex}`] = theme === "dark" ? (DARK_TEXT[hex] ?? `#${hex}`) : `#${hex}`;
  return vars;
}

const VARS: Record<AssistantTheme, Record<string, string>> = {
  light: buildVars("light"),
  dark: buildVars("dark"),
};

export function themeStyle(theme: AssistantTheme): CSSProperties {
  return { ...VARS[theme], colorScheme: theme } as CSSProperties;
}

export function readStoredTheme(): AssistantTheme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Light by default; the saved choice is applied after mount and shared across mounts. */
export function useAssistantTheme(): [AssistantTheme, () => void] {
  const [theme, setTheme] = useState<AssistantTheme>("light");

  useEffect(() => {
    setTheme(readStoredTheme());
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setTheme(readStoredTheme());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const toggle = useCallback(() => {
    const next: AssistantTheme = theme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts for this view only.
    }
    setTheme(next);
  }, [theme]);

  return [theme, toggle];
}

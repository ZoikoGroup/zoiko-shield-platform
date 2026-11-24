import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TIMEZONE_STORAGE_KEY = "zoiko_timezone_mode";
export const TIMEZONE_CHANGE_EVENT = "zoiko-timezone-change";

/**
 * Per-viewer display preference only. Storage can be unavailable (private
 * mode, blocked site data), so every access is guarded and falls back to LOCAL.
 */
export function readStoredTimezoneMode(): "UTC" | "LOCAL" {
  if (typeof window === "undefined") return "LOCAL";
  try {
    return localStorage.getItem(TIMEZONE_STORAGE_KEY) === "UTC" ? "UTC" : "LOCAL";
  } catch {
    return "LOCAL";
  }
}

export function storeTimezoneMode(mode: "UTC" | "LOCAL"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, mode);
  } catch {
    // Preference simply does not persist; display still switches.
  }
  try {
    window.dispatchEvent(new CustomEvent(TIMEZONE_CHANGE_EVENT, { detail: mode }));
  } catch {}
}

export function formatTimestamp(
  isoString?: string,
  timezoneMode?: "UTC" | "LOCAL",
): string {
  if (!isoString) return "N/A";
  try {
    const date = new Date(isoString);
    const resolvedMode = timezoneMode ?? readStoredTimezoneMode();
    const formatted = date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(resolvedMode === "UTC" ? { timeZone: "UTC" } : {}),
    });
    return resolvedMode === "UTC" ? `${formatted} UTC` : formatted;
  } catch {
    return isoString;
  }
}

export function truncateHash(hash?: string, prefixLen = 8, suffixLen = 6): string {
  if (!hash) return "—";
  if (hash.length <= prefixLen + suffixLen) return hash;
  return `${hash.slice(0, prefixLen)}...${hash.slice(-suffixLen)}`;
}

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function sha256Mock(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex}e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.slice(0, 64);
}

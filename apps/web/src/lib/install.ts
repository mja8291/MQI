import { useEffect, useState } from "react";

/**
 * v2 (W19): "Install app" on the sign-in page. Chromium fires `beforeinstallprompt` once, early,
 * so it is captured at start-up (captureInstallPrompt in main.tsx) and replayed to the button.
 * Safari has no prompt: the button explains Share → Add to Home Screen instead. Nothing is shown
 * once the app runs installed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's own mini-bar away; our button offers it
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function isRunningInstalled(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallMode = "prompt" | "ios" | "none";

export function useInstallApp(): { mode: InstallMode; install: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const mode: InstallMode = isRunningInstalled() ? "none" : deferred ? "prompt" : isIos() ? "ios" : "none";
  async function install() {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    await e.prompt();
    await e.userChoice.catch(() => undefined);
    notify();
  }
  return { mode, install };
}

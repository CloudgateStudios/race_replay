"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  // Read the same source of truth as theme-init.js so the icon is correct
  // immediately on the client without waiting for a useEffect paint.
  // suppressHydrationWarning on the button handles the server/client mismatch
  // (server always renders false since localStorage is unavailable there).
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // When no manual preference is stored, keep following the system preference
  // live — if the user changes their OS theme while the page is open, the site
  // updates automatically. Once the user manually flips the toggle (writing to
  // localStorage), this listener is detached and the manual choice wins.
  useEffect(() => {
    if (localStorage.getItem("theme")) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
      setIsDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <button
      suppressHydrationWarning
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={[
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "focus-visible:ring-ring transition-colors duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        isDark ? "bg-primary" : "bg-muted",
      ].join(" ")}
    >
      {/* Sliding thumb */}
      <span
        className={[
          "pointer-events-none flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm",
          "transform transition-transform duration-200 ease-in-out",
          isDark ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
        aria-hidden
      >
        {isDark ? (
          // Moon — shown in thumb when dark
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="text-primary h-3 w-3"
          >
            <path d="M6.027 1.604a.75.75 0 0 1 .207.617 5.5 5.5 0 0 0 7.19 6.27.75.75 0 0 1 .856.683A6.8 6.8 0 1 1 5.32 1.537a.75.75 0 0 1 .707.067Z" />
          </svg>
        ) : (
          // Sun — shown in thumb when light
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3 w-3 text-amber-500"
          >
            <path d="M8 1a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 1ZM8 12a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 12ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM12.743 3.317a.75.75 0 0 0-1.06 1.06l.707.708a.75.75 0 0 0 1.06-1.06l-.707-.708ZM3.61 11.975a.75.75 0 0 0-1.06 1.06l.707.707a.75.75 0 0 0 1.06-1.06l-.707-.707ZM15 8a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 15 8ZM4 8a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 4 8ZM12.45 11.975a.75.75 0 0 1 1.06 1.06l-.707.707a.75.75 0 0 1-1.06-1.06l.707-.707ZM3.317 3.317a.75.75 0 0 1 1.06 1.06l-.707.708a.75.75 0 0 1-1.06-1.06l.707-.708Z" />
          </svg>
        )}
      </span>
    </button>
  );
}

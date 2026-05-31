"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "badminton-fee-book.theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark") return stored;
  if (window.matchMedia("(prefers-color-scheme: dark)").matches)
    return "dark";
  return "light";
}

interface ThemeContextValue {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  toggleTheme: () => {}
});

export function ThemeContextProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeContext);
}

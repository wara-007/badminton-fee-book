import type { Metadata, Viewport } from "next";
import Script from "next/script";
import ThemeRegistry from "./theme-registry";
import PwaRegister from "./pwa-register";
import { ThemeContextProvider } from "@/lib/theme-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "สมุดค่าตีแบด",
  description: "ระบบจัดการและคำนวณค่าตีแบดมินตันแบบสมุดจด",
  applicationName: "สมุดค่าตีแบด",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ค่าตีแบด"
  },
  icons: {
    icon: [{ url: "/app-icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/app-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/app-icon.svg", type: "image/svg+xml" }]
  },
  other: {
    "mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  themeColor: "#1b3a6b"
};

const themeInitScript = `
  (function() {
    var theme = localStorage.getItem('badminton-fee-book.theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeRegistry>
          <ThemeContextProvider>
            <PwaRegister />
            {children}
          </ThemeContextProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}

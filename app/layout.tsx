import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "สมุดค่าตีแบด",
  description: "ระบบจัดการและคำนวณค่าตีแบดมินตันแบบสมุดจด"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

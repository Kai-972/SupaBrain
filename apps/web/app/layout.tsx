import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Supabrain",
  description: "One shared memory for every AI on your team. It remembers where every fact came from, and takes a wrong one back from all of them at once.",
};
export const viewport: Viewport = { themeColor: "#050806", width: "device-width", initialScale: 1 };

// Applies the saved theme / projector size before paint, so there's no flash.
const prefs = `try{var t=localStorage.getItem('sb-theme');if(t)document.documentElement.dataset.theme=t;if(localStorage.getItem('sb-big')==='1')document.documentElement.dataset.big='1'}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefs }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

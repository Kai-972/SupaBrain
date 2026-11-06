import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Supabrain",
  description: "Stop prompt injection at the handoff between AI agents. Every AI has an ENS identity with public rules; every handoff is signed on Arkiv by the AI that wrote it.",
};
export const viewport: Viewport = { themeColor: "#050806", width: "device-width", initialScale: 1 };

// Applies the saved theme and projector size before first paint, so there's no flash.
const prefs = `try{var t=localStorage.getItem('sb-theme');if(t)document.documentElement.dataset.theme=t;if(localStorage.getItem('sb-big')==='1')document.documentElement.dataset.big='1'}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: prefs }} /></head>
      <body>{children}</body>
    </html>
  );
}

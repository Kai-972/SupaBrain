import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import "./v4.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap", weight: ["400", "500"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Supabrain",
  description: "Stop prompt injection at the handoff between AI agents. Every AI has an ENS identity with public rules; every handoff is signed on Arkiv by the AI that wrote it.",
};
export const viewport: Viewport = { themeColor: "#FAF9F5", width: "device-width", initialScale: 1 };

// Applies the saved theme and projector size before first paint, so there's no flash.
const prefs = `document.documentElement.classList.add('js');try{var t=localStorage.getItem('sb-theme');if(t==='dark')document.documentElement.dataset.theme='dark';if(localStorage.getItem('sb-big')==='1')document.documentElement.dataset.big='1'}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: prefs }} /></head>
      <body>{children}</body>
    </html>
  );
}

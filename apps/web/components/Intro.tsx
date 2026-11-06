"use client";
// The opening sequence (about 2.6 s, once per visit). It tells the product in one motion:
// three AIs hand work along a line; a poisoned packet hits the ENS gate and is stopped; the wordmark settles.
// Click or press any key to skip. Skipped entirely for prefers-reduced-motion.
import { useEffect, useState } from "react";

export function Intro() {
  const [phase, setPhase] = useState<"off" | "on" | "out">("off");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("sb-intro") === "1"; } catch { /* private mode */ }
    if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("on");
    const out = setTimeout(() => setPhase("out"), 2700);
    const done = setTimeout(() => { setPhase("off"); try { sessionStorage.setItem("sb-intro", "1"); } catch { /* ignore */ } }, 3400);
    const skip = () => { clearTimeout(out); setPhase("out"); setTimeout(() => setPhase("off"), 600); try { sessionStorage.setItem("sb-intro", "1"); } catch { /* ignore */ } };
    addEventListener("keydown", skip, { once: true });
    return () => { clearTimeout(out); clearTimeout(done); removeEventListener("keydown", skip); };
  }, []);
  if (phase === "off") return null;
  return (
    <div className={`intro${phase === "out" ? " out" : ""}`} onClick={() => { setPhase("out"); setTimeout(() => setPhase("off"), 600); try { sessionStorage.setItem("sb-intro", "1"); } catch { /* ignore */ } }} role="presentation">
      <svg className="intro-art" viewBox="0 0 520 120" aria-hidden="true">
        <line className="i-line" x1="40" y1="60" x2="480" y2="60" />
        <g className="i-node n1"><circle cx="60" cy="60" r="16" /><text x="60" y="65">C</text></g>
        <g className="i-node n2"><circle cx="260" cy="60" r="16" /><text x="260" y="65">G</text></g>
        <g className="i-node n3"><circle cx="460" cy="60" r="16" /><text x="460" y="65">O</text></g>
        <circle className="i-packet ok" cx="60" cy="60" r="5" />
        <rect className="i-gate" x="352" y="34" width="8" height="52" rx="2" />
        <text className="i-gate-l" x="356" y="24">ENS</text>
        <circle className="i-packet bad" cx="260" cy="60" r="6" />
        <g className="i-x"><path d="M343 51 L325 69 M325 51 L343 69" /></g>
        <text className="i-stop" x="334" y="104">STOPPED</text>
      </svg>
      <div className="intro-word">
        <span className="serif">Supabrain</span>
        <em>Accountable handoffs between AI agents</em>
      </div>
      <span className="intro-skip mono">click to skip</span>
    </div>
  );
}

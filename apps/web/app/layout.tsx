import type { ReactNode } from "react";

export const metadata = {
  title: "Supabrain",
  description: "A shared memory for your AIs that knows where every fact came from.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

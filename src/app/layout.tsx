import type { Metadata, Viewport } from "next";
import { Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/* Two faces, and the split is the design's central idea: the serif is for words
   and meanings, the mono for anything the machine counts. See ROADMAP [R18]. */
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Daily Words",
  description: "Six words a day, on one card, in your pocket.",
  manifest: "/manifest.webmanifest",
  // The favicon and apple-touch-icon links are emitted from app/icon.png and
  // app/apple-icon.png by file convention. Do not hand-write them here.
  appleWebApp: {
    capable: true,
    title: "Daily Words",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Without this, every env(safe-area-inset-*) silently resolves to 0.
  viewportFit: "cover",
  // The only two colour literals in the codebase, and they have to be literals:
  // this is emitted into a <meta> tag that iOS reads before any stylesheet
  // loads, so `var(--paper)` would resolve to nothing. They mirror --paper in
  // src/styles/tokens.css — change both together.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F0EDE4" },
    { media: "(prefers-color-scheme: dark)", color: "#131311" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sourceSerif.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

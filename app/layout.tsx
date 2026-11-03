// Simplified layout – system fonts only for reliable builds, with Google Fonts
// loaded at runtime for Devanagari/Gujarati script rendering.
import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dharohar · Heritage atlas",
  description:
    "Search and explore India's living heritage: sites, crafts and documents on a map.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* React 19 / App Router: explicit <head> keeps preconnects and stylesheet tags
          co-located. maplibre-gl.css and Google Fonts are loaded as raw <link> tags
          to bypass Turbopack's CSS bundler (known issue with node_modules CSS paths). */}
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags -- maplibre-gl.css cannot be bundled by next/font; must be a raw CSS tag */}
        <link
          rel="stylesheet"
          href="/maplibre-gl.css"
          precedence="default"
        />
        {/* Noto Sans for Devanagari (Hindi) and Gujarati script rendering.
            Loaded via <link> rather than next/font to avoid Turbopack CSS pipeline issues. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wdth,wght@62.5..100,100..900&family=Noto+Sans+Gujarati:wdth,wght@62.5..100,100..900&display=swap"
          precedence="default"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-amber-800 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>
        <div id="main-content" className="flex-1 flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}

// Simplified layout – system fonts only for reliable builds.
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
      {/* React 19 hoists <link> elements from the body into <head> automatically.
          We load maplibre-gl CSS this way to bypass Turbopack's CSS bundler which
          has a known bug where it appends a double ".css" extension to paths from
          node_modules when processed through a custom turbopack rule. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <link
          rel="stylesheet"
          href="/maplibre-gl.css"
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

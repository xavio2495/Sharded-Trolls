import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Titles: Outlaw Grizzly Hunter (SIL OFL 1.1, Resource Boy). Served unmodified as woff2.
const display = localFont({
  src: "./fonts/outlaw-grizzly-hunter/OutlawGrizzlyHunter.woff2",
  variable: "--font-display",
  display: "swap",
});

// Text: Giphurs variable (SIL OFL 1.1, The Giphurs Project Authors), Latin subset.
const text = localFont({
  src: [
    { path: "./fonts/giphurs/Giphurs-Variable.woff2", style: "normal", weight: "100 1000" },
    { path: "./fonts/giphurs/Giphurs-Italic-Variable.woff2", style: "italic", weight: "100 1000" },
  ],
  variable: "--font-text",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sharded Trolls: pay the troll",
  description:
    "A NEAR memecoin split across eight shards. Every bridge has a troll. Feed them all, or they starve.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

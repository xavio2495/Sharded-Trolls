import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Dashboard } from "./components/Dashboard";

export const metadata: Metadata = {
  title: "The Feeding · Sharded Trolls",
  description: "Live state of the eight trolls on NEAR testnet: feeders, food, hoards, your home troll, and the daily settlement.",
};

export default function AppPage() {
  return (
    <div className="grain min-h-full">
      <header className="sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3 font-display text-2xl tracking-wide text-ink-0">
            <Image src="/logo.svg" alt="" width={40} height={40} className="size-10" />
            Sharded Trolls
          </Link>
          <Link href="/" className="text-sm font-medium text-ink-1 hover:text-ink-0">
            Back to the story
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Dashboard />
      </main>
    </div>
  );
}

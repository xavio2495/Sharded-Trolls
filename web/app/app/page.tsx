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
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-40 border-b-[3px] border-ink-0 bg-paper">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center gap-3 font-display text-2xl tracking-wide text-ink-0">
            <Image src="/logo.svg" alt="" width={40} height={40} className="size-10" />
            Sharded Trolls
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-1 hover:text-ink-0">
            The story
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Dashboard />
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EvidenceTabs } from "./components/EvidenceTabs";

export const metadata: Metadata = {
  title: "Evidence · Sharded Trolls",
  description:
    "Measured, not simulated: load tests of one token contract against eight trolls on a local network with mainnet's shard layout, and the final contracts checked on NEAR testnet.",
};

export default function EvidencePage() {
  return (
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Sharded Trolls, home" className="flex min-w-0 shrink items-center gap-2 font-display text-lg tracking-wide text-ink-0 sm:gap-3 sm:text-2xl">
            <Image src="/logo.svg" alt="" width={40} height={40} className="size-8 shrink-0 sm:size-10" />
            <span className="hidden truncate sm:inline">Sharded Trolls</span>
          </Link>
          {/* Short labels on phones so the links never run into the wordmark. */}
          <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink-1 sm:gap-3">
            <Link href="/paper" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">Paper</Link>
            <Link href="/app" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">
              <span className="sm:hidden">Live</span>
              <span className="hidden sm:inline">The Feeding, live</span>
            </Link>
            <Link href="/" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 hover:text-ink-0">
              <span className="sm:hidden">Story</span>
              <span className="hidden sm:inline">Back to the story</span>
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-12">
        <h1 className="max-w-4xl font-display text-5xl leading-[1.02] text-ink-0 md:text-6xl">Measured, not simulated</h1>
        <p className="lead mt-4 max-w-3xl">
          Load tests against one ordinary token and against the eight trolls, run on a local NEAR network with mainnet&apos;s shard layout, and the final contracts checked transaction by
          transaction on testnet. Every number here comes from a file in the repository.
        </p>
        <div className="mt-12">
          <EvidenceTabs />
        </div>
      </main>
    </div>
  );
}

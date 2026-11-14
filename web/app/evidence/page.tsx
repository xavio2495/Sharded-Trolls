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
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3 font-display text-2xl tracking-wide text-ink-0">
            <Image src="/logo.svg" alt="" width={40} height={40} className="size-10" />
            Sharded Trolls
          </Link>
          <div className="flex items-center gap-5 text-sm font-medium text-ink-1">
            <Link href="/app" className="hover:text-ink-0">The Feeding, live</Link>
            <Link href="/" className="hover:text-ink-0">Back to the story</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-12">
        <p className="eyebrow">Evidence</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[1.02] text-ink-0 md:text-6xl">Measured, not simulated</h1>
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

import type { Metadata } from "next";
import Header from "@/app/components/shell/Header";
import { EvidenceTabs } from "./components/EvidenceTabs";

export const metadata: Metadata = {
  title: "Evidence · Sharded Trolls",
  alternates: { types: { "text/markdown": "/evidence.md" } },
  description:
    "Measured, not simulated: load tests of one token contract against eight trolls on a local network with mainnet's shard layout, and the final contracts checked on NEAR testnet.",
};

export default function EvidencePage() {
  return (
    <div className="min-h-full bg-paper">
      <Header current="/evidence" sticky />
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

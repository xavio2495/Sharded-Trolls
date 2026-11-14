"use client";

import { useEffect, useState } from "react";
import { Compare } from "./Compare";
import { LOCALNET_NOTE } from "./data";
import { Replay } from "./Replay";
import { Testnet } from "./Testnet";
import { Note } from "./ui";

const TABS = [
  { id: "compare", label: "Compare", title: "One shard against eight", blurb: "The same offered load against one ordinary token contract and against the eight trolls." },
  { id: "replay", label: "Replay a run", title: "Watch a measured run", blurb: "Every block of a load test, shard by shard: congestion, chunk fullness and rejected transactions." },
  { id: "testnet", label: "Testnet", title: "Checked on NEAR testnet", blurb: "The final contracts deployed on testnet: fan-out, refunds, conservation and the Feeding, transaction by transaction." },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function EvidenceTabs() {
  const [tab, setTab] = useState<Tab>("compare");

  // The tab follows the URL hash, so /evidence#testnet links straight to it.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === h)) setTab(h as Tab);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <div role="tablist" aria-label="Evidence views" className="flex flex-wrap gap-2 border-b-2 border-ink-line pb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={`rounded-[var(--radius-ui)] border-2 px-5 py-2 text-sm font-semibold tracking-wide transition-colors ${
              tab === t.id ? "border-accent-deep bg-accent-deep text-paper" : "border-ink-line bg-paper text-ink-0 hover:bg-surface-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-8">
        <h2 className="font-display text-4xl text-ink-0 md:text-5xl">{current.title}</h2>
        <p className="lead mt-3 max-w-3xl">{current.blurb}</p>
        {tab !== "testnet" && (
          <div className="mt-4 max-w-4xl">
            <Note>{LOCALNET_NOTE}</Note>
          </div>
        )}
      </div>
      <div role="tabpanel" className="mt-8">
        {tab === "compare" && <Compare />}
        {tab === "replay" && <Replay />}
        {tab === "testnet" && <Testnet />}
      </div>
    </div>
  );
}

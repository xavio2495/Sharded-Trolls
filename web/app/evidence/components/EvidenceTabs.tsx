"use client";

import { useSyncExternalStore } from "react";
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

// The selected tab is the URL hash, so /evidence#testnet links straight to it and the buttons and
// the panel always read the same value. The server renders "compare".
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = (): Tab => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : "compare";
};

export function EvidenceTabs() {
  const tab = useSyncExternalStore(subscribe, readHash, () => "compare" as Tab);
  // Replace the hash (no history entry, no jump) and tell the store it changed.
  const pick = (t: Tab) => {
    if (t === tab) return;
    history.replaceState(null, "", `#${t}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <div role="tablist" aria-label="Evidence views" className="flex flex-wrap gap-2 border-b-2 border-ink-line pb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="evidence-panel"
            onClick={() => pick(t.id)}
            className={`inline-flex min-h-11 items-center rounded-[var(--radius-ui)] border-2 px-5 text-sm font-semibold tracking-wide ${
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
      <div role="tabpanel" id="evidence-panel" aria-labelledby={`tab-${tab}`} className="mt-8">
        {tab === "compare" && <Compare />}
        {tab === "replay" && <Replay />}
        {tab === "testnet" && <Testnet />}
      </div>
    </div>
  );
}

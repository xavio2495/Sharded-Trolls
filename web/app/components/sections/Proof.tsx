"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/app/lib/gsap";
import { whenReady } from "@/app/components/shell/ready";

// Each figure counts up when it scrolls into view. Sources: measurements/ in the repository.
const FIGURES = [
  { value: 8, suffix: "", label: "shards, one troll each, running one global contract by hash on NEAR testnet" },
  { value: 50, suffix: "/50", label: "transfers fanned out from one transaction, zero failed receipts" },
  { value: 0, suffix: "", label: "transfers to a troll rejected for congestion; one ordinary token rejected 280 (synthetic localnet)" },
  { value: 5, suffix: "", label: "audit passes; every critical and high finding fixed, every medium fixed or disclosed" },
];

export default function Proof() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root.current);
      return whenReady(() => {
        q("[data-count]").forEach((el) => {
          const end = Number((el as HTMLElement).dataset.count);
          const v = { n: 0 };
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          el.textContent = "0";
          gsap.to(v, {
            n: end,
            duration: 1.6,
            ease: "power2.out",
            onUpdate: () => (el.textContent = String(Math.round(v.n))),
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="proof" ref={root} className="tone-dark container py-32">
      <p className="eyebrow" data-reveal>
        Proof
      </p>
      <h2 className="h2 mt-4 max-w-4xl" data-reveal="lines">
        Run on real NEAR, audited, and rehearsed.
      </h2>
      <dl className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {FIGURES.map((f, i) => (
          <div key={f.label} className="border-t border-white/15 pt-6" data-reveal data-reveal-delay={(i * 0.1).toFixed(2)}>
            <dt className="font-display text-7xl text-[#a9cf86]">
              <span data-count={f.value}>{f.value}</span>
              {f.suffix}
            </dt>
            <dd className="body mt-3">{f.label}</dd>
          </div>
        ))}
      </dl>
      <p className="small mt-14 max-w-3xl text-[#9fb0a3]" data-reveal>
        Honest limits: not faster per transfer, wallets list one entry per troll, the Feeding is a game and not
        Sybil-proof, and DEX trading goes through a single-shard wrapper.
      </p>
      <a href="/evidence" className="btn btn-line mt-10 text-white" data-reveal data-magnetic>
        See every measurement
      </a>
    </section>
  );
}

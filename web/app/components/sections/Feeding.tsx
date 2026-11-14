"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP } from "@/app/lib/gsap";
import { whenReady } from "@/app/components/shell/ready";

const TROLLS = [
  { name: "Beanie", shard: 10 },
  { name: "Lantern", shard: 11 },
  { name: "Fisher", shard: 12 },
  { name: "Straw Hat", shard: 13 },
  { name: "Scholar", shard: 9 },
  { name: "Kettle", shard: 7 },
  { name: "Oar", shard: 4 },
  { name: "Mushroom", shard: 5 },
];

const RULES = [
  { title: "Fed", text: "Every troll gets its feeders for the day: the streak grows, and each troll pays its feeders from the tolls it ate, then from its launch pool." },
  { title: "Starving", text: "A troll nobody fed burns 1% of its hoard, and the streak starts over." },
  { title: "Settled by anyone", text: "Whoever closes the day earns a small NEAR bounty, paid from the claim fees." },
];

// Pinned: the eight keepers slide past horizontally while you scroll; each bobs as it passes the centre.
export default function Feeding() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root.current);
      return whenReady(() => {
        const track = q("[data-track]")[0] as HTMLElement;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (window.matchMedia("(max-width: 767px)").matches) return; // mobile: a plain swipeable row
        const distance = () => track.scrollWidth - track.clientWidth;
        gsap.to(track.children, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: { trigger: q("[data-pin]")[0], start: "top top", end: () => `+=${distance()}`, scrub: true, pin: true, invalidateOnRefresh: true },
        });
        gsap.utils.toArray<HTMLElement>(q("[data-troll]")).forEach((el, i) => {
          gsap.to(el, { y: -10, duration: 1.4 + (i % 3) * 0.2, repeat: -1, yoyo: true, ease: "sine.inOut", delay: i * 0.15 });
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="feeding" ref={root} className="tone-light">
      <div data-pin className="flex min-h-svh flex-col justify-center gap-10 py-[calc(var(--header)+1rem)]">
        <div className="grid gap-10 px-[var(--gutter)] lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="h1" data-reveal="lines">
              The game on top: feed them all, or they starve.
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {RULES.map((r, i) => (
              <div key={r.title} data-reveal data-reveal-delay={(i * 0.1).toFixed(2)}>
                <h3 className="h4">{r.title}</h3>
                <p className="body mt-2">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div data-track className="flex gap-6 overflow-x-auto px-[var(--gutter)] md:overflow-visible">
          {TROLLS.map((t, i) => (
            <figure key={t.name} className={`slab w-[16rem] flex-none p-5 text-center md:w-[19rem] ${i % 2 ? "rotate-2" : "-rotate-1"}`} data-magnetic>
              <div data-troll>
                <Image src={`/art/trolls-v3/troll-${i + 1}.webp`} alt={`${t.name}, the troll of shard ${t.shard}`} width={720} height={720} sizes="20rem" className="w-full" />
              </div>
              <figcaption className="mt-2">
                <span className="block font-display text-2xl text-ink-0">{t.name}</span>
                <span className="tag text-ink-1">shard {t.shard}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

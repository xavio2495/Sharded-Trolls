"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP } from "@/app/lib/gsap";
import { whenReady } from "@/app/components/shell/ready";

// Pinned: one jammed river, then scrolling wipes it into eight streams. The copy swaps with it.
export default function WhyEight() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root.current);
      return whenReady(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: q("[data-pin]")[0], start: "top top", end: "+=120%", scrub: true, pin: true },
        });
        tl.fromTo(q("[data-eight]"), { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)" })
          .to(q("[data-one-copy]"), { opacity: 0, y: -24, duration: 0.35 }, 0.05)
          .fromTo(q("[data-eight-copy]"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4 }, 0.55);
      });
    },
    { scope: root },
  );

  return (
    <section id="why" ref={root} className="tone-stone">
      <div data-pin className="container grid min-h-svh items-center gap-12 py-[calc(var(--header)+2rem)] md:grid-cols-[0.8fr_1.2fr]">
        <div className="relative">
          <p className="eyebrow" data-reveal>
            Why eight
          </p>
          <h2 className="h2 mt-4" data-reveal="lines">
            NEAR never splits a contract.
          </h2>
          <div className="relative mt-8 min-h-[12rem]">
            <div data-one-copy className="absolute inset-0">
              <p className="lead">
                One contract is one river. Shards split only between accounts, so when a claim rush comes, it all
                queues on one shard.
              </p>
              <p className="small mt-4">
                Before the 2024 split at game.hot.tg its shard ran 42.5% full against 10.2% elsewhere.
              </p>
            </div>
            <div data-eight-copy className="absolute inset-0 opacity-0">
              <p className="lead">
                Eight trolls are eight streams, one per shard. Your home troll comes from a hash of your account, so
                the crowd spreads evenly and keeps flowing.
              </p>
              <p className="small mt-4">Same-troll transfers never touch another shard.</p>
            </div>
          </div>
        </div>
        <div className="relative aspect-[4/5] max-h-[78svh] w-full justify-self-end overflow-hidden rounded-[2rem] md:w-auto">
          <Image src="/art/one-river-v1.webp" alt="One river flowing out of a lake, jammed bank to bank with coin boats; its troll holds its head." fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
          <div data-eight className="absolute inset-0" style={{ clipPath: "inset(0% 100% 0% 0%)" }}>
            <Image src="/art/eight-streams-v1.webp" alt="Eight streams flowing out of the same lake, boats in every one, a happy troll beside each." fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

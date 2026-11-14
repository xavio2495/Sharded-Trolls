"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP } from "@/app/lib/gsap";
import { whenReady } from "@/app/components/shell/ready";

// What we built. Pinned: one jammed river, then scrolling wipes it into eight streams; the copy swaps with it.
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
          .to(q("[data-one-copy]"), { opacity: 0, x: -40, duration: 0.35 }, 0.05)
          .fromTo(q("[data-eight-copy]"), { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 }, 0.55)
          .fromTo(q("[data-frame]"), { rotate: 2 }, { rotate: -2 }, 0);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="tone-stone">
      <div data-pin className="grid min-h-svh items-center gap-12 px-[var(--gutter)] py-[calc(var(--header)+2rem)] md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative">
          <h2 className="h1" data-reveal="lines">
            So we split the token.
          </h2>
          <div className="relative mt-10 min-h-[15rem]">
            <div data-one-copy className="absolute inset-0">
              <p className="lead">One ordinary token is one contract: one river. Every holder queues on its shard.</p>
            </div>
            <div data-eight-copy className="absolute inset-0 opacity-0">
              <ul className="space-y-4 text-xl leading-snug text-ink-0">
                <li>Eight ledgers, the trolls, one on each shard.</li>
                <li>Your home troll is a hash of your account, so the crowd spreads evenly.</li>
                <li>One contract code, published once, shared by all eight.</li>
              </ul>
            </div>
          </div>
        </div>
        <div data-frame className="slab relative mx-auto aspect-[4/5] w-full max-w-[min(100%,62svh)] overflow-hidden">
          <Image src="/art/one-river-v1.webp" alt="One river flowing out of a lake, jammed bank to bank with coin boats; its troll holds its head." fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
          <div data-eight className="absolute inset-0" style={{ clipPath: "inset(0% 100% 0% 0%)" }}>
            <Image src="/art/eight-streams-v1.webp" alt="Eight streams flowing out of the same lake, boats in every one, a happy troll beside each." fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

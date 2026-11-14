"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap, SplitText, useGSAP } from "@/app/lib/gsap";
import { isReady, whenReady } from "@/app/components/shell/ready";

const LIFT = 0.1;

export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root.current);
      const title = q("[data-title]")[0] as HTMLElement;
      const split = SplitText.create(title, { type: "chars,words", charsClass: "inline-block" });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // The entrance is built paused at mount, so its start state is already in place under the preloader;
      // it plays once, as the preloader opens. Coming back to an already-shown page skips straight to the end.
      const intro = gsap
        .timeline({ paused: true })
        .from(split.chars, { yPercent: 120, rotate: () => gsap.utils.random(-14, 14), duration: 1, stagger: 0.03 }, 0)
        .from(q("[data-frame]"), { x: 80, rotate: 6, opacity: 0, duration: 1 }, 0)
        .from(q("[data-claim], [data-cta]"), { y: 30, opacity: 0, duration: 0.9, stagger: 0.1 }, 0.5)
        .from(q("[data-sticker]"), { scale: 0, rotate: -40, duration: 0.9, ease: "back.out(1.8)" }, 0.7);
      if (isReady()) intro.progress(1);
      return whenReady(() => {
        if (intro.progress() < 1) intro.play();
        // scroll: only the title drifts; the painting and the sticker stay put
        const st = { trigger: root.current, start: "top top", end: "bottom top", scrub: true };
        gsap.to(title, { xPercent: -8, ease: "none", scrollTrigger: st });
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          split.chars.forEach((c) => {
            c.addEventListener("pointerenter", () => gsap.to(c, { y: `-${LIFT}em`, rotate: gsap.utils.random(-8, 8), duration: 0.3, ease: "power2.out" }));
            c.addEventListener("pointerleave", () => gsap.to(c, { y: 0, rotate: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" }));
          });
        }
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="tone-light relative min-h-svh overflow-hidden pt-[var(--header)]">
      <h1 data-title className="display relative z-20 mt-6 px-[var(--gutter)] text-ink-0 lg:text-[10rem] lg:leading-[0.85]">
        Pay the
        <br />
        troll.
      </h1>

      <div data-frame className="slab relative z-10 mx-[var(--gutter)] mt-8 aspect-[3/2] -rotate-2 overflow-hidden lg:absolute lg:right-[var(--gutter)] lg:top-[calc(var(--header)+3rem)] lg:mx-0 lg:mt-0 lg:w-[54%]">
        <Image
          src="/art/hero-v5.webp"
          alt="Eight streams flow out of one lake toward you, each kept by its own troll on the bank. A traveller crosses one bridge and hands a coin to the troll at the far end."
          fill
          priority
          data-preload
          sizes="(min-width: 1024px) 54vw, 100vw"
          className="object-cover object-[50%_45%]"
        />
      </div>

      <Image
        data-sticker
        src="/art/trolls-v3/troll-1.webp"
        alt=""
        width={720}
        height={720}
        className="pointer-events-none absolute right-[4%] top-[58%] z-30 hidden w-[13rem] rotate-12 lg:block"
      />

      <div className="relative z-20 mx-[var(--gutter)] mt-10 grid max-w-3xl gap-6 pb-20 lg:mt-14">
        <p data-claim className="slab-moss max-w-xl rotate-1 px-6 py-5 text-2xl leading-snug">
          One token, split across eight NEAR shards. A launch rush can&apos;t jam one shard, because there are eight.
        </p>
        <div data-cta className="flex flex-wrap gap-4">
          <Link href="/app" className="btn btn-moss" data-magnetic>
            Feed a troll
          </Link>
          <Link href="/pitch" className="btn btn-line" data-magnetic>
            How it&apos;s built
          </Link>
        </div>
      </div>
    </section>
  );
}

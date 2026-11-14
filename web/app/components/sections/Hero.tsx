"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap, SplitText, useGSAP } from "@/app/lib/gsap";
import { whenReady } from "@/app/components/shell/ready";

// how far the photo leans toward the pointer (px at the frame's edge), and how far a letter lifts (em)
const LOOK = 14;
const LIFT = 0.08;

export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root.current);
      const frame = q("[data-frame]")[0] as HTMLElement;
      const photo = q("[data-photo]")[0] as HTMLElement;
      const title = q("[data-title]")[0] as HTMLElement;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const split = SplitText.create(title, { type: "chars,words", charsClass: "inline-block" });

      // the frame covers the whole sticky screen; at rest it is clipped to the box under the copy
      const rest = () => {
        const copy = q("[data-copy]")[0] as HTMLElement;
        const g = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) * parseFloat(getComputedStyle(document.documentElement).fontSize) || 24;
        const top = copy.getBoundingClientRect().bottom - root.current!.getBoundingClientRect().top + 16;
        return `inset(${top}px ${g}px ${g}px ${g}px round 2rem)`;
      };
      gsap.set(frame, { clipPath: rest() });

      return whenReady(() => {
        if (reduce) return;
        // entrance: letters rise, the frame grows out of a pill
        gsap.from(split.chars, { yPercent: 110, opacity: 0, duration: 1.1, stagger: 0.025 });
        gsap.from(q("[data-sub], [data-cta]"), { y: 24, opacity: 0, duration: 1, stagger: 0.12, delay: 0.35 });
        gsap.from(frame, { opacity: 0, scale: 0.94, duration: 1.4, ease: "trollInOut" });
        gsap.fromTo(photo, { scale: 1.25 }, { scale: 1.08, duration: 1.6 });

        // scroll: the frame opens to full bleed while the words lift away
        gsap.fromTo(
          frame,
          { clipPath: () => rest() },
          {
            clipPath: "inset(0px 0px 0px 0px round 0rem)",
            ease: "none",
            immediateRender: false,
            scrollTrigger: { trigger: root.current, start: "top top", end: "50% top", scrub: true, invalidateOnRefresh: true },
          },
        );
        gsap.to(q("[data-copy]"), {
          yPercent: -40,
          opacity: 0,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "60% top", scrub: true },
        });

        // pointer: the painting leans toward the pointer; letters lift under it
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          const px = gsap.quickTo(photo, "x", { duration: 0.9, ease: "power3.out" });
          const py = gsap.quickTo(photo, "y", { duration: 0.9, ease: "power3.out" });
          root.current!.addEventListener("pointermove", (e) => {
            const r = frame.getBoundingClientRect();
            px(((e.clientX - r.left) / r.width - 0.5) * -2 * LOOK);
            py(((e.clientY - r.top) / r.height - 0.5) * -2 * LOOK);
          });
          split.chars.forEach((c) => {
            c.addEventListener("pointerenter", () => gsap.to(c, { y: `-${LIFT}em`, duration: 0.35, ease: "power2.out" }));
            c.addEventListener("pointerleave", () => gsap.to(c, { y: 0, duration: 0.6, ease: "elastic.out(1, 0.5)" }));
          });
        }
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="tone-light relative h-[200vh]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="container relative z-10 pt-[var(--header)]">
          <div data-copy className="grid items-end gap-8 pt-6 md:grid-cols-[1fr_minmax(22rem,30rem)]">
            <h1 data-title className="display text-ink-0">
              Pay the troll.
            </h1>
            <div className="pb-3">
              <p data-sub className="lead">
                A memecoin split across eight NEAR shards: eight streams flowing side by side, each kept by its own troll.
                Cross to another stream and its troll takes a toll.
              </p>
              <div data-cta className="mt-6 flex gap-3">
                <Link href="/app" className="btn btn-moss" data-magnetic>
                  Open the app
                </Link>
                <Link href="/pitch" className="btn btn-line text-ink-0" data-magnetic>
                  Watch the pitch
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div data-frame className="absolute inset-0 overflow-hidden">
            <div data-photo className="absolute -inset-[4%]">
              <Image
                src="/art/hero-v5.webp"
                alt="Eight streams flow out of one lake toward you, each kept by its own troll on the bank. A traveller crosses one bridge and hands a coin to the troll at the far end."
                fill
                priority
                data-preload
                sizes="100vw"
                className="object-cover object-[50%_35%]"
              />
            </div>
        </div>
      </div>
    </section>
  );
}

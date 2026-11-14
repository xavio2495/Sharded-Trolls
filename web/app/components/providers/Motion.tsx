"use client";

import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/app/lib/gsap";
import { whenReady } from "@/app/components/shell/ready";

/**
 * Page-wide scroll motion, driven by data attributes so sections only declare intent:
 *   data-reveal            fades and rises in when it enters the viewport
 *   data-reveal="lines"    a heading whose lines rise out of a mask, one after another
 *   data-reveal-delay="0.2" extra delay in seconds
 *   data-parallax="0.12"   drifts vertically by that fraction of its height while it crosses the screen
 *                          (put it on an image inside an overflow-hidden frame, scaled up to cover the drift)
 *   data-magnetic          leans toward the pointer while it is near, and springs back when it leaves
 *                          (fine pointers only)
 */
export default function Motion() {
  useGSAP(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const setup = () => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        const delay = parseFloat(el.dataset.revealDelay ?? "0");
        const trigger = { trigger: el, start: "top 88%", once: true };
        if (el.dataset.reveal === "lines") {
          gsap.set(el, { opacity: 1 });
          const split = SplitText.create(el, { type: "lines", mask: "lines" });
          gsap.from(split.lines, { yPercent: 105, duration: 1.3, stagger: 0.09, delay, scrollTrigger: trigger });
        } else {
          gsap.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1.2, delay, scrollTrigger: trigger });
        }
      });

      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const amount = parseFloat(el.dataset.parallax || "0.12") * 100;
        gsap.fromTo(
          el,
          { yPercent: -amount / 2 },
          {
            yPercent: amount / 2,
            ease: "none",
            scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });

      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
          const x = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
          const y = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
          el.addEventListener("pointermove", (e) => {
            const r = el.getBoundingClientRect();
            x((e.clientX - (r.left + r.width / 2)) * 0.3);
            y((e.clientY - (r.top + r.height / 2)) * 0.4);
          });
          // back through the same followers, so the next hover picks up where this one left off
          el.addEventListener("pointerleave", () => {
            x(0);
            y(0);
          });
        });
      }

      // sections build their pins in the same hand-over; measure once they all exist, in page order
      requestAnimationFrame(() => {
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
      });
    };

    // wait for the preloader to hand over, so nothing animates underneath it
    return whenReady(setup);
  });

  return null;
}

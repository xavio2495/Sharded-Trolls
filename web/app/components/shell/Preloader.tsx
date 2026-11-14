"use client";

import { useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/app/lib/gsap";
import { useLenis } from "@/app/components/providers/SmoothScroll";
import { signalReady } from "./ready";
import { allLoaded, onProgress, track } from "./loading";

// Eight streams are drawn one after another (the eight shards), fill with moss as the page loads, then the
// sheet opens from the centre onto the page. A return visit in the same session gets the short version.
const MAX_WAIT = 12000;
const MAX_WAIT_REDUCED = 3000;
const SEEN = "trolls-intro";
const STREAMS = 8;

// a gentle S-curve per stream, so they read as water rather than bars
const streamPath = (i: number) => {
  const x = 40 + i * 40;
  const s = i % 2 === 0 ? 6 : -6;
  return `M${x} 10 C ${x + s} 60, ${x - s} 110, ${x} 160 S ${x + s} 260, ${x} 310`;
};

function loadImage(img: HTMLImageElement) {
  if (img.complete && img.naturalWidth > 0) return img.decode().catch(() => {});
  return new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

export default function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const lenis = useLenis();
  const [done, setDone] = useState(false);

  useGSAP(
    () => {
      // Coming back to the page (Next keeps the route alive and re-runs effects): the intro has already
      // played and nothing is mounted, so just make sure the page is unlocked.
      if (!root.current) {
        document.documentElement.classList.remove("is-loading");
        lenis.current?.start();
        signalReady();
        return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.documentElement.classList.add("is-loading");
      window.scrollTo(0, 0);
      track(document.fonts.ready);
      document.querySelectorAll<HTMLImageElement>("img[data-preload]").forEach((img) => track(loadImage(img)));
      const loaded = (cap = MAX_WAIT) =>
        Promise.race([allLoaded(), new Promise<void>((r) => window.setTimeout(r, cap))]).then(() => ScrollTrigger.refresh());

      const finish = () => {
        document.documentElement.classList.remove("is-loading");
        sessionStorage.setItem(SEEN, "1");
        lenis.current?.start();
        signalReady();
        setDone(true);
      };

      // ?nointro skips the intro entirely (QA, screenshots, deep links)
      if (new URLSearchParams(window.location.search).has("nointro")) {
        gsap.set(root.current, { autoAlpha: 0 });
        finish();
        return;
      }

      if (reduce) {
        loaded(MAX_WAIT_REDUCED).then(() => gsap.to(root.current, { autoAlpha: 0, duration: 0.4, onComplete: finish }));
        return;
      }

      const q = gsap.utils.selector(root.current);
      const count = q("[data-count]")[0] as HTMLElement;
      const bar = q("[role=progressbar]")[0] as HTMLElement;
      const fills = root.current!.querySelectorAll<SVGPathElement>("[data-fill]");
      const lit = { v: 0 };
      const render = () => {
        const pct = Math.round(lit.v * 100);
        count.textContent = String(pct).padStart(2, "0");
        bar.setAttribute("aria-valuenow", String(pct));
        // each stream fills in turn as progress rises
        fills.forEach((f, i) => {
          const own = Math.min(1, Math.max(0, lit.v * STREAMS - i));
          f.style.strokeDashoffset = String(1 - own);
        });
      };
      render();

      let filling = false;
      let progress = 0;
      const floor = { v: 0 };
      const fill = () => filling && gsap.to(lit, { v: Math.max(progress, floor.v), duration: 0.5, ease: "power2.out", overwrite: true, onUpdate: render });
      // the real progress moves in a few big steps (fonts, the hero image); a floor easing toward 85% keeps the
      // count moving steadily, and real progress takes over whenever it is ahead
      gsap.to(floor, { v: 0.85, duration: 1.6, ease: "power1.out", onUpdate: () => fill() });
      const stopProgress = onProgress((p) => {
        progress = p;
        fill();
      });

      const quick = sessionStorage.getItem(SEEN) === "1";
      const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
      const hurry = () => tl.timeScale(4);
      const tl = gsap.timeline({ defaults: { ease: "troll" }, onStart: () => lenis.current?.stop(), onComplete: finish });
      const resume = () => loaded().then(() => tl.play());
      const draw = quick ? 0.6 : 1.1;
      const each = quick ? 0.04 : 0.09;
      const drawn = 0.1 + draw + each * (STREAMS - 1);

      tl.to(q("[data-outline]"), { strokeDashoffset: 0, duration: draw, stagger: each, ease: "power2.inOut" }, 0.1)
        .to(q("[data-counter]"), { autoAlpha: 1, y: 0, duration: 0.8 }, 0.25)
        .to(q("[data-title]"), { autoAlpha: 1, y: 0, duration: 0.8 }, 0.35)
        .call(() => {
          filling = true;
          fill();
          events.forEach((e) => window.addEventListener(e, hurry, { once: true, passive: true }));
        }, [], drawn)
        .addPause(drawn + 0.2, resume);

      tl.add(() => {
        filling = false;
      })
        .to(lit, { v: 1, duration: quick ? 0.3 : 0.4, ease: "power2.inOut", overwrite: true, onUpdate: render })
        .to(q("[data-counter], [data-title]"), { autoAlpha: 0, y: -12, duration: 0.4, ease: "power2.in" }, "+=0.1")
        // the streams spread apart and fade as the sheet opens from the centre onto the page
        .to(q("[data-streams]"), { scaleX: 3.2, autoAlpha: 0, duration: 0.8, ease: "trollInOut" }, "<0.1")
        .call(() => signalReady(), [], "<0.2")
        .fromTo(
          root.current,
          { clipPath: "circle(150% at 50% 50%)" },
          { clipPath: "circle(0% at 50% 50%)", duration: 0.85, ease: "trollInOut" },
          "<0.25",
        );

      const safety = window.setTimeout(() => tl.progress(1), tl.duration() * 1000 + MAX_WAIT + 2500);
      return () => {
        window.clearTimeout(safety);
        stopProgress();
        events.forEach((e) => window.removeEventListener(e, hurry));
      };
    },
    { scope: root },
  );

  if (done) return null;

  return (
    <div ref={root} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-paper" aria-live="polite">
      <svg data-streams viewBox="0 0 400 320" className="h-[46vh] w-auto" aria-hidden="true">
        {Array.from({ length: STREAMS }, (_, i) => (
          <g key={i}>
            <path d={streamPath(i)} pathLength={1} fill="none" stroke="var(--mist)" strokeWidth="6" strokeLinecap="round" strokeDasharray="1" strokeDashoffset="1" data-outline />
            <path d={streamPath(i)} pathLength={1} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray="1" strokeDashoffset="1" data-fill />
          </g>
        ))}
      </svg>
      <p data-title className="h3 mt-8 translate-y-3 text-ink-0 opacity-0">Waking the trolls</p>
      <div data-counter className="mt-3 flex translate-y-3 items-baseline gap-1 opacity-0">
        <span data-count className="font-display text-5xl text-accent-deep">00</span>
        <span className="text-ink-2">%</span>
      </div>
      <div role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} className="sr-only" />
    </div>
  );
}

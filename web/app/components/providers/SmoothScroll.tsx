"use client";

import { createContext, useContext, useEffect, useRef, type RefObject } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/app/lib/gsap";

const LenisContext = createContext<RefObject<Lenis | null>>({ current: null });

/** Ref to the page's Lenis instance (null until mounted). */
export const useLenis = () => useContext(LenisContext);

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenis = useRef<Lenis | null>(null);

  useEffect(() => {
    const instance = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    instance.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis.current = instance;
    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis.current = null;
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}

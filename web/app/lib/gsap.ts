"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, useGSAP);

CustomEase.create("troll", "0.22, 1, 0.36, 1");
CustomEase.create("trollInOut", "0.76, 0, 0.24, 1");

gsap.defaults({ ease: "troll", duration: 1.2 });

export { gsap, ScrollTrigger, SplitText, useGSAP };

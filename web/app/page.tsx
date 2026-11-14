import Motion from "./components/providers/Motion";
import Preloader from "./components/shell/Preloader";
import Header from "./components/shell/Header";
import Hero from "./components/sections/Hero";
import Marquee from "./components/sections/Marquee";
import Problem from "./components/sections/Problem";
import Kit from "./components/sections/Kit";
import WhyEight from "./components/sections/WhyEight";
import Toll from "./components/sections/Toll";
import Feeding from "./components/sections/Feeding";
import Proof from "./components/sections/Proof";
import Closing from "./components/sections/Closing";

export default function Home() {
  return (
    <>
      <Preloader />
      <Motion />
      <Header />
      <main className="sheets">
        <Hero />
        <Marquee />
        <Problem />
        <WhyEight />
        <Toll />
        <Proof />
        <Kit />
        <Feeding />
        <Closing />
      </main>
    </>
  );
}

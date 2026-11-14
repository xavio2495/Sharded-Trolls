import Image from "next/image";

const STEPS = [
  { title: "Same stream", text: "No troll, no toll. Most of the time the eight streams just flow side by side." },
  { title: "Another stream", text: "One bridge, straight there. It skips every stream in between." },
  { title: "The toll", text: "The troll at the far end keeps 0.25% as food, and food pays its feeders. If your friend isn't registered there, every coin comes back." },
];

export default function Toll() {
  return (
    <section id="toll" className="tone-light container py-32">
      <div className="grid items-center gap-16 md:grid-cols-2">
        <div className="relative aspect-[1100/520] overflow-hidden rounded-[2rem]">
          <Image
            src="/art/toll-v5.webp"
            alt="A traveller crosses one stone bridge over several streams and hands a single coin to the troll waiting at the far end."
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="scale-110 object-cover"
            data-parallax="0.12"
          />
        </div>
        <div>
          <p className="eyebrow" data-reveal>
            The Troll Toll
          </p>
          <h2 className="h2 mt-4" data-reveal="lines">
            Cross a stream, feed its troll.
          </h2>
          <ol className="mt-10 space-y-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[3rem_1fr] gap-4" data-reveal data-reveal-delay={(i * 0.12).toFixed(2)}>
                <span className="font-display text-3xl text-accent">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="h4">{s.title}</h3>
                  <p className="body mt-2">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

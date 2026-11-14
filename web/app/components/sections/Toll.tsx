import Image from "next/image";

// The hard part: a transfer between two shards is asynchronous. Shown as the three hops it really takes.
const HOPS = [
  { word: "Debit", text: "Your troll takes the coins out of your balance and marks them in flight." },
  { word: "Credit", text: "One hop to the receiver's troll on its own shard. It pays your friend and keeps 0.25% as food." },
  { word: "Confirm", text: "Back home, your troll closes the transfer. Nothing is ever left in flight." },
];

export default function Toll() {
  return (
    <section className="tone-light relative overflow-hidden px-[var(--gutter)] py-28">
      <h2 className="h1 max-w-5xl" data-reveal="lines">
        Crossing a shard is the hard part.
      </h2>
      <p className="lead mt-6 max-w-2xl" data-reveal>
        Same troll: one step, no toll. Another troll: the transfer crosses shards and comes back. We call the 0.25% the
        Troll Toll.
      </p>

      <div className="mt-16 grid items-start gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-0">
          {HOPS.map((h, i) => (
            <div key={h.word} className={`py-6 ${i % 2 ? "lg:ml-16" : ""}`} data-reveal data-reveal-delay={(i * 0.12).toFixed(2)}>
              <p className="font-display text-6xl text-ink-0">
                {h.word}
                {i < HOPS.length - 1 && <span className="ml-3 text-accent-deep">→</span>}
              </p>
              <p className="body mt-3 max-w-md">{h.text}</p>
            </div>
          ))}
          <div className="slab-moss mt-8 -rotate-1 p-6" data-reveal>
            <p className="text-xl leading-snug">
              Credit fails? Every coin comes back. Credit landed? Never refunded, so a failure can never mint. Supply is
              checked after every step.
            </p>
          </div>
        </div>
        <div className="slab relative aspect-[1100/520] rotate-2 overflow-hidden lg:mt-24">
          <Image
            src="/art/toll-v5.webp"
            alt="A traveller crosses one stone bridge over several streams and hands a single coin to the troll waiting at the far end."
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="scale-110 object-cover"
            data-parallax="0.12"
          />
        </div>
      </div>
    </section>
  );
}

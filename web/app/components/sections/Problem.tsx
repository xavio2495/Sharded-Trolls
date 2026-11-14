// The problem, in raw numbers. Sources: measurements/mainnet/split-causes-2026-11-13.jsonl.
export default function Problem() {
  return (
    <section className="tone-light relative overflow-hidden px-[var(--gutter)] py-28">
      <h2 className="h1 max-w-4xl" data-reveal="lines">
        NEAR never splits a contract.
      </h2>
      <p className="lead mt-6 max-w-xl" data-reveal>
        Shards split only between accounts. So when a claim rush hits one token, it all queues on one shard. It has
        happened before.
      </p>

      <div className="mt-16 grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-0">
        <div className="slab -rotate-1 p-8 md:mr-[-3rem] md:mt-10" data-reveal data-parallax="0.08">
          <p className="tag text-ink-1">HOT · split on 2024-03-21</p>
          <p className="mt-2 font-display text-[clamp(4rem,9vw,8rem)] leading-none text-ink-0">42.5%</p>
          <p className="body mt-2">full on the shard holding game.hot.tg, against 10.2% on every other shard.</p>
        </div>
        <div className="slab-moss rotate-2 p-8 md:mt-40" data-reveal data-reveal-delay="0.15" data-parallax="0.16">
          <p className="tag text-[#cfe3bd]">KaiChing · split on 2025-03-19</p>
          <p className="mt-2 font-display text-[clamp(4rem,9vw,8rem)] leading-none">66%</p>
          <p className="mt-2 text-white/85">of sampled receipts went to three KaiChing accounts before NEAR split the shard.</p>
        </div>
      </div>
    </section>
  );
}

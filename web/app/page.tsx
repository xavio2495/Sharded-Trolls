import Image from "next/image";
import Link from "next/link";

const TROLLS = [
  { name: "Beanie", shard: 10 },
  { name: "Lantern", shard: 11 },
  { name: "Fisher", shard: 12 },
  { name: "Straw Hat", shard: 13 },
  { name: "Scholar", shard: 9 },
  { name: "Kettle", shard: 7 },
  { name: "Oar", shard: 4 },
  { name: "Mushroom", shard: 5 },
];

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-3 font-display text-2xl tracking-wide text-ink-0">
          <Image src="/logo.svg" alt="" width={40} height={40} className="size-10" />
          Sharded Trolls
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium text-ink-1">
          <Link href="#toll" className="hover:text-ink-0">The Toll</Link>
          <Link href="#feeding" className="hover:text-ink-0">The Feeding</Link>
          <Link href="#proof" className="hover:text-ink-0">Proof</Link>
          <Link href="/tech" className="hover:text-ink-0">Tech</Link>
          <Link
            href="/app"
            className="rounded-[var(--radius-ui)] bg-terracotta-deep px-4 py-2 text-paper hover:brightness-110"
          >
            Open the app
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src="/art/hero-streams.webp"
        alt="Eight parallel streams, each carrying little coin boats at the same time, each kept by its own moss troll on the bank. One bridge leaps across several streams, and the troll at its far end takes a single coin."
        width={1536}
        height={1024}
        priority
        className="h-[min(82vh,860px)] min-h-[600px] w-full object-cover object-[50%_60%]"
      />
      <div className="absolute left-4 top-8 max-w-xl rounded-[var(--radius-card)] border-2 border-ink-line bg-paper/92 p-7 shadow-[5px_5px_0_0_var(--ink-line)] md:left-14 md:top-12 md:p-9">
        <h1 className="font-display text-6xl leading-[0.95] text-ink-0 md:text-8xl">Pay the troll.</h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-0">
          A memecoin split across eight NEAR shards: eight streams flowing side by side, each kept by its own troll. Cross to another stream and its troll takes a toll. Feed them all, or they starve.
        </p>
        <div className="mt-7 flex gap-3">
          <Link href="/app" className="rounded-[var(--radius-ui)] bg-terracotta-deep px-5 py-3 font-semibold text-paper hover:brightness-110">
            Open the app
          </Link>
          <Link href="/pitch" className="rounded-[var(--radius-ui)] border border-ink-0/40 bg-paper/80 px-5 py-3 font-semibold text-ink-0 hover:bg-paper">
            Watch the pitch
          </Link>
        </div>
      </div>
    </section>
  );
}

function Section({ id, kicker, title, children }: { id?: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-deep">{kicker}</p>
      <h2 className="mt-2 font-display text-4xl text-ink-0 md:text-5xl">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-ink-line/70 bg-surface-1 p-6 shadow-[4px_4px_0_0_var(--ink-line)]">
      <h3 className="font-display text-2xl text-ink-0">{title}</h3>
      <div className="mt-3 leading-relaxed text-ink-1">{children}</div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="grain">
      <Nav />
      <main>
        <Hero />

        <Section kicker="Why eight" title="NEAR never splits a contract.">
          <div className="grid gap-6 md:grid-cols-3">
            <Card title="One contract, one shard">
              Shards split only between accounts. A token that wants room on more than one shard has to be more than one
              contract.
            </Card>
            <Card title="Claim rushes fill shards">
              Before the 2024 split at game.hot.tg its shard ran 42.5% full against 10.2% elsewhere. Before the 2025
              KaiChing split, three KaiChing accounts took 66% of receipts.
            </Card>
            <Card title="Eight trolls, eight shards">
              Each troll sits on its own shard today. Your home troll comes from a hash of your account, so the crowd
              spreads evenly.
            </Card>
          </div>
          <figure className="mt-10">
            <Image src="/art/why-eight.webp" alt="Left: one river jammed bank to bank with coin boats and a troll clutching his head. Right: the same boats flowing down eight parallel streams, each with a happy troll." width={1536} height={768} className="w-full rounded-[var(--radius-card)] border-2 border-ink-line shadow-[4px_4px_0_0_var(--ink-line)]" />
            <figcaption className="mt-3 text-sm text-ink-1">One contract is one river: a claim rush jams it. Eight trolls are eight streams flowing at once.</figcaption>
          </figure>
        </Section>

        <Section id="toll" kicker="The Troll Toll" title="Cross a bridge, feed the troll.">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <ol className="space-y-4 text-lg leading-relaxed text-ink-1">
              <li><span className="font-display text-2xl text-ink-0">Same stream:</span> no troll, no toll. Most of the time the eight streams just flow side by side.</li>
              <li><span className="font-display text-2xl text-ink-0">Another stream:</span> one bridge, straight there. It skips every stream in between.</li>
              <li><span className="font-display text-2xl text-ink-0">The toll:</span> the troll at the far end keeps 0.25% as food. If your friend isn&apos;t registered there, every coin comes back.</li>
            </ol>
            <Image src="/art/toll.webp" alt="A traveller crosses one long bridge from the second stream straight to the sixth, over the streams between, and tosses a single coin to the sixth stream's troll. In front, a boat stays in its own stream and its troll just waves." width={1536} height={1024} className="w-full rounded-[var(--radius-card)] border-2 border-ink-line shadow-[4px_4px_0_0_var(--ink-line)]" />
          </div>
        </Section>

        <Section id="feeding" kicker="The Feeding" title="Feed them all, or they starve.">
          <div className="grid gap-6 md:grid-cols-3">
            <Card title="Fed">
              When every troll has enough feeders in a day, the streak grows and each troll pays its feeders: first from
              the tolls it ate, then from its launch pool.
            </Card>
            <Card title="Starving">
              A troll nobody fed burns 1% of its hoard, and the streak starts over.
            </Card>
            <Card title="Settled by anyone">
              Anyone can close the day. Whoever does earns a small NEAR bounty, paid from the claim fees.
            </Card>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TROLLS.map((t, i) => (
              <li key={t.name} className="rounded-[var(--radius-card)] border-2 border-ink-line/70 bg-surface-1 p-3 text-center shadow-[3px_3px_0_0_var(--ink-line)]">
                <Image src={`/art/trolls/troll-${i + 1}.webp`} alt={`${t.name}, the shard ${t.shard} troll`} width={720} height={720} className="w-full mix-blend-multiply" />
                <span className="block font-display text-xl text-ink-0">{t.name}</span>
                <span className="text-sm text-ink-1">shard {t.shard}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="proof" kicker="Proof" title="Run on real NEAR, not just slides.">
          <div className="grid gap-6 md:grid-cols-3">
            <Card title="One code, eight shards">
              On testnet all eight trolls run one global contract by hash, each on its own shard.
            </Card>
            <Card title="Hardened">
              Four audit passes, long random property runs, and a scripted rehearsal of every deployment with injected
              faults.
            </Card>
            <Card title="Honest limits">
              Wallets list one entry per troll. The Feeding is a game, not Sybil-proof. DEX trading uses a single-shard
              wrapper.
            </Card>
          </div>
        </Section>
      </main>
      <footer className="border-t border-hairline px-6 py-10 text-center text-sm text-ink-1">
        Built during NEAR HACKATHON 2026 · MIT ·{" "}
        <a className="underline" href="https://github.com/xavio2495/Sharded-Trolls">GitHub</a>
      </footer>
    </div>
  );
}

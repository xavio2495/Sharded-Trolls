import Image from "next/image";
import Link from "next/link";

export default function Closing() {
  return (
    <section className="tone-light container py-32">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_auto]">
        <div>
          <p className="eyebrow" data-reveal>
            A launch kit
          </p>
          <h2 className="h1 mt-4 max-w-4xl" data-reveal="lines">
            Feed a troll today.
          </h2>
          <p className="lead mt-6 max-w-2xl" data-reveal>
            The troll code is published once on chain, so the next token on the kit costs only its accounts. Open the
            app, claim your starter bag, and cross a stream.
          </p>
          <div className="mt-10 flex flex-wrap gap-3" data-reveal>
            <Link href="/app" className="btn btn-moss" data-magnetic>
              Open the app
            </Link>
            <Link href="/pitch" className="btn btn-line text-ink-0" data-magnetic>
              Watch the pitch
            </Link>
            <a href="https://github.com/xavio2495/Sharded-Trolls" className="btn btn-line text-ink-0" data-magnetic>
              Read the code
            </a>
          </div>
        </div>
        <Image src="/art/trolls-v2/troll-8.webp" alt="The mushroom-crowned troll, delighted" width={720} height={720} className="w-[22rem]" data-reveal data-parallax="0.15" />
      </div>
      <footer className="mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-8">
        <span className="font-display text-xl">Sharded Trolls</span>
        <span className="small">Built during NEAR HACKATHON 2026 · MIT · testnet</span>
      </footer>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";

export default function Closing() {
  return (
    <section className="tone-light px-[var(--gutter)] pt-32 pb-10">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_auto]">
        <div>
          <h2 className="display max-w-5xl" data-reveal="lines">
            Feed a troll today.
          </h2>
          <p className="lead mt-6 max-w-2xl" data-reveal>
            Claim a starter bag, cross a stream, and watch a troll eat your toll. Testnet, free.
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
        <Image src="/art/trolls-v3/troll-8.webp" alt="The mushroom-crowned troll, delighted" width={720} height={720} className="w-[22rem] -rotate-6" data-reveal data-parallax="0.15" />
      </div>
      <footer className="mt-28 flex flex-wrap items-center justify-between gap-4">
        <span className="font-display text-xl">Sharded Trolls</span>
        <span className="tag text-ink-1">
          MIT · live on NEAR testnet ·{" "}
          <a href="/llms.txt" className="underline underline-offset-4">
            for agents: llms.txt
          </a>
        </span>
      </footer>
    </section>
  );
}

// It's a kit: the troll code is published once on chain, so the next token reuses it by hash.
export default function Kit() {
  return (
    <section className="tone-stone relative overflow-hidden px-[var(--gutter)] py-28">
      <div className="grid items-end gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="h1" data-reveal="lines">
            It&apos;s a kit.
          </h2>
          <p className="lead mt-6 max-w-xl" data-reveal>
            The troll code is published once as a global contract. The next token reuses it by hash: a root and eight
            small troll accounts, placed on eight shards. On testnet that cost about 3.65 NEAR.
          </p>
        </div>
        <pre
          className="slab -rotate-1 overflow-x-auto whitespace-pre-wrap break-all p-6 font-mono sm:whitespace-pre sm:break-normal text-xs leading-relaxed sm:text-sm"
          style={{ background: "#18211b", color: "#cfe3bd" }}
          data-reveal
          data-reveal-delay="0.1"
        >
          {`node scripts/deploy.mjs --network testnet \\
  --parent your.testnet --key-file key.json \\
  --global-hash 8XXviK8PceCwicgzFtKi2VoBNWR7MXFMBkZSDKNuFAEk \\
  --symbol YOURS --name "Your Trolls"`}
        </pre>
      </div>
    </section>
  );
}

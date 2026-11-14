const WORDS = ["8 shards", "1 token", "0 congestion rejections", "one hop, one toll", "pay the troll", "feed them all"];

// A slow band of raw facts between the hook and the problem. Decorative: the same facts appear in the page.
export default function Marquee() {
  const run = [...WORDS, ...WORDS];
  return (
    <section aria-hidden="true" className="marquee overflow-hidden bg-accent-deep py-4 text-white">
      <div>
        {[0, 1].map((k) => (
          <span key={k} className="flex">
            {run.map((w, i) => (
              <span key={`${k}-${i}`} className="px-6 font-display text-4xl whitespace-nowrap">
                {w} <span className="text-[#a9cf86]">✶</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </section>
  );
}

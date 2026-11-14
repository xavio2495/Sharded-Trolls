// "Eight streams": the scene is composed here so its geometry is always physically consistent.
// Eight channels flow out of the lake at the bottom of the backdrop and off the bottom edge; the land
// strips between them are continuous; boats only move inside channels; trolls only sit on land; every
// bridge runs from one land strip to another and lands beside the troll that takes the toll.

const W = 1920;
const H = 1080;
const LAKE_Y = 470; // bottom edge of the backdrop = near shore of the lake
const N = 8;
const MARGIN = 40;
const CH_W = 104; // channel width
const GAP = (W - 2 * MARGIN - N * CH_W) / (N + 1); // land strip width between channels

const channelX = (i: number) => MARGIN + GAP + i * (CH_W + GAP);
// Land strip i lies left of channel i (strip N is right of the last channel).
const stripCenter = (i: number) => MARGIN + GAP / 2 + i * (CH_W + GAP);

const TROLLS = [
  { n: 1, y: 905 },
  { n: 2, y: 760 },
  { n: 3, y: 930 },
  { n: 4, y: 800 },
  { n: 5, y: 900 },
  { n: 6, y: 640 },
  { n: 7, y: 880 },
  { n: 8, y: 760 },
];
const TROLL_SIZE = 150;

// A bridge runs from strip `from` to strip `to` at height y, landing beside troll `to` (its keeper).
const BRIDGES = [
  { from: 1, to: 5, y: 640 },
  { from: 4, to: 7, y: 860 },
];

function boatsFor(i: number) {
  // Deterministic spread: 3 boats per channel, staggered, slightly different speeds.
  return [0, 1, 2].map((k) => ({
    key: `${i}-${k}`,
    delay: -((i * 1.7 + k * 4.1) % 12),
    dur: 11 + ((i * 3 + k) % 4),
  }));
}

export default function StreamsScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      role="img"
      aria-label="Eight parallel streams flowing out of a lake, each kept by its own troll on the bank. Coin boats drift down every stream at the same time. A coin crosses one bridge from one stream to another, and the troll at the far end eats it."
    >
      <defs>
        <pattern id="water" width="512" height="512" patternUnits="userSpaceOnUse">
          <image href="/art/scene/water-tile-m.webp" width="512" height="512" />
          <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="0 512" dur="14s" repeatCount="indefinite" />
        </pattern>
        <pattern id="grass" width="420" height="420" patternUnits="userSpaceOnUse">
          <image href="/art/scene/grass-tile-m.webp" width="420" height="420" />
        </pattern>
        <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3ead6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#f3ead6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Land below the lake */}
      <rect x="0" y={LAKE_Y} width={W} height={H - LAKE_Y} fill="url(#grass)" />

      {/* Channels: water from the lake shore to the bottom edge, inked banks on both sides */}
      {Array.from({ length: N }, (_, i) => (
        <g key={i}>
          <rect x={channelX(i)} y={LAKE_Y - 6} width={CH_W} height={H - LAKE_Y + 6} fill="url(#water)" />
          <line x1={channelX(i)} y1={LAKE_Y} x2={channelX(i)} y2={H} stroke="#3b2a20" strokeOpacity="0.55" strokeWidth="3" />
          <line x1={channelX(i) + CH_W} y1={LAKE_Y} x2={channelX(i) + CH_W} y2={H} stroke="#3b2a20" strokeOpacity="0.55" strokeWidth="3" />
        </g>
      ))}

      {/* Backdrop: sky, hills, and the lake the channels flow out of */}
      <image href="/art/scene/backdrop.webp" x="0" y="0" width={W} height={LAKE_Y} preserveAspectRatio="xMidYMax slice" />

      {/* Boats: each stays inside its own channel, all moving at once */}
      {Array.from({ length: N }, (_, i) =>
        boatsFor(i).map((b) => (
          <g key={b.key} transform={`translate(${channelX(i) + CH_W / 2} 0)`}>
            <image
              href="/art/scene/boat.webp"
              x={-22}
              y={LAKE_Y - 60}
              width={44}
              height={98}
              className="st-boat"
              style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}
            />
          </g>
        )),
      )}

      {/* Bridges: strip to strip, over the channels in between */}
      {BRIDGES.map((br) => {
        const x1 = stripCenter(br.from) - 6;
        const x2 = stripCenter(br.to) + 6;
        return (
          <g key={`${br.from}-${br.to}`}>
            <image href="/art/scene/bridge.webp" x={x1} y={br.y - 55} width={x2 - x1} height={110} preserveAspectRatio="none" />
            {/* The toll: one coin crosses and lands in the keeper troll's mouth */}
            <circle r="9" fill="#e0ad38" stroke="#3b2a20" strokeWidth="2" className="st-coin">
              <animateMotion dur="5s" repeatCount="indefinite" path={`M${x1 + 30} ${br.y} L${x2 - 10} ${br.y}`} keyPoints="0;1;1" keyTimes="0;0.7;1" calcMode="linear" />
              <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.7;0.75;1" dur="5s" repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}

      {/* Trolls: on land only, beside their own channel */}
      {TROLLS.map((t, i) => {
        const strip = i; // troll i keeps channel i and sits on the strip to its left
        const landing = BRIDGES.find((b) => b.to === strip);
        const y = landing ? landing.y - TROLL_SIZE * 0.55 : t.y - TROLL_SIZE;
        return (
          <image
            key={t.n}
            href={`/art/trolls/troll-${t.n}.webp`}
            x={stripCenter(strip) - TROLL_SIZE / 2}
            y={y}
            width={TROLL_SIZE}
            height={TROLL_SIZE}
            className={landing ? "st-chew" : undefined}
          />
        );
      })}

      {/* Shore: a soft bank where the lake meets the land, channels pass through it */}
      <rect x="0" y={LAKE_Y - 8} width={W} height="26" fill="#c9b48e" opacity="0.55" />
      {Array.from({ length: N }, (_, i) => (
        <rect key={i} x={channelX(i)} y={LAKE_Y - 10} width={CH_W} height="30" fill="url(#water)" />
      ))}
      <rect x="0" y={LAKE_Y - 70} width={W} height="80" fill="url(#mist)" opacity="0.6" />
    </svg>
  );
}

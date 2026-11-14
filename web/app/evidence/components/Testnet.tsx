"use client";

import { useEffect, useState } from "react";
import { LOCALNET, TESTNET_FINAL, fmtNear, fmtTokens, getJSON, short } from "./data";
import { Account, Big, Facts, Note, Panel, Tx, Verdict } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any -- these records are plain JSON written by the test scripts */
type J = any;

const EARLIER = [
  { title: "Run 1, first build", file: "/measurements/testnet-2026-11-14/k-tests.json", note: "K7, K2 and K3 on the first testnet deployment (token TROLL)." },
  { title: "Run 2, settlement fixes", file: "/measurements/testnet-2026-11-14-rerun/k-tests.json", note: "Rerun with the transfer-and-call message limit and the settlement gas floor." },
  { title: "Feeding, stopped early", file: "/measurements/testnet-2026-11-14-feeding/feeding.json", note: "Set-up and the first feeding round only; testnet work paused for audits." },
];

const ev = (step: J, name: string) => (step?.events ?? []).filter((e: J) => e.event === name).map((e: J) => e.data?.[0] ?? e.data);

function Step({ title, ok, children }: { title: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="border-[3px] border-ink-0 bg-paper p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="font-display text-xl text-ink-0">{title}</h4>
        {ok !== undefined && <Verdict ok={ok}>{ok ? "checks pass" : "check failed"}</Verdict>}
      </div>
      <div className="mt-3 space-y-2 text-sm text-ink-1">{children}</div>
    </li>
  );
}

export function Testnet() {
  const [k, setK] = useState<J>(null);
  const [f, setF] = useState<J>(null);
  const [kit, setKit] = useState<J>(null);
  const [kitDep, setKitDep] = useState<J>(null);
  const [reh, setReh] = useState<J>(null);
  const [earlier, setEarlier] = useState<(J | null)[]>([]);

  useEffect(() => {
    getJSON(`${TESTNET_FINAL}/k-tests.json`).then(setK);
    getJSON(`${TESTNET_FINAL}/feeding.json`).then(setF);
    getJSON(`${TESTNET_FINAL}/kit-k7.json`).then(setKit);
    getJSON(`${TESTNET_FINAL}/kit-deploy.json`).then(setKitDep);
    getJSON(`${LOCALNET}/rehearsal-final-summary.json`).then(setReh);
    Promise.all(EARLIER.map((e) => getJSON(e.file))).then(setEarlier);
  }, []);

  if (!k || !f) return <p className="py-24 text-center text-sm text-ink-2">Loading the testnet record…</p>;

  const hashes = new Set<string>(k.k7.trolls.map((t: J) => t.global_contract_hash));
  const shards = new Set<number>(k.k7.trolls.map((t: J) => t.shard));
  const k7ok = hashes.size === 1 && k.k7.trolls.length === 8 && shards.size === 8;
  const conservedK3 = k.k3.cases.every((c: J) => c.conserved_before && c.conserved_after && c.in_flight_after === "0");
  const below = k.settle?.attempts?.[0];
  const p = f.params;
  const S0 = f.S0, S1 = f.S1, C0 = f.C0, E0 = f.E0, E1 = f.E1;
  const settled0 = ev(S0, "feeding_settled")[0];
  const settled1 = ev(S1, "feeding_settled")[0];
  const starved = ev(S1, "troll_starved")[0];
  const fromFood = ev(S0, "reward_from_food").reduce((a: bigint, d: J) => a + BigInt(d.amount), BigInt(0));
  const fromPool = ev(S0, "reward_from_launch_pool").reduce((a: bigint, d: J) => a + BigInt(d.amount), BigInt(0));
  const burned7 = BigInt(S1.after.trolls[7].burned) - BigInt(S1.before.trolls[7].burned);
  const kitCost = kit ? Number(kit.parent_spent_near) + kit.parent_storage_bytes * 1e-5 : null;

  return (
    <div className="space-y-8">
      <Note>
        Real NEAR testnet, 2026-11-14, on the final contract build. A few dozen transactions, not a load test: throughput numbers on this page come from the localnet. This deployment uses{" "}
        <strong className="text-ink-0">demo parameters</strong> so the Feeding plays out in minutes: {p.feed_target} feeder per troll, {p.epoch_ms / 60000}-minute epochs (launch values: 10
        feeders, 1-day epochs).
      </Note>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Panel title={`${f.metadata.symbol} · ${f.metadata.name}`}>
          <Facts
            rows={[
              ["Root", <Account key="r" id={k.root} />],
              ["Troll code", <span key="c" className="font-mono text-xs">sha256 {short(k.troll_code_hash, 16)}</span>],
              ["Global code hash", <span key="g" className="break-all font-mono text-xs">{[...hashes].join(", ")}</span>],
              ["Deploy cost", `${Number(k.k7.parent_spent_near).toFixed(2)} testnet NEAR (code published once + 8 troll accounts)`],
              ["Settle bounty", `${fmtNear(p.settle_bounty)} NEAR, from claim fees`],
            ]}
          />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-2">
                <th className="py-1 font-normal">Troll</th>
                <th className="py-1 font-normal">Shard</th>
              </tr>
            </thead>
            <tbody>
              {k.k7.trolls.map((t: J) => (
                <tr key={t.account} className="border-b border-hairline last:border-0">
                  <td className="py-1"><Account id={t.account} /></td>
                  <td className="py-1 tabular-nums text-ink-0">{t.shard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="space-y-5">
          <Panel tag="K7" title="One code for eight trolls">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-ink-1">Published once as a global contract; all eight trolls use it, each on its own shard.</p>
              <Verdict ok={k7ok} />
            </div>
          </Panel>
          <Panel tag="K2" title="Fan-out">
            <ul className="space-y-1.5 text-sm">
              {k.k2.fires.map((x: J) => (
                <li key={x.label} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink-0">
                    {x.label}: {x.transfers_executed ?? x.ft_transfer_events} of {x.n} transfers{x.tolls ? ` (${x.tolls} cross-troll)` : ""}, {x.failed_receipts} failed
                  </span>
                  <span className="flex items-center gap-2"><Tx hash={x.hash} /><Verdict ok={x.pass} /></span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Settlement gas floor">
            <ul className="space-y-1.5 text-sm text-ink-1">
              {below && (
                <li className="flex flex-wrap items-center justify-between gap-2">
                  <span>{below.gas_tgas} Tgas: {below.outcome}</span>
                  <span className="flex items-center gap-2"><Tx hash={below.hash} /><Verdict ok={below.pass} /></span>
                </li>
              )}
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span>250 Tgas: settled (step S0 below)</span>
                <span className="flex items-center gap-2"><Tx hash={S0.hash} /><Verdict ok={S0.failed_receipts === 0} /></span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel tag="K3" title="Conservation and refunds">
        <p className="mb-3 text-sm text-ink-1">
          Σ over the eight trolls of (supply + in flight + burned − minted) equals the total supply before and after every transaction:{" "}
          <strong className="text-ink-0">{conservedK3 ? "yes, every time" : "no"}</strong>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-2">
                <th className="py-1.5 font-normal">Case</th>
                <th className="py-1.5 font-normal">Expected</th>
                <th className="py-1.5 text-right font-normal">Sender change</th>
                <th className="py-1.5 text-right font-normal">Tx</th>
              </tr>
            </thead>
            <tbody>
              {k.k3.cases.map((c: J) => (
                <tr key={c.hash} className="border-b border-hairline align-top last:border-0">
                  <td className="py-2 pr-3 text-ink-0">{c.label}</td>
                  <td className="py-2 pr-3 text-ink-1">
                    {c.expect}
                    {c.msg_bytes > 4096 && c.errors?.[0] && <span className="block text-xs text-ink-2">{c.errors[0]}</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-ink-0">{fmtTokens(c.sender_delta)} STRL</td>
                  <td className="py-2 pl-4 text-right"><Tx hash={c.hash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div>
        <h3 className="font-display text-3xl text-ink-0">Eight trolls fed, then one goes hungry</h3>
        <p className="mt-2 max-w-3xl text-sm text-ink-1">
          After every step: books conserved, nothing left in flight, each troll&apos;s supply change equals the mints and burns it logged, and after each settlement the root agrees with all
          eight trolls.
        </p>
        <ol className="mt-5 grid gap-4 lg:grid-cols-2">
          <Step title="Every troll gets a feeder" ok={E0.assertions?.ok}>
            <p>Eight feeders each send 100 STRL to the next troll, so every transfer crosses a stream and pays the toll; the toll becomes that troll&apos;s food.</p>
            <p className="tabular-nums text-ink-0">Food per troll: {E0.after.trolls.map((t: J) => fmtTokens(t.food)).join(" · ")} STRL</p>
            <p className="flex flex-wrap gap-2">{E0.txs.map((t: J) => <Tx key={t.hash} hash={t.hash} />)}</p>
          </Step>
          <Step title="Settled: all fed, streak 1" ok={S0.assertions?.ok && S0.failed_receipts === 0}>
            <p>
              <strong className="text-ink-0">{settled0?.fed ? "All eight trolls fed" : "Not all trolls fed"}</strong> · streak {S0.after.root.streak}. Rewards came from food first ({fmtTokens(fromFood)} STRL), then from the
              launch pool ({fmtTokens(fromPool)} STRL); nothing newly minted.
            </p>
            <p>
              The settler earned the bounty: {S0.bounty_yocto ? fmtNear(S0.bounty_yocto) : "0"} NEAR, net +{fmtNear(S0.settler_delta_yocto)} NEAR after {fmtNear(S0.gas_burnt_yocto)} NEAR of gas.
            </p>
            <p><Tx hash={S0.hash} /></p>
          </Step>
          <Step title="Feeders claim their share" ok={C0.assertions?.ok}>
            <p className="tabular-nums text-ink-0">{C0.txs.map((t: J) => fmtTokens(t.share)).join(" · ")} STRL</p>
            <p className="text-xs text-ink-2">
              Troll 0 had three feeders in that epoch (the fan-out and conservation checks also sent from it), so its share is split three ways.
            </p>
          </Step>
          <Step title="Seven trolls fed, one skipped" ok={E1.assertions?.ok}>
            <p className="tabular-nums text-ink-0">Feeders per troll: {E1.after.trolls.map((t: J) => t.senders_this_epoch).join(" · ")}</p>
          </Step>
          <Step title="One troll starves: burn, streak resets" ok={S1.assertions?.ok && S1.failed_receipts === 0}>
            <p>
              <span className="text-ink-0">{starved?.troll}</span> had {starved?.senders} feeders; it burned{" "}
              <strong className="text-starve">{fmtTokens(burned7)} STRL</strong> (1% of its hoard). {settled1?.fed ? "All fed" : "Not all trolls fed"}, so the streak resets to {S1.after.root.streak}.
            </p>
            <p><Tx hash={S1.hash} /></p>
          </Step>
        </ol>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="A second token on the same code">
          {kit && kitDep ? (
            <>
              <Big value={kitCost!.toFixed(2)} unit="testnet NEAR per extra token" />
              <p className="mt-3 text-sm text-ink-1">
                KIT reuses the published troll code by its hash, so no code is paid for again: {Number(kit.parent_spent_near).toFixed(2)} NEAR spent (eight troll accounts at{" "}
                {kit.troll_near_each} NEAR, gas) plus {(kit.parent_storage_bytes * 1e-5).toFixed(2)} NEAR held for the root&apos;s storage.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <Account id={kitDep.root} />
                <Verdict ok={new Set(kit.trolls.map((t: J) => t.global_contract_hash)).size === 1 && kit.trolls[0].global_contract_hash === [...hashes][0]}>same code</Verdict>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-2">Loading…</p>
          )}
        </Panel>
        <Panel title="Rehearsed twice on a local network">
          {reh ? (
            <>
              <Big value={reh.passes.map((x: J) => `${x.passed}/${x.total}`).join(" · ")} unit="checks passed, two clean runs" />
              <p className="mt-3 text-sm text-ink-1">
                Every deployment path on a single-node local network with mainnet&apos;s shard layout, including failure drills: a stuck settlement, an RPC failure mid-deploy, an underfunded
                deployer, a mismatched code hash, and the claim deadline.
              </p>
              <a className="mt-3 inline-block text-sm text-teal-deep underline" href={`${LOCALNET}/rehearsal-final-summary.json`}>
                rehearsal-final-summary.json
              </a>
            </>
          ) : (
            <p className="text-sm text-ink-2">Loading…</p>
          )}
        </Panel>
      </div>

      <div>
        <h3 className="font-display text-2xl text-ink-0">Earlier testnet runs</h3>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {EARLIER.map((e, j) => (
            <li key={e.file} className="border-[3px] border-ink-0 bg-paper p-4 text-sm">
              <p className="font-semibold text-ink-0">{e.title}</p>
              <p className="mt-1 text-ink-1">{e.note}</p>
              {earlier[j] && (
                <p className="mt-2 text-xs text-ink-2">
                  Root <Account id={earlier[j].root} />
                  {earlier[j].troll_code_hash && <> · code {short(earlier[j].troll_code_hash, 8)}</>}
                </p>
              )}
              <a href={e.file} className="mt-2 inline-block text-xs text-teal-deep underline">
                raw record
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-2">
        Raw records: <a className="underline" href={`${TESTNET_FINAL}/k-tests.json`}>k-tests.json</a> · <a className="underline" href={`${TESTNET_FINAL}/feeding.json`}>feeding.json</a> ·{" "}
        <a className="underline" href={`${TESTNET_FINAL}/kit-k7.json`}>kit-k7.json</a>
      </p>
    </div>
  );
}

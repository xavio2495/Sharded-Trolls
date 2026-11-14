#!/usr/bin/env bash
# One clean rehearsal pass of every deployment path on the local network with mainnet's shard
# layout: K checks (full deploy), a second token on the same global code, the Feeding demo,
# and failure drills (stuck settlement, RPC 429 mid-deploy then resume, underfunded parent).
# Strictly sequential. Results: measurements/localnet-<date>/rehearsal-<pass>-*.json.
# Usage: scripts/rehearse-localnet.sh <pass number>
set -euo pipefail
PASS=${1:?pass number}
cd "$(dirname "$0")/.."
N="node --dns-result-order=ipv4first --max-old-space-size=2048"
K="$N scripts/testnet-k.mjs --network localnet"
OUT=measurements/localnet-$(date -u +%F)
LOGS=${REHEARSAL_LOGS:-$HOME/.cache/st-logs/rehearsal-$PASS}
mkdir -p "$OUT" "$LOGS"
step() { echo "== $(date -u +%T) $*"; }
fail() { echo "REHEARSAL FAILED: $*"; $N scripts/localnet.mjs stop || true; exit 1; }

step "fresh localnet"
rm -rf target/rehearsal
$N scripts/localnet.mjs start > "$LOGS/localnet.log" 2>&1 || fail "localnet start"
sleep 6

# ---------- 1. K checks on a full deploy (publishes the global code) ----------
P="--parent ka.sandbox"
step "K: parent, deploy, k7, setup, k2, k3"
$K parent $P --parent-near 40 --send > "$LOGS/k-parent.log" 2>&1 || fail "k parent"
$K deploy $P --troll-near 0.2 --epoch-ms 120000 --send > "$LOGS/k-deploy.log" 2>&1 || fail "k deploy"
$K k7 $P --troll-near 0.2 --parent-near 40 > "$LOGS/k-k7.log" 2>&1 || fail "k7"
$K setup $P --send > "$LOGS/k-setup.log" 2>&1 || fail "k setup"
$K k2 $P --send > "$LOGS/k-k2.log" 2>&1 || fail "k2"
$K k3 $P --send > "$LOGS/k-k3.log" 2>&1 || fail "k3"
HASH=$(node -e "const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+require('./target/rehearsal/ka.sandbox/deploy.json').troll_code_hash),s='';while(n>0n){s=A[Number(n%58n)]+s;n/=58n}console.log(s)")
echo "global hash $HASH"

# ---------- 2. A second token on the same code ----------
step "KIT on --global-hash"
P2="--parent kit.sandbox"
$K parent $P2 --parent-near 5 --send > "$LOGS/kit-parent.log" 2>&1 || fail "kit parent"
$K deploy $P2 --troll-near 0.2 --global-hash "$HASH" --symbol KIT --name "Kit Trolls" --label kit --send > "$LOGS/kit-deploy.log" 2>&1 || fail "kit deploy"
$K k7 $P2 --troll-near 0.2 --parent-near 5 > "$LOGS/kit-k7.log" 2>&1 || fail "kit k7"

# ---------- 3. The Feeding with demo params ----------
step "Feeding: deploy, feeders, E0"
P3="--parent fd.sandbox"
$K parent $P3 --parent-near 8 --send > "$LOGS/fd-parent.log" 2>&1 || fail "fd parent"
$K deploy $P3 --troll-near 0.2 --global-hash "$HASH" --epoch-ms 240000 --feed-target 1 --label demo --send > "$LOGS/fd-deploy.log" 2>&1 || fail "fd deploy"
$K feeders $P3 --send > "$LOGS/fd-feeders.log" 2>&1 || fail "feeders"
$K feed $P3 --tag E0 --send > "$LOGS/fd-E0.log" 2>&1 || fail "E0"
step "Feeding: S0 (waits for epoch 0), C0, E1"
$K settle-at $P3 --epoch 0 --wait --send > "$LOGS/fd-S0.log" 2>&1 || fail "S0"
$K claim-rewards $P3 --epoch 0 --send > "$LOGS/fd-C0.log" 2>&1 || fail "C0"
$K feed $P3 --tag E1 --skip 7 --send > "$LOGS/fd-E1.log" 2>&1 || fail "E1"
step "Feeding: S1 (waits for epoch 1)"
$K settle-at $P3 --epoch 1 --wait --send > "$LOGS/fd-S1.log" 2>&1 || fail "S1"
$K feeding-report $P3 --report-dir "target/rehearsal/out" > "$LOGS/fd-report.log" 2>&1 || fail "feeding report"

# ---------- 4. Settle on the K deployment: 249 refused, 250 settles (epoch 0) ----------
step "K settle 249/250"
$K settle $P --wait --send > "$LOGS/k-settle.log" 2>&1 || fail "k settle"

# ---------- 5. Drill: stuck settlement, timeout, re-settle ----------
# near-sandbox 2.14.1 with this 10-shard layout applies sandbox_patch_state only on the first shard
# (shard 10), so the drill uses a small deployment whose root (0st.sandbox) lives there.
step "drill: settle timeout"
P6="--parent 0st.sandbox"
$K parent $P6 --parent-near 5 --send > "$LOGS/st-parent.log" 2>&1 || fail "drill parent"
$K deploy $P6 --troll-near 0.2 --global-hash "$HASH" --epoch-ms 30000 --send > "$LOGS/st-deploy.log" 2>&1 || fail "drill deploy"
while ! $N -e "fetch('http://127.0.0.1:3040',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'query',params:{request_type:'call_function',finality:'final',account_id:'0st.sandbox',method_name:'info',args_base64:'e30='}})}).then(r=>r.json()).then(j=>{const i=JSON.parse(Buffer.from(j.result.result));process.exit(i.current_epoch>i.next_epoch?0:1)})"; do sleep 5; done
$K drill-settle-timeout $P6 --send > "$LOGS/drill-settle.log" 2>&1 || fail "settle drill"

# ---------- 6. Drill: RPC 429 at the 7th send of a full deploy, then resume ----------
step "drill: 429 mid-deploy + resume"
P4="--parent dr.sandbox"
$K parent $P4 --parent-near 30 --send > "$LOGS/dr-parent.log" 2>&1 || fail "dr parent"
$N scripts/lib/fault-proxy.mjs --port 3045 --fail-send-at 7 --mode 429 > "$LOGS/dr-proxy.log" 2>&1 &
PROXY=$!
sleep 1
if $K deploy $P4 --troll-near 0.2 --epoch-ms 120000 --rpc http://127.0.0.1:3045 --send > "$LOGS/dr-deploy.log" 2>&1; then kill $PROXY; fail "deploy through the fault proxy should have failed"; fi
kill $PROXY
grep -q "Rate limits exceeded (injected" "$LOGS/dr-deploy.log" || fail "the deploy failed for another reason"
ROOT_TX=$(grep -m2 "  tx " "$LOGS/dr-deploy.log" | tail -1 | awk '{print $2}')
TROLL_TX=$(grep -m3 "  tx " "$LOGS/dr-deploy.log" | tail -1 | awk '{print $2}')
$K resume-deploy $P4 --troll-near 0.2 --root-tx "$ROOT_TX" --troll-tx "$TROLL_TX" --send > "$LOGS/dr-resume.log" 2>&1 || fail "resume-deploy"
$K k7 $P4 --troll-near 0.2 --parent-near 30 > "$LOGS/dr-k7.log" 2>&1 || fail "dr k7"

# ---------- 7. Drill: underfunded parent ----------
step "drill: underfunded parent"
P5="--parent un.sandbox"
$K parent $P5 --parent-near 1 --send > "$LOGS/un-parent.log" 2>&1 || fail "un parent"
if $K deploy $P5 --troll-near 0.2 --send > "$LOGS/un-deploy.log" 2>&1; then fail "underfunded deploy should have been refused"; fi
grep -q "nothing was sent" "$LOGS/un-deploy.log" || fail "underfunded deploy failed for another reason"
step "drill: --global-hash that is not the local troll.wasm"
if $K deploy $P5 --troll-near 0.2 --global-hash 11111111111111111111111111111112 --send > "$LOGS/mismatch-deploy.log" 2>&1; then fail "hash mismatch should have been refused"; fi
grep -q "differs from --global-hash" "$LOGS/mismatch-deploy.log" || fail "mismatch deploy failed for another reason"

# ---------- results ----------
step "report"
$K report $P --report-dir target/rehearsal/out > "$LOGS/k-report.log" 2>&1 || fail "k report"
$N scripts/rehearsal-summary.mjs "$PASS" "$LOGS" "$OUT" || fail "summary"
$N scripts/localnet.mjs stop
step "pass $PASS done"

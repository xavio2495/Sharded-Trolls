#!/usr/bin/env bash
# Tops up a testnet account from the NEAR docs faucet, 5 NEAR per draw, until it holds TARGET NEAR
# or the faucet rate-limits this IP. Usage: scripts/faucet-topup.sh [account=strl.testnet] [target=100]
set -euo pipefail
cd "$(dirname "$0")/.."
ACCOUNT="${1:-strl.testnet}"
TARGET="${2:-100}"
RPC="https://rpc.testnet.fastnear.com"
NODE="node --dns-result-order=ipv4first"

balance() {
  curl -s -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$ACCOUNT\"}}" |
    $NODE -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(String(BigInt(JSON.parse(s).result.amount)/10n**24n)))'
}

while :; do
  b="$(balance)"
  echo "$ACCOUNT: $b NEAR (target $TARGET)"
  if [ "$b" -ge "$TARGET" ]; then echo "target reached"; break; fi
  if ! $NODE scripts/faucet-once.mjs "$ACCOUNT"; then echo "stopped: faucet refused or failed (see above)"; break; fi
  sleep 5
done

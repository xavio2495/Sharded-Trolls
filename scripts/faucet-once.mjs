// One draw from the NEAR docs testnet faucet for a beneficiary: the faucet helper creates a temporary
// account, which sends 5 NEAR and is then deleted back to the faucet. Exits 2 when rate-limited.
// Run: node scripts/faucet-once.mjs <account.testnet>
import { Near, Account, KeyPair, action } from './lib/near.mjs';
const BENEFICIARY = process.argv[2] || 'strl.testnet';
const kp = KeyPair.random();
const deleteAccount = (b) => ({ write: (w) => w.u8(7).str(b) });
const id = `docs-${[...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')}.testnet`;
const r = await fetch('https://helper.testnet.near.org/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.publicKeyString }) });
if (!r.ok) { console.log('helper', r.status, (await r.text()).slice(0, 200)); process.exit(2); }
const near = new Near('https://rpc.testnet.fastnear.com');
for (let i = 0; i < 20; i++) { try { await near.rpc('query', { request_type: 'view_access_key', finality: 'optimistic', account_id: id, public_key: kp.publicKeyString }); break; } catch { await new Promise((s) => setTimeout(s, 1000)); } }
const acc = new Account(near, id, kp);
const s1 = await acc.sign(BENEFICIARY, [action.transfer(5n * 10n ** 24n)]);
console.log('send 5 NEAR tx', s1.hash);
const o1 = await near.sendSigned(s1, 'FINAL');
console.log('status', JSON.stringify(o1.status).slice(0, 80));
const s2 = await acc.sign(id, [deleteAccount('v2d.faucet.nonofficial.testnet')]);
if (s2) { try { const o2 = await near.sendSigned(s2, 'FINAL'); console.log('cleanup', JSON.stringify(o2.status).slice(0, 60)); } catch (e) { console.log('cleanup failed', e.message.slice(0, 100)); } }

// Seed phrase -> ed25519 key, as NEAR wallets derive it: BIP39 seed (PBKDF2-HMAC-SHA512, 2048
// rounds, salt "mnemonic"), then SLIP-0010 ed25519 hardened derivation along m/44'/397'/0'.
import { createHmac, pbkdf2Sync } from 'node:crypto';
import { KeyPair } from './near.mjs';

export const NEAR_PATH = [44, 397, 0];

export function keyPairFromSeedPhrase(phrase, path = NEAR_PATH, passphrase = '') {
  const words = phrase.trim().split(/\s+/).join(' ').normalize('NFKD');
  const seed = pbkdf2Sync(words, `mnemonic${passphrase}`.normalize('NFKD'), 2048, 64, 'sha512');
  let I = createHmac('sha512', 'ed25519 seed').update(seed).digest();
  for (const index of path) {
    const data = Buffer.alloc(37);
    I.copy(data, 1, 0, 32);
    data.writeUInt32BE((index | 0x80000000) >>> 0, 33);
    I = createHmac('sha512', I.subarray(32)).update(data).digest();
  }
  return new KeyPair(I.subarray(0, 32));
}

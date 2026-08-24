import { randomInt } from "node:crypto";

// No 0/O or 1/I — these get read aloud and typed in by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function inviteCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

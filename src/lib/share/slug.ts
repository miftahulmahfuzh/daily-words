import 'server-only'
import { randomBytes } from 'node:crypto'
import {
  SHARE_SLUG_ALPHABET,
  SHARE_SLUG_BYTES,
  SHARE_SLUG_LENGTH,
} from '@/lib/share/policy'

/**
 * The capability itself. Separate from `policy.ts` for one reason: `node:crypto`
 * must never reach a client bundle, and the Share button imports the policy.
 *
 * `randomBytes`, never `Math.random()`. No timestamp prefix, no user-derived
 * component, no checksum — anything structured shrinks the search space and
 * leaks metadata about when or by whom the share was made.
 *
 * Ten bytes is eighty bits is exactly sixteen base32 characters, so this loop
 * reads five bits at a time out of a bit accumulator and never takes a modulo.
 * A `% 32` over bytes would be unbiased by luck (256 is a multiple of 32) but
 * would stop being so the moment the alphabet changed length, and the bug it
 * would leave — a slightly non-uniform slug — is invisible in every sample a
 * human would look at.
 */
export function newShareSlug(): string {
  const bytes = randomBytes(SHARE_SLUG_BYTES)

  let out = ''
  let acc = 0
  let bits = 0

  for (const byte of bytes) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += SHARE_SLUG_ALPHABET[(acc >> bits) & 31]
    }
  }

  // Exact by construction: 10 bytes is 80 bits is 16 five-bit groups with no
  // remainder. Asserted rather than assumed, because a future change to either
  // constant that broke the identity would otherwise produce short slugs.
  if (out.length !== SHARE_SLUG_LENGTH || bits !== 0) {
    throw new Error(
      `share slug arithmetic broken: ${SHARE_SLUG_BYTES} bytes gave ${out.length} chars`,
    )
  }
  return out
}

/**
 * Hidden SN → PIN lookup for Ecovacs support flows.
 *
 * Ported from the reference Python (`sn_to_pin`): the PIN is derived from
 * the serial number alone, so the agent can verify a caller without any
 * external tool — press-and-hold the Serial Number field to see it.
 *
 *   lastTwo = SN[-2:]                      → PIN suffix
 *   fourth  = SN[3]                        → PIN prefix:
 *     digit  → '0' + digit                          (00–09)
 *     letter → alphabet index + 9 (A=1 → 10 … Z=26 → 35)
 */
export function snToPin(sn) {
    const s = sn.trim();
    // Needs the 4th character (index 3) and a last pair
    if (s.length < 4)
        return null;
    const lastTwo = s.slice(-2);
    const fourth = s[3];
    if (fourth >= '0' && fourth <= '9') {
        return `0${fourth}${lastTwo}`;
    }
    const upper = fourth.toUpperCase();
    if (upper < 'A' || upper > 'Z')
        return null;
    const alphaIndex = upper.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    return `${alphaIndex + 9}${lastTwo}`;
}

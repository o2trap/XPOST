/**
 * Forked from XLISTit src/shared/scrub.ts (used by XLISTit website/lib/log.ts).
 * Removes secrets and personal details from text before it is logged.
 * Covers: card numbers (Luhn-checked), licence keys, emails, phone numbers, UK postcodes, IP addresses, sign-in tokens
 * (JWTs, bearer tokens), usernames and passwords inside links, secret link parameters, and "password: …"-style values.
 * xpost changes: eBay token pattern removed; xpost session cookie added.
 */
const luhn = (digits: string) => {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
};

const SECRET_WORDS = 'password|passwd|secret|token|authorization|cookie|api[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token|licen[cs]e[_-]?key|licenceKey|licenseKey|csrf|cvc|cvv';
const SECRET_PARAMS = 'code|token|access_token|refresh_token|key|api_key|license_key|licence_key|password|sig|signature|secret';

export function scrubSecrets(input: unknown): string {
  return String(input)
    // user:password@ inside links
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@'"]+:[^\s/@'"]+@/gi, '$1[hidden]@')
    // sign-in tokens and xpost's session cookie
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[token]')
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [hidden]')
    .replace(/(__Host-xpost_session=)[^;\s"']+/g, '$1[hidden]')
    // secret values in links: ?code=…, &token=…
    .replace(new RegExp(`([?&#](?:${SECRET_PARAMS})=)[^&\\s"'#]+`, 'gi'), '$1[hidden]')
    // "password: x", "api_key=x", '"token":"x"'
    .replace(new RegExp(`\\b(${SECRET_WORDS})(["']?\\s*[:=]\\s*["']?)[^\\s"',;}]+`, 'gi'), '$1$2[hidden]')
    // licence keys (Lemon Squeezy format) before card numbers and phone numbers
    .replace(/\b[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}\b/gi, '[licence key]')
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) ? '[card number]' : m; })
    .replace(/[^\s@<>"'(),;:[\]/]+@[^\s@<>"'(),;:[\]/]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+44\s?\(?0?\)?\s?\d{2,4}|\b0\d{2,4})[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, '[phone]')
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, '[postcode]')
    .replace(/\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g, '[ip]');
}

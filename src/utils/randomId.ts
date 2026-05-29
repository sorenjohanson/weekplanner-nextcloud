// `crypto.randomUUID()` is gated to secure contexts (HTTPS or localhost). In
// production we ship over HTTPS, so it's always available — if it isn't, that
// is a deployment misconfiguration and we want to surface it. In development
// the docker-compose setup is plain HTTP across the LAN/Tailscale, so we fall
// back to assembling a v4 UUID from `crypto.getRandomValues()` (which has no
// secure-context restriction). We branch on `import.meta.env.MODE` rather
// than `import.meta.env.DEV` because `DEV` is only true for the `vite` dev
// server, not for `vite build --mode development` (which is what `pnpm run
// dev` runs). Vite statically replaces `MODE` at build time, so the fallback
// is tree-shaken out of the production bundle.
export function randomId(): string {
	if (typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	// RFC 4122 UUID v4: 16 random bytes with two reserved fields — the top
	// nibble of byte 6 fixed to 0b0100 (version 4) and the top two bits of
	// byte 8 fixed to 0b10 (RFC 4122 variant). The other 122 bits stay
	// random. This matches what `crypto.randomUUID()` would have returned,
	// so downstream UUID validators don't see different shapes between the
	// dev and prod paths.
	if (import.meta.env.MODE === 'development') {
		const bytes = new Uint8Array(16)
		crypto.getRandomValues(bytes)
		bytes[6] = (bytes[6] & 0x0f) | 0x40
		bytes[8] = (bytes[8] & 0x3f) | 0x80
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
		return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
	}
	throw new Error('crypto.randomUUID is unavailable; this requires a secure context (HTTPS or localhost).')
}

/**
 * SASL PLAIN authentication helper.
 * Returns base64-encoded \0user\0pass string for use in AUTHENTICATE command.
 */
export function saslPlain(user: string, pass: string): string {
	// Format: \0username\0password
	const str = `\0${user}\0${pass}`;
	// Encode to base64
	if (typeof btoa === 'function') {
		// Browser / modern environment
		return btoa(unescape(encodeURIComponent(str)));
	}
	// Node.js fallback
	return Buffer.from(str, 'utf8').toString('base64');
}

/**
 * Chunk base64 string into 400-byte segments for large AUTHENTICATE payloads.
 * (RFC says max 400 bytes per AUTHENTICATE line; send '+' if done, empty if
 * base64 was exactly 400 bytes)
 */
export function saslChunks(b64: string): string[] {
	const chunks: string[] = [];
	let i = 0;
	while (i < b64.length) {
		chunks.push(b64.slice(i, i + 400));
		i += 400;
	}
	// If b64 is exactly a multiple of 400, append empty chunk marker
	if (b64.length > 0 && b64.length % 400 === 0) {
		chunks.push('+');
	}
	if (chunks.length === 0) {
		chunks.push('+');
	}
	return chunks;
}

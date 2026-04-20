// IRCv3 capability negotiation

export const CAP_REQUESTED = [
	'message-tags',
	'server-time',
	'batch',
	'echo-message',
	'account-tag',
	'away-notify',
	'chghost',
	'extended-join',
	'multi-prefix',
	'sasl',
	'setname',
	'userhost-in-names',
	'cap-notify'
] as const;

export type CapName = (typeof CAP_REQUESTED)[number];

/**
 * Given a list of caps advertised by the server, return the subset we want to request.
 */
export function capFromServer(available: string[]): string[] {
	const availableSet = new Set(available.map((c) => c.split('=')[0].trim()));
	return CAP_REQUESTED.filter((cap) => availableSet.has(cap));
}

/**
 * Parse a CAP LS or CAP NEW response value string into a map of cap -> value.
 * e.g. "sasl=PLAIN,EXTERNAL multi-prefix server-time"
 */
export function parseCapList(capStr: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const part of capStr.split(' ')) {
		if (!part) continue;
		const eqIdx = part.indexOf('=');
		if (eqIdx !== -1) {
			result.set(part.slice(0, eqIdx), part.slice(eqIdx + 1));
		} else {
			result.set(part, '');
		}
	}
	return result;
}

import { buffers } from './buffers.svelte.js';

export const COMMANDS = [
	'/away',
	'/back',
	'/ban',
	'/clear',
	'/close',
	'/deop',
	'/devoice',
	'/help',
	'/ignore',
	'/invite',
	'/join',
	'/kick',
	'/list',
	'/me',
	'/mode',
	'/msg',
	'/nick',
	'/notice',
	'/op',
	'/part',
	'/query',
	'/quit',
	'/reconnect',
	'/server',
	'/topic',
	'/unban',
	'/voice',
	'/whois'
] as const;

class CompletionStore {
	active = $state(false);
	candidates = $state<string[]>([]);
	index = $state(0);
	prefix = $state('');
	suffix = $state('');

	private originalWord = '';
	private wordStart = 0;
	private isFirst = false;

	complete(input: string, cursorPos: number, bufferPointer: string | null): string {
		const beforeCursor = input.slice(0, cursorPos);
		const afterCursor = input.slice(cursorPos);

		// Find the word being completed (going backwards from cursor)
		const wordMatch = beforeCursor.match(/(\S+)$/);
		if (!wordMatch) {
			this.reset();
			return input;
		}

		const word = wordMatch[1];
		this.wordStart = beforeCursor.length - word.length;
		this.originalWord = word;
		this.isFirst = this.wordStart === 0;
		this.suffix = afterCursor;

		// Build candidate list
		const lc = word.toLowerCase();
		let newCandidates: string[] = [];

		if (word.startsWith('/')) {
			newCandidates = COMMANDS.filter((c) => c.toLowerCase().startsWith(lc));
		} else if (bufferPointer) {
			const entry = buffers.buffers.get(bufferPointer);
			if (entry) {
				// Nick completion from current buffer
				const nickCandidates: string[] = [];
				for (const [, nick] of entry.nicks) {
					if (!nick.group && nick.name.toLowerCase().startsWith(lc)) {
						nickCandidates.push(nick.name);
					}
				}
				nickCandidates.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

				// Channel names from buffer list
				const chanCandidates: string[] = [];
				if (lc.startsWith('#') || lc.startsWith('&')) {
					for (const e of buffers.buffers.values()) {
						const sn = e.buffer.shortName;
						if (sn && sn.toLowerCase().startsWith(lc)) {
							chanCandidates.push(sn);
						}
					}
					chanCandidates.sort();
				}

				newCandidates = [...nickCandidates, ...chanCandidates];
			}
		}

		if (newCandidates.length === 0) {
			this.reset();
			return input;
		}

		this.candidates = newCandidates;
		this.index = 0;
		this.active = true;
		this.prefix = input.slice(0, this.wordStart);

		return this.buildResult(newCandidates[0], afterCursor);
	}

	cycle(forward: boolean): string {
		if (!this.active || this.candidates.length === 0) return '';

		if (forward) {
			this.index = (this.index + 1) % this.candidates.length;
		} else {
			this.index = (this.index - 1 + this.candidates.length) % this.candidates.length;
		}

		return this.buildResult(this.candidates[this.index], this.suffix);
	}

	reset(): void {
		this.active = false;
		this.candidates = [];
		this.index = 0;
		this.prefix = '';
		this.suffix = '';
		this.originalWord = '';
		this.wordStart = 0;
		this.isFirst = false;
	}

	private buildResult(completion: string, afterCursor: string): string {
		const isNick =
			!completion.startsWith('/') &&
			!completion.startsWith('#') &&
			!completion.startsWith('&') &&
			!completion.startsWith('+');

		let completed: string;
		if (isNick && this.isFirst) {
			// Nick at start of line — append ": " suffix
			completed = `${this.prefix}${completion}: `;
		} else {
			completed = `${this.prefix}${completion} `;
		}

		return completed + afterCursor;
	}
}

export const completion = new CompletionStore();

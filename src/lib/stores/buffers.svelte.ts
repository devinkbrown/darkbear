import type { WeeChatBuffer, WeeChatHotlist, WeeChatLine, WeeChatNick } from '$lib/weechat/types.js';
import { settings } from './settings.svelte.js';

const MAX_LINES = 5000;


export interface TypingEntry {
	state: 'active' | 'paused';
	expiry: number;
}

export interface Reaction {
	emoji: string;
	nicks: string[];
}

export interface BufferEntry {
	buffer: WeeChatBuffer;
	lines: WeeChatLine[];
	nicks: Map<string, WeeChatNick>;
	nickGroups: Map<string, WeeChatNick[]>;
	unread: number;
	highlighted: number;
	lastSeen?: Date;
	loading: boolean;
	// IRCv3
	typing: Map<string, TypingEntry>;      // nick -> {state, expiry}
	reactions: Map<string, Reaction[]>;    // msgid -> reactions
	msgIndex: Map<string, WeeChatLine>;    // msgid -> line (for reply context)
	// Channel modes (e.g. 'V' = video chat enabled)
	modes: Set<string>;
}

function makeEntry(buffer: WeeChatBuffer): BufferEntry {
	return {
		buffer,
		lines: [],
		nicks: new Map(),
		nickGroups: new Map(),
		unread: 0,
		highlighted: 0,
		lastSeen: undefined,
		loading: false,
		typing: new Map(),
		reactions: new Map(),
		msgIndex: new Map(),
		modes: new Set(),
	};
}

// Ordered privilege tiers — checked against nick.prefix.trim()
const PREFIX_TIERS: { chars: Set<string>; label: string }[] = [
	{ chars: new Set(['.', '~', 'q']), label: 'Owner' },
	{ chars: new Set(['&', 'a']),      label: 'Admin' },
	{ chars: new Set(['@', 'o']),      label: 'Op'    },
	{ chars: new Set(['%', 'h']),      label: 'Halfop'},
	{ chars: new Set(['+', 'v']),      label: 'Voice' },
];

function buildNickGroups(nicks: Map<string, WeeChatNick>): Map<string, WeeChatNick[]> {
	const buckets = new Map<string, WeeChatNick[]>();

	for (const nick of nicks.values()) {
		if (nick.group) continue; // skip WeeChat group-node entries
		const p = nick.prefix.trim();
		const tier = PREFIX_TIERS.find(t => t.chars.has(p));
		const label = tier?.label ?? 'Regular';
		let arr = buckets.get(label);
		if (!arr) { arr = []; buckets.set(label, arr); }
		arr.push(nick);
	}

	// Sort nicks within each tier alphabetically
	for (const arr of buckets.values()) {
		arr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
	}

	// Return in privilege order (Owner → Admin → Op → Halfop → Voice → Regular)
	const ordered = new Map<string, WeeChatNick[]>();
	for (const tier of PREFIX_TIERS) {
		const arr = buckets.get(tier.label);
		if (arr?.length) ordered.set(tier.label, arr);
	}
	const regular = buckets.get('Regular');
	if (regular?.length) ordered.set('Regular', regular);
	return ordered;
}

class BufferStore {
	buffers = $state<Map<string, BufferEntry>>(new Map());
	active = $state<string | null>(null);
	pinnedBuffers = $state<Set<string>>(new Set());   // buffer fullName strings
	ignoredNicks  = $state<Set<string>>(new Set());   // nicks to suppress
	mutedBuffers  = $state<Set<string>>(new Set());   // buffer fullNames with suppressed notifications
	readMarkerPos = $state<Map<string, number>>(new Map()); // pointer → line count at last read

	constructor() {
		if (typeof localStorage !== 'undefined') {
			try {
				const p = localStorage.getItem('db-pinned');
				if (p) this.pinnedBuffers = new Set(JSON.parse(p));
				const ig = localStorage.getItem('db-ignored');
				if (ig) this.ignoredNicks = new Set(JSON.parse(ig));
				const mu = localStorage.getItem('db-muted');
				if (mu) this.mutedBuffers = new Set(JSON.parse(mu));
			} catch (_) {}
		}
	}

	toggleMute(pointer: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const name = entry.buffer.fullName || entry.buffer.name;
		const next = new Set(this.mutedBuffers);
		if (next.has(name)) next.delete(name); else next.add(name);
		this.mutedBuffers = next;
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('db-muted', JSON.stringify([...next]));
	}

	isMuted(pointer: string): boolean {
		const entry = this.buffers.get(pointer);
		if (!entry) return false;
		return this.mutedBuffers.has(entry.buffer.fullName || entry.buffer.name);
	}

	togglePin(pointer: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const name = entry.buffer.fullName || entry.buffer.name;
		const next = new Set(this.pinnedBuffers);
		if (next.has(name)) next.delete(name); else next.add(name);
		this.pinnedBuffers = next;
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('db-pinned', JSON.stringify([...next]));
	}

	isPinned(pointer: string): boolean {
		const entry = this.buffers.get(pointer);
		if (!entry) return false;
		return this.pinnedBuffers.has(entry.buffer.fullName || entry.buffer.name);
	}

	addIgnore(nick: string): void {
		const next = new Set(this.ignoredNicks);
		next.add(nick.toLowerCase());
		this.ignoredNicks = next;
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('db-ignored', JSON.stringify([...next]));
	}

	removeIgnore(nick: string): void {
		const next = new Set(this.ignoredNicks);
		next.delete(nick.toLowerCase());
		this.ignoredNicks = next;
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('db-ignored', JSON.stringify([...next]));
	}

	isIgnored(nick: string): boolean {
		return this.ignoredNicks.has(nick.toLowerCase());
	}

	setReadMarker(pointer: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const next = new Map(this.readMarkerPos);
		next.set(pointer, entry.lines.length);
		this.readMarkerPos = next;
	}

	// Next/prev buffer with highlights (wraps around). forward=true → down, false → up
	nextHighlighted(forward = true): string | null {
		const all = this.sorted;
		if (!all.length) return null;
		const cur = all.findIndex(e => e.buffer.id === this.active);
		const step = forward ? 1 : -1;
		for (let i = 1; i <= all.length; i++) {
			const idx = ((cur + step * i) % all.length + all.length) % all.length;
			if (all[idx].highlighted > 0) return all[idx].buffer.id;
		}
		return null;
	}

	sorted = $derived.by(() => {
		const all = Array.from(this.buffers.values()).sort((a, b) => a.buffer.number - b.buffer.number);
		const pinned = all.filter(e => this.isPinned(e.buffer.id));
		const rest   = all.filter(e => !this.isPinned(e.buffer.id));
		return [...pinned, ...rest];
	});

	totalHighlights = $derived.by(() => {
		let total = 0;
		for (const entry of this.buffers.values()) total += entry.highlighted;
		return total;
	});

	totalUnread = $derived.by(() => {
		let total = 0;
		for (const entry of this.buffers.values()) total += entry.unread;
		return total;
	});

	upsertBuffer(b: WeeChatBuffer): void {
		const existing = this.buffers.get(b.id);
		if (existing) {
			this.buffers.set(b.id, { ...existing, buffer: b });
			this.buffers = new Map(this.buffers);
		} else {
			const entry = makeEntry(b);
			this.buffers.set(b.id, entry);
			this.buffers = new Map(this.buffers);
			// Set first buffer as active if nothing is active
			if (this.active === null) {
				this.active = b.id;
			}
		}
	}

	removeBuffer(pointer: string): void {
		this.buffers.delete(pointer);
		this.buffers = new Map(this.buffers);
		if (this.active === pointer) {
			// Switch to first available buffer
			const first = this.buffers.keys().next().value;
			this.active = first ?? null;
		}
	}

	addLine(pointer: string, line: WeeChatLine, prepend = false): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		// Suppress messages from ignored nicks
		if (line.nick && this.ignoredNicks.has(line.nick.toLowerCase())) return;

		const msgIndex = new Map(entry.msgIndex);
		if (line.msgid) msgIndex.set(line.msgid, line);

		// When WeeChat echoes back a confirmed self-message, remove the optimistic
		// placeholder that was added when the user pressed send.
		let base = entry.lines;
		if (line.isSelf && !line.id.startsWith('_opt_')) {
			const optIdx = base.findIndex(
				l => l.id.startsWith('_opt_') && l.message === line.message
			);
			if (optIdx !== -1) {
				base = base.filter((_, i) => i !== optIdx);
			}
		}

		let newLines: WeeChatLine[];
		if (prepend) {
			newLines = [line, ...base];
			if (newLines.length > MAX_LINES) newLines = newLines.slice(0, MAX_LINES);
		} else {
			newLines = [...base, line];
			if (newLines.length > MAX_LINES) newLines = newLines.slice(-MAX_LINES);
		}

		// Apply client-side custom highlight words (case-insensitive whole-word match).
		if (!line.highlight && line.message && settings.highlightWords.length > 0) {
			const lcMsg = line.message.toLowerCase();
			for (const word of settings.highlightWords) {
				const lc = word.trim().toLowerCase();
				if (lc && lcMsg.includes(lc)) {
					line = { ...line, highlight: true };
					break;
				}
			}
		}

		let unread = entry.unread;
		let highlighted = entry.highlighted;
		// Update unread/highlight counts if not the active buffer.
		// Skip optimistic placeholders — they're always in the active buffer.
		if (!prepend && this.active !== pointer && line.displayed && !line.id.startsWith('_opt_')) {
			unread += 1;
			if (line.highlight) highlighted += 1;
		}

		// Create a NEW BufferEntry object so Svelte 5 $derived sees a changed reference.
		// Mutating entry in-place produces the same object ref, which Object.is considers
		// unchanged, short-circuiting all downstream derived/effect chains.
		this.buffers.set(pointer, { ...entry, lines: newLines, msgIndex, unread, highlighted });
		this.buffers = new Map(this.buffers);
	}

	addLines(pointer: string, lines: WeeChatLine[], prepend = false): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;

		// Deduplicate — skip lines already present (protects against bulk + on-demand overlap)
		const existingIds = new Set(entry.lines.map(l => l.id));
		const fresh = lines.filter(l => !existingIds.has(l.id));
		if (fresh.length === 0) {
			this.buffers = new Map(this.buffers);
			return;
		}

		let newLines: WeeChatLine[];
		if (prepend) {
			newLines = [...fresh, ...entry.lines];
			if (newLines.length > MAX_LINES) newLines = newLines.slice(0, MAX_LINES);
		} else {
			newLines = [...entry.lines, ...fresh];
			if (newLines.length > MAX_LINES) newLines = newLines.slice(-MAX_LINES);
		}

		this.buffers.set(pointer, { ...entry, lines: newLines });
		this.buffers = new Map(this.buffers);
	}

	setNicklist(pointer: string, nicks: WeeChatNick[]): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;

		const newNicks = new Map(nicks.map((n) => [n.name, n]));
		this.buffers.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
		this.buffers = new Map(this.buffers);
	}

	addNick(pointer: string, nick: WeeChatNick): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const newNicks = new Map(entry.nicks);
		newNicks.set(nick.name, nick);
		this.buffers.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
		this.buffers = new Map(this.buffers);
	}

	removeNick(pointer: string, nickId: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const newNicks = new Map(entry.nicks);
		// Map is keyed by nick name; nickId is the WeeChat pointer — find by id
		for (const [name, nick] of newNicks) {
			if (nick.id === nickId || nick.name === nickId) {
				newNicks.delete(name);
				break;
			}
		}
		this.buffers.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
		this.buffers = new Map(this.buffers);
	}

	updateNick(pointer: string, oldName: string, newName: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const nick = entry.nicks.get(oldName);
		if (nick) {
			const newNicks = new Map(entry.nicks);
			newNicks.delete(oldName);
			newNicks.set(newName, { ...nick, name: newName });
			this.buffers.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
			this.buffers = new Map(this.buffers);
		}
	}

	setActive(pointer: string): void {
		this.active = pointer;
		this.clearUnread(pointer);
		// Persist so we can restore on next connect
		const entry = this.buffers.get(pointer);
		if (entry && typeof localStorage !== 'undefined') {
			localStorage.setItem('db-last-buffer', entry.buffer.fullName || entry.buffer.name);
		}
	}

	restoreLastBuffer(): void {
		if (typeof localStorage === 'undefined') return;
		const name = localStorage.getItem('db-last-buffer');
		if (!name) return;
		const entry = this.findByName(name);
		if (entry) {
			this.setActive(entry.buffer.id);
		}
	}

	clearUnread(pointer: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		this.buffers.set(pointer, { ...entry, unread: 0, highlighted: 0, lastSeen: new Date() });
		this.buffers = new Map(this.buffers);
	}

	updateHotlist(items: WeeChatHotlist[]): void {
		for (const item of items) {
			const entry = this.buffers.get(item.buffer);
			if (!entry) continue;
			// Don't overwrite counts for the buffer the user is actively reading.
			if (item.buffer === this.active) continue;
			// count: [low, message, private, highlight]
			const messages = item.count[1] + item.count[2];
			const highlights = item.count[3];
			this.buffers.set(item.buffer, { ...entry, unread: messages + highlights, highlighted: highlights });
		}
		this.buffers = new Map(this.buffers);
	}

	findByName(name: string): BufferEntry | undefined {
		for (const entry of this.buffers.values()) {
			if (entry.buffer.name === name || entry.buffer.fullName === name) {
				return entry;
			}
		}
		return undefined;
	}

	findByShortName(name: string): BufferEntry | undefined {
		for (const entry of this.buffers.values()) {
			if (entry.buffer.shortName === name) {
				return entry;
			}
		}
		return undefined;
	}

	setLoading(pointer: string, loading: boolean): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		this.buffers.set(pointer, { ...entry, loading });
		this.buffers = new Map(this.buffers);
	}

	// ── IRCv3: typing indicators ────────────────────────────────────────────────

	setTyping(pointer: string, nick: string, state: 'active' | 'paused' | 'done'): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const typing = new Map(entry.typing);
		if (state === 'done') {
			typing.delete(nick);
		} else {
			// active: 30s (IRCv3 spec); paused: show briefly then expire
			const expiry = state === 'active' ? Date.now() + 30000 : Date.now() + 8000;
			typing.set(nick, { state, expiry });
		}
		this.buffers.set(pointer, { ...entry, typing });
		this.buffers = new Map(this.buffers);
	}

	pruneTyping(pointer: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const now = Date.now();
		const typing = new Map(entry.typing);
		let changed = false;
		for (const [nick, info] of typing) {
			if (info.expiry < now) { typing.delete(nick); changed = true; }
		}
		if (changed) {
			this.buffers.set(pointer, { ...entry, typing });
			this.buffers = new Map(this.buffers);
		}
	}

	// ── IRCv3: reactions ────────────────────────────────────────────────────────

	addReaction(pointer: string, msgid: string, emoji: string, nick: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const reactions = new Map(entry.reactions);
		let list = reactions.get(msgid) ? [...reactions.get(msgid)!] : [];
		let r = list.find(x => x.emoji === emoji);
		if (!r) { r = { emoji, nicks: [] }; list = [...list, r]; }
		if (!r.nicks.includes(nick)) r = { ...r, nicks: [...r.nicks, nick] };
		list = list.map(x => x.emoji === emoji ? r! : x);
		reactions.set(msgid, list);
		this.buffers.set(pointer, { ...entry, reactions });
		this.buffers = new Map(this.buffers);
	}

	// ── Channel modes ───────────────────────────────────────────────────────────
	// Parse a mode change string like "+V" or "+nV-m" and apply to a buffer.
	applyModeChange(pointer: string, modeStr: string): void {
		const entry = this.buffers.get(pointer);
		if (!entry) return;
		const modes = new Set(entry.modes);
		let adding = true;
		for (const ch of modeStr) {
			if (ch === '+') { adding = true; continue; }
			if (ch === '-') { adding = false; continue; }
			if (/[a-zA-Z]/.test(ch)) {
				if (adding) modes.add(ch); else modes.delete(ch);
			}
		}
		this.buffers.set(pointer, { ...entry, modes });
		this.buffers = new Map(this.buffers);
	}

	hasMode(pointer: string, mode: string): boolean {
		return this.buffers.get(pointer)?.modes.has(mode) ?? false;
	}

	clear(): void {
		this.buffers = new Map();
		this.active = null;
	}
}

export const buffers = new BufferStore();

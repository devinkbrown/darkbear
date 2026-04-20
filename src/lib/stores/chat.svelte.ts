import {
	WeeRelayClient,
	type AuthenticatedEvent,
	type BufferClosedEvent,
	type BufferOpenedEvent,
	type BufferRenamedEvent,
	type BufferSwitchedEvent,
	type BuffersLoadedEvent,
	type HistoryLoadedEvent,
	type HotlistUpdatedEvent,
	type LineAddedEvent,
	type NickAddedEvent,
	type NicklistReceivedEvent,
	type NickRemovedEvent,
	type RelayErrorEvent,
	type StateChangedEvent
} from '$lib/weechat/client.js';
import { ConnectionState } from '$lib/weechat/types.js';
import { buffers } from './buffers.svelte.js';
import { settings } from './settings.svelte.js';
import { notify, playSound, updateTitle } from '$lib/utils/notifications.js';
import { video, setVideoSendFn, syncNoVideoProp } from './video.svelte.js';

// Helper to attach a typed CustomEvent listener and return a cleanup fn
function on<T>(
	target: EventTarget,
	name: string,
	handler: (detail: T) => void
): () => void {
	const listener = (ev: Event) => handler((ev as CustomEvent<T>).detail);
	target.addEventListener(name, listener);
	return () => target.removeEventListener(name, listener);
}

class ChatStore {
	client = $state<WeeRelayClient | null>(null);
	connectionState = $state<ConnectionState>(ConnectionState.DISCONNECTED);
	error = $state<string | null>(null);
	lag = $state(0);
	isOper      = $state(false);
	isAdmin     = $state(false);
	operServers = $state(new Set<string>());  // servers where we are oper
	adminServers = $state(new Set<string>()); // servers where we are admin

	private pingInterval: ReturnType<typeof setInterval> | null = null;
	private cleanups: Array<() => void> = [];
	// Nick we're waiting to auto-switch to when its query buffer opens
	private pendingQueryNick: string | null = null;
	private modeQueriedServers = new Set<string>(); // servers where we've sent /mode nick this session

	connect(): void {
		// Tear down any existing client
		this.disconnectClean(false);

		const client = new WeeRelayClient({ ...settings.relay });
		this.client = client;
		this.error = null;

		// Wire up all events
		this.cleanups = [
			on<StateChangedEvent>(client, 'stateChanged', ({ state }) => {
				this.connectionState = state;
				if (state === ConnectionState.CONNECTED) {
					this.error = null;
					this.startPing();
				} else if (state === ConnectionState.RECONNECTING) {
					// Clear stale error so the UI shows "Reconnecting…" not a previous
					// failure message while the reconnect attempt is in flight.
					this.error = null;
					this.stopPing();
				} else if (state === ConnectionState.DISCONNECTED) {
					this.stopPing();
					this.isOper       = false;
				this.isAdmin      = false;
				this.operServers  = new Set();
				this.adminServers = new Set();
				this.modeQueriedServers = new Set();
				}
			}),

			on<RelayErrorEvent>(client, 'error', ({ message }) => {
				this.error = message;
			}),

			on<AuthenticatedEvent>(client, 'authenticated', () => {
				this.error = null;
				// Sync no-video PROP with server to reflect current setting
				setTimeout(() => syncNoVideoProp(settings.enableVideoCalls), 1000);
			}),

			on<BuffersLoadedEvent>(client, 'buffersLoaded', ({ buffers: bufs }) => {
				for (const b of bufs) {
					buffers.upsertBuffer(b);
				}
				// Restore the last active buffer from the previous session
				buffers.restoreLastBuffer();
				// Request deep history for server buffers so we catch the 381
				// (SASL auto-oper fires at login — may be older than the 50-line default).
				// Also actively query own mode on each server — the 221 RPL_UMODEIS
				// response is handled by detectOperFromLine and works regardless of
				// whether the 381 is in the buffer history.
				for (const b of bufs) {
					if (b.localVars['type'] === 'server') {
						client.requestHistory(b.id, 500);
					}
				}
			}),

			on<BufferOpenedEvent>(client, 'bufferOpened', ({ buffer }) => {
				buffers.upsertBuffer(buffer);
				// Load recent history for newly joined channels/PMs
				if (buffer.localVars['type'] !== 'server') {
					client.requestHistory(buffer.id, 100);
				}
				// Auto-switch to a query buffer that the user explicitly opened via openQuery()
				if (buffer.localVars['type'] === 'private' && this.pendingQueryNick) {
					const channel = (buffer.localVars['channel'] ?? '').toLowerCase();
					const short   = (buffer.shortName || buffer.name).toLowerCase();
					if (channel === this.pendingQueryNick || short === this.pendingQueryNick) {
						this.pendingQueryNick = null;
						buffers.setActive(buffer.id);
					}
				}
			}),

			on<BufferSwitchedEvent>(client, 'bufferSwitched', ({ id }) => {
				if (buffers.buffers.has(id)) buffers.setActive(id);
			}),

			on<BufferClosedEvent>(client, 'bufferClosed', ({ id }) => {
				buffers.removeBuffer(id);
			}),

			on<BufferRenamedEvent>(client, 'bufferRenamed', ({ buffer }) => {
				buffers.upsertBuffer(buffer);
			}),

			on<LineAddedEvent>(client, 'lineAdded', ({ line }) => {
				// TAGMSGs are marked displayed=false by WeeChat — handle before the guard
				if (line.isTagMsg) {
					const entry = buffers.buffers.get(line.buffer);
					if (entry) {
						const typingState = line.ircTags.get('+typing');
						if (typingState && line.nick) {
							buffers.setTyping(line.buffer, line.nick,
								typingState as 'active' | 'paused' | 'done');
						}
						const reactEmoji = line.ircTags.get('+react');
						const reactTarget = line.ircTags.get('+reply') ?? line.replyTo;
						if (reactEmoji && reactTarget && line.nick) {
							buffers.addReaction(line.buffer, reactTarget, reactEmoji, line.nick);
						}
					}
					return;
				}

				const entry = buffers.buffers.get(line.buffer);
				if (!entry) return;

				// ── Oper / admin detection ────────────────────────────────────────
				// Must run before the displayed guard — WeeChat may hide 381/221 lines
				// via its filter system, but we still need to detect oper status from them.
				this.detectOperFromLine(line, entry);

				if (!line.displayed) return;

				// ── Channel mode tracking ─────────────────────────────────────────
				// irc_mode tagged lines carry mode changes. We extract the mode string
				// (e.g. "+V" or "+nV") from the message text using a conservative regex.
				if (line.tags.includes('irc_mode')) {
					// Match any sequence of +/-/letters that looks like mode chars
					const modeMatch = line.message.match(/([+-][a-zA-Z]+(?:[+-][a-zA-Z]+)*)/);
					if (modeMatch) {
						buffers.applyModeChange(line.buffer, modeMatch[1]);
					}
				}

				// ── WEBRTC signaling ───────────────────────────────────────────────
				// WeeChat shows unknown IRC commands (like WEBRTC) as raw lines in the
				// server buffer. We parse the message text to extract signaling.
				// Format WeeChat shows: "WEBRTC target TYPE :payload" or similar.
				if (!entry.buffer.localVars['type'] || entry.buffer.localVars['type'] === '') {
					// server buffer line — check for WEBRTC
					const m = line.message.match(/^WEBRTC\s+(\S+)\s+(\S+)(?:\s+:(.*))?$/i)
						?? line.message.match(/^WEBRTC\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
					if (m) {
						const [, target, type, payload = ''] = m;
						const fromNick = line.nick ?? line.prefix ?? '';
						if (fromNick && target && type) {
							video.handleLine(fromNick, target, type.toUpperCase(), payload);
						}
						return; // don't show as chat line
					}
				}

				// Clear typing indicator for this nick on regular message
				if (line.nick) buffers.setTyping(line.buffer, line.nick, 'done');

				buffers.addLine(line.buffer, line);

				// Notification on highlight (skip muted buffers)
				if (line.highlight && settings.notifications && !buffers.isMuted(line.buffer)) {
					const btype = entry.buffer.localVars['type'];
					const bufName = entry.buffer.shortName || entry.buffer.name;
					const title = btype === 'private'
						? `Message from ${bufName}`
						: `Highlight in ${bufName}`;
					// Strip WeeChat color codes for notification text
					const plain = line.message.replace(
						// eslint-disable-next-line no-control-regex
						/[\x02\x03\x0f\x16\x1a\x1b\x1c\x1d\x1f](\d{1,2}(,\d{1,2})?)?|\x19[^]*/g,
						''
					);
					notify(title, plain, undefined, line.buffer);
					if (settings.notificationSound) playSound();
				}

				updateTitle(buffers.totalHighlights, buffers.totalUnread);
			}),

			on<HistoryLoadedEvent>(client, 'historyLoaded', ({ lines }) => {
				if (lines.length === 0) {
					// Empty buffer — clear loading spinner
					if (buffers.active) buffers.setLoading(buffers.active, false);
					return;
				}
				const bufPtr = lines[0].buffer;
				buffers.setLoading(bufPtr, false);
				// last_line(-N) returns newest-first; reverse to get chronological order
				buffers.addLines(bufPtr, [...lines].reverse(), false);

				// Scan history for oper status — SASL auto-oper fires at IRC registration
				// (before relay sync is active) so the 381 lands in buffer history, not
				// as a live lineAdded event.
				const entry = buffers.buffers.get(bufPtr);
				const btype = entry?.buffer.localVars['type'] ?? '';
				if (entry && btype === 'server') {
					const srv = entry.buffer.localVars['server'] ?? '';
					if (srv && !this.operServers.has(srv) && !this.modeQueriedServers.has(srv)) {
						for (const line of lines) {
							this.detectOperFromLine(line, entry);
							if (this.operServers.has(srv)) break;
						}
						// History scan came up empty — query current mode as one-time fallback
						// so we detect oper status even when the 381 is older than the history window
						if (!this.operServers.has(srv)) {
							const nick = entry.buffer.localVars['nick'];
							if (nick) { this.modeQueriedServers.add(srv); client.sendInput(entry.buffer.id, `/mode ${nick}`); }
						}
					}
				}
			}),

			on<NicklistReceivedEvent>(client, 'nicklistReceived', ({ buffer: bufPtr, nicks }) => {
				buffers.setNicklist(bufPtr, nicks);
			}),

			on<NickAddedEvent>(client, 'nickAdded', ({ buffer: bufPtr, nick }) => {
				buffers.addNick(bufPtr, nick);
			}),

			on<NickRemovedEvent>(client, 'nickRemoved', ({ buffer: bufPtr, nickId }) => {
				buffers.removeNick(bufPtr, nickId);
			}),

			on<HotlistUpdatedEvent>(client, 'hotlistUpdated', ({ hotlist }) => {
				buffers.updateHotlist(hotlist);
				updateTitle(buffers.totalHighlights, buffers.totalUnread);
			}),

			// Pong — compute lag from the timestamp we embedded in the ping
			on<CustomEvent>(client, 'pong', (ev) => {
				// The relay echoes back whatever string we sent in the ping;
				// we embed a unix-ms timestamp so we can compute round-trip time.
				const sent = parseInt(String((ev as unknown as CustomEvent<{ arg: string }>).detail ?? ''), 10);
				if (!isNaN(sent)) this.lag = Date.now() - sent;
			})
		];

		// Wire video engine send function to route through server buffer
		setVideoSendFn((text: string) => {
			const serverBuf = video.getServerBuffer();
			if (serverBuf) this.sendTo(serverBuf, text);
		});

		client.connect();
	}

	disconnect(): void {
		this.disconnectClean(true);
		buffers.clear();
	}

	private disconnectClean(clean: boolean): void {
		this.stopPing();
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups = [];
		if (this.client) {
			this.client.disconnect(clean);
			this.client = null;
		}
		this.connectionState = ConnectionState.DISCONNECTED;
	}

	reconnect(): void {
		if (this.client) {
			this.stopPing();
			this.client.disconnect(false);
			this.client.connect();
		} else {
			this.connect();
		}
	}

	// Resolve the user's own IRC nick for the active buffer.
	// WeeChat sometimes stores the remote nick in localVars['nick'] for PM buffers
	// (when it should be the user's own nick). We prefer the server buffer's nick,
	// which is always the user's own nick for that connection.
	private ownNick(entry: import('./buffers.svelte.js').BufferEntry): string {
		const localNick    = entry.buffer.localVars['nick']    ?? '';
		const remoteNick   = entry.buffer.localVars['channel'] ?? '';
		const serverName   = entry.buffer.localVars['server']  ?? '';

		// If localNick looks wrong (equals the remote channel/nick), search for
		// the server buffer which always holds the correct own-nick.
		if (!localNick || (remoteNick && localNick === remoteNick)) {
			for (const e of buffers.buffers.values()) {
				if (
					e.buffer.localVars['server'] === serverName &&
					!e.buffer.localVars['type'] &&
					e.buffer.localVars['nick']
				) {
					return e.buffer.localVars['nick'];
				}
			}
		}

		return localNick;
	}

	// Strip WeeChat/IRC color and formatting codes from a string
	private stripCodes(s: string): string {
		// eslint-disable-next-line no-control-regex
		return s.replace(/\x19[^\x1c]?|\x1a.|\x1c|\x02|\x0f|\x11|\x16|\x1d|\x1e|\x1f/g, '')
		        .replace(/\x03(\d{1,2}(,\d{1,2})?)?/g, '')
		        .trim();
	}

	// Detect oper/admin status from a single line. Called from both lineAdded
	// (live) and historyLoaded (initial scan) so SASL auto-oper is caught even
	// when the 381 arrives before the relay sync subscription is active.
	private setOperForEntry(entry: import('./buffers.svelte.js').BufferEntry, oper: boolean, admin: boolean) {
		const srv = entry.buffer.localVars['server'] ?? '';
		if (!srv) return;
		if (oper) {
			this.operServers  = new Set([...this.operServers,  srv]);
			if (admin) this.adminServers = new Set([...this.adminServers, srv]);
			this.isOper  = true;
			this.isAdmin = this.isAdmin || admin;
		} else {
			const ops  = new Set(this.operServers);  ops.delete(srv);
			const adms = new Set(this.adminServers); adms.delete(srv);
			this.operServers  = ops;
			this.adminServers = adms;
			this.isOper  = ops.size  > 0;
			this.isAdmin = adms.size > 0;
		}
	}

	private detectOperFromLine(
		line: import('$lib/weechat/types.js').WeeChatLine,
		entry: import('./buffers.svelte.js').BufferEntry
	): void {
		const btype = entry.buffer.localVars['type'] ?? '';
		const isServerBuf = btype === 'server';
		const plain = this.stripCodes(line.message);

		// 381 RPL_YOUREOPER — Ophion: "Authenticated via METHOD — Server Administrator"
		if (line.tags.includes('irc_381') || /authenticated via/i.test(plain)) {
			const roleMatch = plain.match(/[—–\-]\s*(.+)$/);
			const role = roleMatch ? roleMatch[1] : plain;
			this.setOperForEntry(entry, true, /admin/i.test(role));
			if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('oper-gained'));
			return;
		}

		// 221 RPL_UMODEIS — response to /MODE nick (our active mode query).
		// Primary: irc_221 tag. Fallback: bare mode string in server buffer
		// (Ophion's 221 format is just the mode string, e.g. "+oaiwrs").
		if (isServerBuf && (line.tags.includes('irc_221') || /^\+[a-zA-Z]{2,}$/.test(plain))) {
			const modeMatch = plain.match(/\+([a-zA-Z]+)/);
			if (modeMatch) {
				const modes = modeMatch[1];
				if (/[oO]/.test(modes)) {
					this.setOperForEntry(entry, true, /[aA]/.test(modes));
					if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('oper-gained'));
				}
			}
			return;
		}

		// User mode +o/+a on own nick → opered; -o/-a → deopered
		// Skip channel mode lines (contain # or & target) to avoid false positives
		if (line.tags.includes('irc_mode') && isServerBuf && !/[#&]/.test(plain)) {
			const ownNick = this.ownNick(entry);
			if (ownNick && plain.includes(ownNick)) {
				if (/\+[oOaA]/.test(plain)) {
					this.setOperForEntry(entry, true, /\+[aA]/.test(plain));
					if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('oper-gained'));
				}
				if (/-[oOaA]/.test(plain)) {
					this.setOperForEntry(entry, false, false);
				}
			}
		}
	}

	// Find the IRC server buffer for the given buffer pointer (or active buffer).
	// Commands like /join need to be routed to the server buffer so WeeChat can
	// execute them in the right IRC server context.
	// Open a PM/query window for nick, switching to it once it's ready
	openQuery(nick: string): void {
		this.pendingQueryNick = nick.toLowerCase();
		// Route /query through sendInput so it goes to the correct server buffer
		this.sendInput(`/query ${nick}`);
		// Safety: clear pending flag after 10 s in case WeeChat doesn't open the buffer
		setTimeout(() => {
			if (this.pendingQueryNick === nick.toLowerCase()) this.pendingQueryNick = null;
		}, 10000);
	}

	sendInput(text: string, pointer?: string): void {
		const target = pointer ?? buffers.active;
		if (!this.client || !target) return;
		if (!text.trim()) return;

		// Show the message immediately without waiting for WeeChat's echo.
		// When the echo arrives it will silently replace this placeholder.
		// Skip commands (they produce server-generated output, not chat lines).
		if (!text.startsWith('/')) {
			const entry = buffers.buffers.get(target);
			const nick = entry ? this.ownNick(entry) : '';
			if (nick && entry) {
				buffers.addLine(target, {
					id: `_opt_${Date.now()}`,
					buffer: buffers.active,
					date: new Date(),
					datePrinted: new Date(),
					displayed: true,
					highlight: false,
					tags: ['self_msg'],
					prefix: nick,
					message: text,
					nick,
					isAction: false,
					isSelf: true,
					isNotice: false,
					isJoin: false,
					isPart: false,
					isQuit: false,
					isNick: false,
					isTopic: false,
					isMode: false,
					isTagMsg: false,
					isWhisper: false,
					ircTags: new Map(),
					msgid: undefined,
					replyTo: undefined,
					account: undefined,
				});
			}
		}

		this.sendTo(target, text);
	}

	sendTo(bufferPointer: string, text: string): void {
		if (!this.client) return;
		this.client.sendInput(bufferPointer, text);
	}

	requestHistory(count = 100, pointer?: string): void {
		const target = pointer ?? buffers.active;
		if (!this.client || !target) return;
		buffers.setLoading(target, true);
		this.client.requestHistory(target, count);
	}

	setActive(bufferPointer: string): void {
		buffers.setActive(bufferPointer);
		// Tell WeeChat to clear its hotlist for this buffer so it doesn't re-push
		// the old unread count on the next hotlist update.
		if (this.client) {
			this.client.sendInput(bufferPointer, '/buffer set hotlist -1');
		}
	}

	requestNicklist(bufferPointer: string): void {
		if (!this.client) return;
		this.client.requestNicklist(bufferPointer);
	}

	startPing(): void {
		this.stopPing();
		this.pingInterval = setInterval(() => {
			if (this.client && this.connectionState === ConnectionState.CONNECTED) {
				// Embed current timestamp — pong echo lets us compute lag
				this.client.send(`ping ${Date.now()}\n`);
			}
		}, 30000);
	}

	stopPing(): void {
		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}

	get isConnected(): boolean {
		return this.connectionState === ConnectionState.CONNECTED;
	}

	get isConnecting(): boolean {
		return (
			this.connectionState === ConnectionState.CONNECTING ||
			this.connectionState === ConnectionState.AUTHENTICATING
		);
	}
}

export const chat = new ChatStore();

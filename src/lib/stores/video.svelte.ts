import { VideoEngine, type CallState, type PeerState } from '$lib/webrtc/VideoEngine.js';
import { buffers } from './buffers.svelte.js';
import { settings } from './settings.svelte.js';

// ── Signaling helpers ──────────────────────────────────────────────────────
// We need a reference to the send function. It's set by chat.svelte.ts after
// the engine is created, to avoid a circular import.
let _sendQuote: ((text: string) => void) | null = null;
export function setVideoSendFn(fn: (text: string) => void) {
	_sendQuote = fn;
}

function sendWebRTC(target: string, type: string, payload = '') {
	if (!_sendQuote) return;
	const cmd = payload ? `/quote WEBRTC ${target} ${type} :${payload}` : `/quote WEBRTC ${target} ${type}`;
	_sendQuote(cmd);
}

// Send the no-video PROP to the server to reflect the user's preference.
// Uses PROP * no-video :1 (set) or PROP * no-video : (delete).
export function syncNoVideoProp(enabled: boolean) {
	if (!_sendQuote) return;
	if (!enabled) {
		_sendQuote('/quote PROP * no-video :1');
	} else {
		_sendQuote('/quote PROP * no-video :');
	}
}

// ── Store ──────────────────────────────────────────────────────────────────

class VideoStore {
	callState = $state<CallState>('idle');
	callWith   = $state('');
	callChannel = $state<string | null>(null);
	localStream = $state<MediaStream | null>(null);
	peers       = $state<Map<string, PeerState>>(new Map());
	error       = $state<string | null>(null);
	minimized   = $state(false);
	audioMuted  = $state(false);
	videoOff    = $state(false);

	private engine: VideoEngine;

	constructor() {
		this.engine = new VideoEngine({
			onCallState: (state, nick, channel) => {
				this.callState = state;
				this.callWith = nick;
				this.callChannel = channel;
				if (state === 'idle') {
					this.peers = new Map();
					this.minimized = false;
					this.audioMuted = false;
					this.videoOff = false;
				}
			},
			onPeerStream: (nick, stream) => {
				const next = new Map(this.peers);
				const existing = next.get(nick.toLowerCase());
				next.set(nick.toLowerCase(), { ...existing, nick, stream, channel: existing?.channel ?? null } as PeerState);
				this.peers = next;
			},
			onPeerLeft: (nick) => {
				const next = new Map(this.peers);
				next.delete(nick.toLowerCase());
				this.peers = next;
			},
			onLocalStream: (stream) => {
				this.localStream = stream;
			},
			onError: (msg) => {
				this.error = msg;
				setTimeout(() => { this.error = null; }, 5000);
			},
			sendWebRTC,
		});
	}

	// ── Public actions ─────────────────────────────────────────────────────

	startCall(nick: string) { this.engine.startCall(nick); }
	acceptCall()            { this.engine.acceptIncomingCall(); }
	rejectCall()            { if (this.callWith) this.engine.rejectCall(this.callWith); }
	hangup() {
		if (this.callChannel) this.engine.leaveRoom(this.callChannel);
		else if (this.callWith) this.engine.hangup(this.callWith);
	}

	joinRoom(channel: string) { this.engine.joinRoom(channel); }
	leaveRoom(channel: string) { this.engine.leaveRoom(channel); }

	toggleMute() {
		this.audioMuted = !this.audioMuted;
		this.engine.setMuted(this.audioMuted);
	}
	toggleVideo() {
		this.videoOff = !this.videoOff;
		this.engine.setVideoEnabled(!this.videoOff);
	}

	// Dispatch incoming WEBRTC line from WeeChat relay.
	// Called from chat.svelte.ts lineAdded handler.
	handleLine(fromNick: string, target: string, type: string, payload: string) {
		// Auto-BUSY on incoming RING when video calls are disabled in settings.
		if (type === 'RING' && !target.startsWith('#') && !settings.enableVideoCalls) {
			sendWebRTC(fromNick, 'BUSY', '');
			return;
		}
		this.engine.handleWebRTCMessage(fromNick, target, type, payload);
	}

	// Helpers for UI
	get isActive() { return this.callState !== 'idle'; }
	get activePeers(): PeerState[] {
		const all = [...this.peers.values()];
		if (this.callChannel) return all.filter(p => p.channel === this.callChannel);
		return all.filter(p => p.nick.toLowerCase() === this.callWith.toLowerCase());
	}

	// Find the server buffer pointer for the active buffer's IRC connection.
	// We need this to route `/quote WEBRTC` commands to the right server.
	getServerBuffer(): string | null {
		if (!buffers.active) return null;
		const entry = buffers.buffers.get(buffers.active);
		if (!entry) return null;
		const serverName = entry.buffer.localVars['server'];
		if (!serverName) return null;
		// Find the server buffer: same server, no channel/query type
		for (const [, e] of buffers.buffers) {
			if (e.buffer.localVars['server'] === serverName && !e.buffer.localVars['type']) {
				return e.buffer.id;
			}
		}
		return null;
	}
}

export const video = new VideoStore();

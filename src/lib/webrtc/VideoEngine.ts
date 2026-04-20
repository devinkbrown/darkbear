// WebRTC video/voice call engine for DarkBear.
// Signaling is sent via WeeChat relay using `/quote WEBRTC target TYPE payload`.
// Incoming WEBRTC messages are dispatched here from chat.svelte.ts.

export type CallState = 'idle' | 'ringing_out' | 'ringing_in' | 'in_call';

export interface PeerState {
	nick: string;
	connection: RTCPeerConnection;
	stream: MediaStream | null;
	channel: string | null; // null = P2P call, string = group room
}

export interface VideoEngineCallbacks {
	onCallState: (state: CallState, nick: string, channel: string | null) => void;
	onPeerStream: (nick: string, stream: MediaStream) => void;
	onPeerLeft: (nick: string) => void;
	onLocalStream: (stream: MediaStream | null) => void;
	onError: (msg: string) => void;
	sendWebRTC: (target: string, type: string, payload?: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
];

export class VideoEngine {
	private cb: VideoEngineCallbacks;
	private peers = new Map<string, PeerState>();
	private localStream: MediaStream | null = null;
	private activeRoom: string | null = null;
	private callState: CallState = 'idle';
	private callWith: string = '';
	private _pendingOffer: { nick: string; sdp: string } | undefined;

	constructor(callbacks: VideoEngineCallbacks) {
		this.cb = callbacks;
	}

	getLocalStream() { return this.localStream; }
	getPeers() { return new Map(this.peers); }
	getCallState() {
		return { callState: this.callState, callWith: this.callWith, callChannel: this.activeRoom };
	}

	// ── Media ─────────────────────────────────────────────────────────────────

	private async getMedia(): Promise<MediaStream> {
		if (this.localStream) return this.localStream;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
			this.localStream = stream;
			this.cb.onLocalStream(stream);
			return stream;
		} catch {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			this.localStream = stream;
			this.cb.onLocalStream(stream);
			return stream;
		}
	}

	private releaseMedia() {
		if (this.localStream) {
			this.localStream.getTracks().forEach(t => t.stop());
			this.localStream = null;
			this.cb.onLocalStream(null);
		}
	}

	// ── Peer connections ──────────────────────────────────────────────────────

	private createPeer(nick: string, channel: string | null): RTCPeerConnection {
		const key = nick.toLowerCase();
		const existing = this.peers.get(key);
		if (existing) existing.connection.close();

		const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

		if (this.localStream) {
			this.localStream.getTracks().forEach(t => {
				this.localStream && pc.addTrack(t, this.localStream);
			});
		}

		pc.onicecandidate = ev => {
			if (ev.candidate) this.cb.sendWebRTC(nick, 'ICE', JSON.stringify(ev.candidate));
		};

		pc.ontrack = ev => {
			const stream = ev.streams[0];
			if (stream) {
				const peer = this.peers.get(key);
				if (peer) peer.stream = stream;
				this.cb.onPeerStream(nick, stream);
			}
		};

		pc.onconnectionstatechange = () => {
			if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
				this.peers.delete(key);
				this.cb.onPeerLeft(nick);
				if (channel === null && key === this.callWith.toLowerCase()) {
					this._setIdle();
				}
			}
		};

		this.peers.set(key, { nick, connection: pc, stream: null, channel });
		return pc;
	}

	private closePeer(nick: string) {
		const key = nick.toLowerCase();
		const peer = this.peers.get(key);
		if (peer) {
			peer.connection.close();
			this.peers.delete(key);
			this.cb.onPeerLeft(nick);
		}
	}

	private _setIdle() {
		if (this.peers.size === 0) this.releaseMedia();
		this.callState = 'idle';
		this.callWith = '';
		this.activeRoom = null;
		this.cb.onCallState('idle', '', null);
	}

	// ── P2P calls ─────────────────────────────────────────────────────────────

	async startCall(nick: string) {
		if (this.callState !== 'idle') { this.cb.onError('Already in a call'); return; }
		try {
			await this.getMedia();
			const pc = this.createPeer(nick, null);
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			this.cb.sendWebRTC(nick, 'RING');
			this.cb.sendWebRTC(nick, 'OFFER', JSON.stringify(offer));
			this.callState = 'ringing_out';
			this.callWith = nick;
			this.cb.onCallState('ringing_out', nick, null);
		} catch (e) {
			this.cb.onError(`Failed to start call: ${e}`);
		}
	}

	async answerCall(nick: string, offerSdp: string) {
		try {
			await this.getMedia();
			const offer: RTCSessionDescriptionInit = JSON.parse(offerSdp);
			const pc = this.createPeer(nick, null);
			await pc.setRemoteDescription(offer);
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			this.cb.sendWebRTC(nick, 'ANSWER', JSON.stringify(answer));
			this.callState = 'in_call';
			this.callWith = nick;
			this.cb.onCallState('in_call', nick, null);
		} catch (e) {
			this.cb.onError(`Failed to answer call: ${e}`);
		}
	}

	async handleAnswer(nick: string, answerSdp: string) {
		const key = nick.toLowerCase();
		const peer = this.peers.get(key);
		if (!peer) return;
		try {
			const answer: RTCSessionDescriptionInit = JSON.parse(answerSdp);
			await peer.connection.setRemoteDescription(answer);
			this.callState = 'in_call';
			this.cb.onCallState('in_call', nick, null);
		} catch (e) {
			this.cb.onError(`Failed to handle answer: ${e}`);
		}
	}

	async addIceCandidate(nick: string, candidateJson: string) {
		const key = nick.toLowerCase();
		const peer = this.peers.get(key);
		if (!peer) return;
		try {
			await peer.connection.addIceCandidate(JSON.parse(candidateJson));
		} catch { /* ignore */ }
	}

	hangup(nick: string) {
		this.cb.sendWebRTC(nick, 'HANGUP');
		this.closePeer(nick);
		if (nick.toLowerCase() === this.callWith.toLowerCase()) this._setIdle();
	}

	rejectCall(nick: string) {
		this.cb.sendWebRTC(nick, 'BUSY');
		this.closePeer(nick);
		if (this.callState === 'ringing_in' && nick.toLowerCase() === this.callWith.toLowerCase()) {
			this._setIdle();
		}
	}

	acceptIncomingCall() {
		if (this._pendingOffer) {
			const { nick, sdp } = this._pendingOffer;
			this._pendingOffer = undefined;
			this.answerCall(nick, sdp);
		}
	}

	// ── Group video room ──────────────────────────────────────────────────────

	async joinRoom(channel: string) {
		if (this.activeRoom === channel) return;
		this.activeRoom = channel;
		try {
			await this.getMedia();
			this.cb.sendWebRTC(channel, 'JOIN');
			this.callState = 'in_call';
			this.cb.onCallState('in_call', '', channel);
		} catch (e) {
			this.cb.onError(`Failed to join room: ${e}`);
		}
	}

	leaveRoom(channel: string) {
		if (this.activeRoom !== channel) return;
		this.cb.sendWebRTC(channel, 'LEAVE');
		for (const [key, peer] of this.peers) {
			if (peer.channel === channel) {
				peer.connection.close();
				this.peers.delete(key);
				this.cb.onPeerLeft(peer.nick);
			}
		}
		this.activeRoom = null;
		this._setIdle();
	}

	async offerRoomPeer(nick: string) {
		if (!this.activeRoom) return;
		try {
			await this.getMedia();
			const pc = this.createPeer(nick, this.activeRoom);
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			this.cb.sendWebRTC(nick, 'OFFER', JSON.stringify(offer));
		} catch (e) {
			this.cb.onError(`Failed to offer room peer: ${e}`);
		}
	}

	async answerRoomPeer(nick: string, offerSdp: string) {
		if (!this.activeRoom) return;
		try {
			await this.getMedia();
			const offer: RTCSessionDescriptionInit = JSON.parse(offerSdp);
			const pc = this.createPeer(nick, this.activeRoom);
			await pc.setRemoteDescription(offer);
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			this.cb.sendWebRTC(nick, 'ANSWER', JSON.stringify(answer));
		} catch (e) {
			this.cb.onError(`Failed to answer room peer: ${e}`);
		}
	}

	// ── Incoming message dispatcher ───────────────────────────────────────────

	handleWebRTCMessage(fromNick: string, target: string, type: string, payload: string) {
		const isChannel = target.startsWith('#') || target.startsWith('&');

		if (isChannel) {
			switch (type) {
				case 'JOIN':
					if (this.activeRoom === target) this.offerRoomPeer(fromNick);
					break;
				case 'LEAVE':
					this.closePeer(fromNick);
					break;
			}
		} else {
			switch (type) {
				case 'RING':
					if (this.callState === 'idle') {
						this.callState = 'ringing_in';
						this.callWith = fromNick;
						this.cb.onCallState('ringing_in', fromNick, null);
					}
					break;
				case 'OFFER':
					if (this.activeRoom) {
						this.answerRoomPeer(fromNick, payload);
					} else if (this.callState === 'ringing_in' && fromNick.toLowerCase() === this.callWith.toLowerCase()) {
						this._pendingOffer = { nick: fromNick, sdp: payload };
					} else {
						this._pendingOffer = { nick: fromNick, sdp: payload };
					}
					break;
				case 'ANSWER':
					this.handleAnswer(fromNick, payload);
					break;
				case 'ICE':
					this.addIceCandidate(fromNick, payload);
					break;
				case 'HANGUP':
					this.closePeer(fromNick);
					if (fromNick.toLowerCase() === this.callWith.toLowerCase()) this._setIdle();
					break;
				case 'BUSY':
					if (fromNick.toLowerCase() === this.callWith.toLowerCase()) {
						this.closePeer(fromNick);
						this._setIdle();
						this.cb.onError(`${fromNick} is busy`);
					}
					break;
			}
		}
	}

	// ── Controls ──────────────────────────────────────────────────────────────

	setMuted(muted: boolean) {
		this.localStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
	}

	setVideoEnabled(enabled: boolean) {
		this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
	}

	destroy() {
		for (const peer of this.peers.values()) peer.connection.close();
		this.peers.clear();
		this.releaseMedia();
		this.callState = 'idle';
	}
}

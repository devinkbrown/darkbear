import { ConnectionState, type IrcBuffer, type IrcLine, type IrcUser, type ISupport, type WhoisInfo } from './types.js';
import { parseIRC, parsePrefix, formatIRC } from './parser.js';
import { capFromServer, parseCapList } from './capabilities.js';
import { saslPlain, saslChunks } from './sasl.js';

export interface ClientSettings {
	nick: string;
	realname: string;
	ident: string;
	password?: string;
	saslPlain?: { user: string; pass: string };
	channels: string[];
}

export interface LineEvent {
	buffer: string;
	line: IrcLine;
}

export interface BufferUpdateEvent {
	buffer: IrcBuffer;
	action: 'create' | 'update' | 'delete' | 'join' | 'part' | 'names';
}

export interface NicklistEvent {
	buffer: string;
	users: Map<string, IrcUser>;
}

export interface WhoisEvent {
	info: WhoisInfo;
}

export interface ClientEvents {
	line: LineEvent;
	state: ConnectionState;
	bufferUpdate: BufferUpdateEvent;
	nicklist: NicklistEvent;
	whois: WhoisEvent;
	error: string;
	serverInfo: { network?: string; motd: string };
}

type EventListener<T> = (data: T) => void;

type EventMap = {
	[K in keyof ClientEvents]: EventListener<ClientEvents[K]>[];
};

function makeId(): string {
	return crypto.randomUUID();
}

function makeLine(
	type: IrcLine['type'],
	text: string,
	nick?: string,
	tags?: Map<string, string>,
	self?: boolean,
	serverTime?: string
): IrcLine {
	let ts = new Date();
	if (serverTime) {
		const d = new Date(serverTime);
		if (!isNaN(d.getTime())) ts = d;
	}
	return { id: makeId(), ts, type, text, nick, tags, self };
}

const MAX_MESSAGES = 5000;
const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 30000;

export class IrcClient {
	private ws: WebSocket | null = null;
	private _state: ConnectionState = ConnectionState.DISCONNECTED;
	private _nick = '';
	private _server = '';
	private _port = 6697;
	private _tls = true;
	private clientSettings: ClientSettings | null = null;

	// IRCv3 state
	private capsRequested: string[] = [];
	private capsAcked = new Set<string>();
	private capLsAccum = '';
	private capLsMore = false;
	private saslPending = false;
	private saslChunkQueue: string[] = [];

	// Server state
	private buffers = new Map<string, IrcBuffer>();
	private isupport: ISupport = {
		PREFIX: new Map([
			['o', '@'],
			['v', '+'],
			['h', '%'],
			['a', '&'],
			['q', '~']
		]),
		CHANTYPES: ['#', '&'],
		CHANMODES: { listModes: 'b', paramAlways: 'k', paramOnSet: 'l', noParam: 'imnpst' },
		NICKLEN: 30,
		CASEMAPPING: 'rfc1459',
		MODES: 4
	};
	private motdBuffer = '';
	private whoisAccum = new Map<string, WhoisInfo>();

	// Reconnect state
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = RECONNECT_BASE;
	private shouldReconnect = false;

	// Event system
	private listeners: EventMap = {
		line: [],
		state: [],
		bufferUpdate: [],
		nicklist: [],
		whois: [],
		error: [],
		serverInfo: []
	};

	// --- Public API ---

	get state(): ConnectionState {
		return this._state;
	}

	get nick(): string {
		return this._nick;
	}

	get server(): string {
		return this._server;
	}

	on<K extends keyof ClientEvents>(event: K, listener: EventListener<ClientEvents[K]>): () => void {
		(this.listeners[event] as EventListener<ClientEvents[K]>[]).push(listener);
		return () => this.off(event, listener);
	}

	off<K extends keyof ClientEvents>(event: K, listener: EventListener<ClientEvents[K]>): void {
		const arr = this.listeners[event] as EventListener<ClientEvents[K]>[];
		const idx = arr.indexOf(listener);
		if (idx !== -1) arr.splice(idx, 1);
	}

	private emit<K extends keyof ClientEvents>(event: K, data: ClientEvents[K]): void {
		for (const listener of this.listeners[event] as EventListener<ClientEvents[K]>[]) {
			try {
				listener(data);
			} catch (e) {
				console.error(`Error in ${event} listener:`, e);
			}
		}
	}

	connect(server: string, port: number, tls: boolean, settings: ClientSettings): void {
		this.shouldReconnect = true;
		this._server = server;
		this._port = port;
		this._tls = tls;
		this.clientSettings = settings;
		this._nick = settings.nick;
		this.reconnectDelay = RECONNECT_BASE;
		this.doConnect();
	}

	disconnect(msg?: string): void {
		this.shouldReconnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws && this._state !== ConnectionState.DISCONNECTED) {
			try {
				this.send(`QUIT :${msg ?? 'DarkBear'}`);
			} catch (_) {
				// ignore
			}
			this.ws.close();
		}
		this.setState(ConnectionState.DISCONNECTED);
	}

	reconnect(): void {
		if (this.ws) {
			this.ws.close();
		}
		this.shouldReconnect = true;
		this.reconnectDelay = RECONNECT_BASE;
		this.doConnect();
	}

	send(raw: string): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(raw + '\r\n');
		}
	}

	privmsg(target: string, text: string): void {
		this.send(`PRIVMSG ${target} :${text}`);
	}

	notice(target: string, text: string): void {
		this.send(`NOTICE ${target} :${text}`);
	}

	join(channel: string, key?: string): void {
		if (key) {
			this.send(`JOIN ${channel} ${key}`);
		} else {
			this.send(`JOIN ${channel}`);
		}
	}

	part(channel: string, msg?: string): void {
		if (msg) {
			this.send(`PART ${channel} :${msg}`);
		} else {
			this.send(`PART ${channel}`);
		}
	}

	topic(channel: string, text?: string): void {
		if (text !== undefined) {
			this.send(`TOPIC ${channel} :${text}`);
		} else {
			this.send(`TOPIC ${channel}`);
		}
	}

	kick(channel: string, nick: string, reason?: string): void {
		if (reason) {
			this.send(`KICK ${channel} ${nick} :${reason}`);
		} else {
			this.send(`KICK ${channel} ${nick}`);
		}
	}

	mode(target: string, modes?: string, ...params: string[]): void {
		if (modes) {
			const parts = [target, modes, ...params].join(' ');
			this.send(`MODE ${parts}`);
		} else {
			this.send(`MODE ${target}`);
		}
	}

	whois(nick: string): void {
		this.send(`WHOIS ${nick} ${nick}`);
	}

	away(msg?: string): void {
		if (msg) {
			this.send(`AWAY :${msg}`);
		} else {
			this.send(`AWAY`);
		}
	}

	invite(nick: string, channel: string): void {
		this.send(`INVITE ${nick} ${channel}`);
	}

	list(channel?: string): void {
		if (channel) {
			this.send(`LIST ${channel}`);
		} else {
			this.send(`LIST`);
		}
	}

	getBuffer(name: string): IrcBuffer | undefined {
		return this.buffers.get(this.normalizeTarget(name));
	}

	getBuffers(): Map<string, IrcBuffer> {
		return this.buffers;
	}

	// --- Private: connection lifecycle ---

	private doConnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		this.setState(ConnectionState.CONNECTING);
		this.resetCapState();
		this.motdBuffer = '';

		const scheme = this._tls ? 'wss' : 'ws';
		const url = `${scheme}://${this._server}:${this._port}`;

		try {
			this.ws = new WebSocket(url);
		} catch (e) {
			this.setState(ConnectionState.DISCONNECTED);
			this.scheduleReconnect();
			return;
		}

		this.ws.onopen = () => {
			this.setState(ConnectionState.REGISTERING);
			this.startRegistration();
		};

		this.ws.onmessage = (ev) => {
			const data = String(ev.data);
			// Handle multi-line messages
			for (const line of data.split('\n')) {
				const trimmed = line.replace(/\r$/, '');
				if (trimmed) {
					this.handleLine(trimmed);
				}
			}
		};

		this.ws.onerror = () => {
			// onerror always precedes onclose, handle in onclose
		};

		this.ws.onclose = () => {
			this.ws = null;
			if (this._state !== ConnectionState.DISCONNECTED) {
				this.setState(ConnectionState.DISCONNECTED);
			}
			const serverBuf = this.getOrCreateBuffer('server', 'server', this._server);
			this.addLineToBuffer(serverBuf, makeLine('error', 'Disconnected from server.'));
			if (this.shouldReconnect) {
				this.scheduleReconnect();
			}
		};
	}

	private startRegistration(): void {
		// Begin CAP negotiation
		this.send('CAP LS 302');
		if (this.clientSettings?.password) {
			this.send(`PASS :${this.clientSettings.password}`);
		}
		this.send(`NICK ${this._nick}`);
		const settings = this.clientSettings!;
		this.send(
			`USER ${settings.ident || settings.nick} 0 * :${settings.realname || settings.nick}`
		);
	}

	private resetCapState(): void {
		this.capsRequested = [];
		this.capsAcked.clear();
		this.capLsAccum = '';
		this.capLsMore = false;
		this.saslPending = false;
		this.saslChunkQueue = [];
	}

	private scheduleReconnect(): void {
		if (!this.shouldReconnect) return;
		const delay = this.reconnectDelay;
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX);

		const serverBuf = this.getOrCreateBuffer('server', 'server', this._server);
		this.addLineToBuffer(
			serverBuf,
			makeLine('info', `Reconnecting in ${Math.round(delay / 1000)}s...`)
		);

		this.reconnectTimer = setTimeout(() => {
			this.doConnect();
		}, delay);
	}

	private setState(state: ConnectionState): void {
		this._state = state;
		this.emit('state', state);
	}

	// --- Private: IRC message handling ---

	private handleLine(raw: string): void {
		const msg = parseIRC(raw);
		const serverTime = msg.tags.get('time');

		switch (msg.command) {
			case 'CAP':
				this.handleCAP(msg.params, msg.tags);
				break;

			case 'AUTHENTICATE':
				this.handleAuthenticate(msg.params);
				break;

			case '900': // RPL_LOGGEDIN
				{
					const accountNick = msg.params[2] ?? '';
					const line = makeLine(
						'info',
						`You are now logged in as ${accountNick}`,
						undefined,
						msg.tags,
						false,
						serverTime
					);
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, line);
				}
				break;

			case '901': // RPL_LOGGEDOUT
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, makeLine('info', 'You are now logged out.'));
				}
				break;

			case '902': // ERR_NICKLOCKED
			case '904': // ERR_SASLFAIL
			case '905': // ERR_SASLTOOLONG
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, makeLine('error', `SASL error: ${msg.params.slice(1).join(' ')}`));
					this.send('CAP END');
				}
				break;

			case '903': // RPL_SASLSUCCESS
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, makeLine('info', 'SASL authentication successful.'));
					this.send('CAP END');
				}
				break;

			case '001': // RPL_WELCOME
				this.handle001(msg.params, msg.tags, serverTime);
				break;

			case '002': // RPL_YOURHOST
			case '003': // RPL_CREATED
			case '004': // RPL_MYINFO
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(
						buf,
						makeLine('server', msg.params.slice(1).join(' '), undefined, msg.tags, false, serverTime)
					);
				}
				break;

			case '005': // RPL_ISUPPORT
				this.handleISupport(msg.params);
				break;

			case '251':
			case '252':
			case '253':
			case '254':
			case '255':
			case '265':
			case '266': // LUSERS
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(
						buf,
						makeLine('server', msg.params.slice(1).join(' '), undefined, msg.tags, false, serverTime)
					);
				}
				break;

			case '372': // RPL_MOTD
				this.motdBuffer += (this.motdBuffer ? '\n' : '') + (msg.params[1] ?? '');
				break;

			case '375': // RPL_MOTDSTART
				this.motdBuffer = '';
				break;

			case '376': // RPL_ENDOFMOTD
			case '422': // ERR_NOMOTD
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					if (this.motdBuffer) {
						this.addLineToBuffer(buf, makeLine('server', this.motdBuffer));
						this.motdBuffer = '';
					}
					if (msg.command === '422') {
						this.addLineToBuffer(buf, makeLine('info', 'No MOTD.'));
					}
					// Autojoin channels
					this.autoJoin();
				}
				break;

			case '311': // RPL_WHOISUSER
				{
					const nick = msg.params[1] ?? '';
					const ident = msg.params[2] ?? '';
					const host = msg.params[3] ?? '';
					const realname = msg.params[5] ?? '';
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.ident = ident;
					info.host = host;
					info.realname = realname;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '312': // RPL_WHOISSERVER
				{
					const nick = msg.params[1] ?? '';
					const server = msg.params[2] ?? '';
					const serverInfo = msg.params[3] ?? '';
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.server = server;
					info.serverInfo = serverInfo;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '313': // RPL_WHOISOPERATOR
				{
					const nick = msg.params[1] ?? '';
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.operator = true;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '317': // RPL_WHOISIDLE
				{
					const nick = msg.params[1] ?? '';
					const idle = parseInt(msg.params[2] ?? '0', 10);
					const signon = parseInt(msg.params[3] ?? '0', 10);
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.idle = idle;
					info.signon = signon;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '319': // RPL_WHOISCHANNELS
				{
					const nick = msg.params[1] ?? '';
					const channels = (msg.params[2] ?? '').split(' ').filter(Boolean);
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.channels = channels;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '330': // RPL_WHOISACCOUNT
				{
					const nick = msg.params[1] ?? '';
					const account = msg.params[2] ?? '';
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.account = account;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '318': // RPL_ENDOFWHOIS
				{
					const nick = msg.params[1] ?? '';
					const info = this.whoisAccum.get(nick);
					if (info) {
						this.emit('whois', { info });
						this.whoisAccum.delete(nick);
					}
				}
				break;

			case '301': // RPL_AWAY (in whois)
				{
					const nick = msg.params[1] ?? '';
					const awayMsg = msg.params[2] ?? '';
					const info = this.whoisAccum.get(nick) ?? { nick };
					info.away = awayMsg;
					this.whoisAccum.set(nick, info);
				}
				break;

			case '321': // RPL_LISTSTART
				break;

			case '322': // RPL_LIST
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					const channel = msg.params[1] ?? '';
					const users = msg.params[2] ?? '';
					const topic = msg.params[3] ?? '';
					this.addLineToBuffer(
						buf,
						makeLine('info', `${channel} (${users} users) — ${topic}`)
					);
				}
				break;

			case '323': // RPL_LISTEND
				break;

			case '331': // RPL_NOTOPIC
				{
					const channel = msg.params[1] ?? '';
					const buf = this.getOrCreateBuffer('channel', 'channel', channel);
					buf.topic = '';
					this.emit('bufferUpdate', { buffer: buf, action: 'update' });
				}
				break;

			case '332': // RPL_TOPIC
				{
					const channel = msg.params[1] ?? '';
					const topic = msg.params[2] ?? '';
					const buf = this.getOrCreateBuffer('channel', 'channel', channel);
					buf.topic = topic;
					this.emit('bufferUpdate', { buffer: buf, action: 'update' });
				}
				break;

			case '333': // RPL_TOPICWHOTIME
				{
					const channel = msg.params[1] ?? '';
					const by = msg.params[2] ?? '';
					const when = parseInt(msg.params[3] ?? '0', 10);
					const buf = this.getOrCreateBuffer('channel', 'channel', channel);
					buf.topicSetBy = by;
					buf.topicSetAt = when ? new Date(when * 1000) : undefined;
					this.emit('bufferUpdate', { buffer: buf, action: 'update' });
				}
				break;

			case '353': // RPL_NAMREPLY
				this.handleNames(msg.params);
				break;

			case '366': // RPL_ENDOFNAMES
				{
					const channel = msg.params[1] ?? '';
					const buf = this.getOrCreateBuffer('channel', 'channel', channel);
					this.emit('nicklist', { buffer: channel, users: buf.users });
					this.emit('bufferUpdate', { buffer: buf, action: 'names' });
				}
				break;

			case '396': // RPL_VISIBLEHOST
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(
						buf,
						makeLine(
							'info',
							`Your host is now displayed as ${msg.params[1] ?? ''}`,
							undefined,
							msg.tags,
							false,
							serverTime
						)
					);
				}
				break;

			case '433': // ERR_NICKNAMEINUSE
			case '437': // ERR_UNAVAILRESOURCE
				this.handleNickInUse();
				break;

			case '432': // ERR_ERRONEUSNICKNAME
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, makeLine('error', `Erroneous nickname: ${msg.params[1] ?? ''}`));
				}
				break;

			case '401': // ERR_NOSUCHNICK
				{
					const target = msg.params[1] ?? '';
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, makeLine('error', `No such nick/channel: ${target}`));
				}
				break;

			case '403': // ERR_NOSUCHCHANNEL
			case '405': // ERR_TOOMANYCHANNELS
			case '471': // ERR_CHANNELISFULL
			case '473': // ERR_INVITEONLYCHAN
			case '474': // ERR_BANNEDFROMCHAN
			case '475': // ERR_BADCHANNELKEY
				{
					const target = msg.params[1] ?? '';
					const errText = msg.params.slice(2).join(' ');
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(buf, makeLine('error', `${target}: ${errText}`));
				}
				break;

			case 'PING':
				this.send(`PONG :${msg.params[0] ?? ''}`);
				break;

			case 'JOIN':
				this.handleJoin(msg, serverTime);
				break;

			case 'PART':
				this.handlePart(msg, serverTime);
				break;

			case 'QUIT':
				this.handleQuit(msg, serverTime);
				break;

			case 'KICK':
				this.handleKick(msg, serverTime);
				break;

			case 'PRIVMSG':
				this.handlePrivmsg(msg, serverTime);
				break;

			case 'NOTICE':
				this.handleNotice(msg, serverTime);
				break;

			case 'NICK':
				this.handleNick(msg, serverTime);
				break;

			case 'MODE':
				this.handleMode(msg, serverTime);
				break;

			case 'TOPIC':
				this.handleTopic(msg, serverTime);
				break;

			case 'AWAY':
				this.handleAway(msg);
				break;

			case 'CHGHOST':
				this.handleChghost(msg, serverTime);
				break;

			case 'SETNAME':
				this.handleSetname(msg, serverTime);
				break;

			case 'ACCOUNT':
				this.handleAccount(msg);
				break;

			case 'ERROR':
				{
					const buf = this.getOrCreateBuffer('server', 'server', this._server);
					this.addLineToBuffer(
						buf,
						makeLine('error', `Server error: ${msg.params[0] ?? ''}`)
					);
				}
				break;

			default:
				// Unknown numerics — show in server buffer
				if (/^\d{3}$/.test(msg.command)) {
					const text = msg.params.slice(1).join(' ');
					if (text) {
						const buf = this.getOrCreateBuffer('server', 'server', this._server);
						this.addLineToBuffer(buf, makeLine('server', text, undefined, msg.tags, false, serverTime));
					}
				}
				break;
		}
	}

	private handleCAP(params: string[], _tags: Map<string, string>): void {
		// params: [nick, subcommand, ...args]
		const subcommand = params[1] ?? '';
		const arg = params.slice(2).join(' ');

		switch (subcommand) {
			case 'LS': {
				// Check for multiline (trailing * means more coming)
				const isMore = params[2] === '*';
				const capStr = isMore ? params[3] ?? '' : params[2] ?? '';
				this.capLsAccum += (this.capLsAccum ? ' ' : '') + capStr;

				if (!isMore) {
					// Done accumulating
					const available = parseCapList(this.capLsAccum);
					const toRequest = capFromServer(Array.from(available.keys()));
					this.capsRequested = toRequest;

					// Check if SASL is available and we have credentials
					const hasSasl =
						toRequest.includes('sasl') && Boolean(this.clientSettings?.saslPlain);

					if (toRequest.length > 0) {
						this.send(`CAP REQ :${toRequest.join(' ')}`);
					} else {
						this.send('CAP END');
					}
					this.capLsAccum = '';
				}
				break;
			}

			case 'ACK': {
				const acked = arg.trim().split(' ').filter(Boolean);
				for (const cap of acked) {
					this.capsAcked.add(cap.replace(/^-/, '').replace(/^~/, '').replace(/^\=/, ''));
				}

				// If SASL acked and we have credentials, start auth
				if (this.capsAcked.has('sasl') && this.clientSettings?.saslPlain && !this.saslPending) {
					this.saslPending = true;
					this.send('AUTHENTICATE PLAIN');
				} else if (!this.capsAcked.has('sasl') || !this.clientSettings?.saslPlain) {
					this.send('CAP END');
				}
				break;
			}

			case 'NAK': {
				// Caps were rejected — proceed without them
				this.send('CAP END');
				break;
			}

			case 'NEW': {
				// New caps available (cap-notify)
				const newCaps = parseCapList(arg);
				const toRequest = capFromServer(Array.from(newCaps.keys())).filter(
					(c) => !this.capsAcked.has(c)
				);
				if (toRequest.length > 0) {
					this.send(`CAP REQ :${toRequest.join(' ')}`);
				}
				break;
			}

			case 'DEL': {
				// Caps removed
				const delCaps = arg.trim().split(' ').filter(Boolean);
				for (const cap of delCaps) {
					this.capsAcked.delete(cap);
				}
				break;
			}
		}
	}

	private handleAuthenticate(params: string[]): void {
		if (params[0] === '+') {
			// Server ready for credentials
			if (this.clientSettings?.saslPlain) {
				const { user, pass } = this.clientSettings.saslPlain;
				const b64 = saslPlain(user, pass);
				const chunks = saslChunks(b64);
				for (const chunk of chunks) {
					this.send(`AUTHENTICATE ${chunk}`);
				}
			}
		}
	}

	private handle001(params: string[], tags: Map<string, string>, serverTime?: string): void {
		// Extract our actual nick from the welcome message
		const welcomeNick = params[0] ?? this._nick;
		this._nick = welcomeNick;
		this.setState(ConnectionState.CONNECTED);
		this.reconnectDelay = RECONNECT_BASE;

		const buf = this.getOrCreateBuffer('server', 'server', this._server);
		this.addLineToBuffer(
			buf,
			makeLine(
				'info',
				params[1] ?? `Welcome to ${this._server}`,
				undefined,
				tags,
				false,
				serverTime
			)
		);
	}

	private handleISupport(params: string[]): void {
		// params[0] = nick, params[last] = "are supported by this server"
		for (let i = 1; i < params.length - 1; i++) {
			const token = params[i];
			const eqIdx = token.indexOf('=');
			const key = eqIdx !== -1 ? token.slice(0, eqIdx) : token;
			const val = eqIdx !== -1 ? token.slice(eqIdx + 1) : '';

			switch (key) {
				case 'PREFIX': {
					// (qaohv)~&@%+
					const match = val.match(/^\(([^)]+)\)(.+)$/);
					if (match) {
						const modes = match[1];
						const prefixes = match[2];
						this.isupport.PREFIX.clear();
						for (let j = 0; j < modes.length; j++) {
							if (j < prefixes.length) {
								this.isupport.PREFIX.set(modes[j], prefixes[j]);
							}
						}
					}
					break;
				}
				case 'CHANTYPES':
					this.isupport.CHANTYPES = val.split('');
					break;
				case 'CHANMODES': {
					const parts = val.split(',');
					this.isupport.CHANMODES = {
						listModes: parts[0] ?? '',
						paramAlways: parts[1] ?? '',
						paramOnSet: parts[2] ?? '',
						noParam: parts[3] ?? ''
					};
					break;
				}
				case 'NICKLEN':
					this.isupport.NICKLEN = parseInt(val, 10) || 30;
					break;
				case 'CASEMAPPING':
					this.isupport.CASEMAPPING = val || 'rfc1459';
					break;
				case 'NETWORK':
					this.isupport.NETWORK = val;
					break;
				case 'MAXCHANNELS':
					this.isupport.MAXCHANNELS = parseInt(val, 10);
					break;
				case 'TOPICLEN':
					this.isupport.TOPICLEN = parseInt(val, 10);
					break;
				case 'MODES':
					this.isupport.MODES = parseInt(val, 10) || 4;
					break;
			}
		}
	}

	private handleNickInUse(): void {
		if (this._state === ConnectionState.REGISTERING) {
			this._nick = this._nick + '_';
			this.send(`NICK ${this._nick}`);
		}
	}

	private autoJoin(): void {
		const channels = this.clientSettings?.channels ?? [];
		for (const ch of channels) {
			if (ch.trim()) {
				this.join(ch.trim());
			}
		}
	}

	private handleJoin(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick, ident, host } = parsePrefix(msg.prefix);
		const channel = msg.params[0] ?? '';
		const account = msg.params[1] !== '*' ? msg.params[1] : undefined;
		const realname = msg.params[2];
		const isSelf = this.ircEq(nick, this._nick);

		const buf = this.getOrCreateBuffer('channel', 'channel', channel);

		if (isSelf) {
			buf.joined = true;
			this.emit('bufferUpdate', { buffer: buf, action: 'join' });
			// Request names and topic
			this.send(`MODE ${channel}`);
		}

		// Add user to nicklist
		const user: IrcUser = {
			nick,
			ident,
			host,
			modes: new Set(),
			account,
			realname
		};
		buf.users.set(this.normalizeNick(nick), user);

		const line = makeLine(
			'join',
			`${nick} (${ident}@${host}) has joined ${channel}`,
			nick,
			msg.tags,
			isSelf,
			serverTime
		);
		this.addLineToBuffer(buf, line);
		this.emit('nicklist', { buffer: channel, users: buf.users });
	}

	private handlePart(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick, ident, host } = parsePrefix(msg.prefix);
		const channel = msg.params[0] ?? '';
		const reason = msg.params[1] ?? '';
		const isSelf = this.ircEq(nick, this._nick);

		const buf = this.getOrCreateBuffer('channel', 'channel', channel);

		if (isSelf) {
			buf.joined = false;
			buf.users.clear();
		} else {
			buf.users.delete(this.normalizeNick(nick));
		}

		const text = reason
			? `${nick} (${ident}@${host}) has left ${channel} (${reason})`
			: `${nick} (${ident}@${host}) has left ${channel}`;

		const line = makeLine('part', text, nick, msg.tags, isSelf, serverTime);
		this.addLineToBuffer(buf, line);
		this.emit('nicklist', { buffer: channel, users: buf.users });
		this.emit('bufferUpdate', { buffer: buf, action: 'update' });
	}

	private handleQuit(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const reason = msg.params[0] ?? '';
		const isSelf = this.ircEq(nick, this._nick);

		// Remove from all channels
		for (const [, buf] of this.buffers) {
			if (buf.type === 'channel' && buf.users.has(this.normalizeNick(nick))) {
				buf.users.delete(this.normalizeNick(nick));
				const text = reason ? `${nick} has quit (${reason})` : `${nick} has quit`;
				const line = makeLine('quit', text, nick, msg.tags, isSelf, serverTime);
				this.addLineToBuffer(buf, line);
				this.emit('nicklist', { buffer: buf.name, users: buf.users });
			}
		}
	}

	private handleKick(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick: kicker } = parsePrefix(msg.prefix);
		const channel = msg.params[0] ?? '';
		const kicked = msg.params[1] ?? '';
		const reason = msg.params[2] ?? '';

		const isSelf = this.ircEq(kicked, this._nick);
		const buf = this.getOrCreateBuffer('channel', 'channel', channel);

		buf.users.delete(this.normalizeNick(kicked));
		if (isSelf) buf.joined = false;

		const text = reason
			? `${kicked} was kicked from ${channel} by ${kicker} (${reason})`
			: `${kicked} was kicked from ${channel} by ${kicker}`;

		const line = makeLine('kick', text, kicker, msg.tags, isSelf, serverTime);
		this.addLineToBuffer(buf, line);
		this.emit('nicklist', { buffer: channel, users: buf.users });
		this.emit('bufferUpdate', { buffer: buf, action: 'update' });
	}

	private handlePrivmsg(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const target = msg.params[0] ?? '';
		const text = msg.params[1] ?? '';
		const isSelf = this.ircEq(nick, this._nick);

		// Determine buffer target
		const isChannel = this.isChannelName(target);
		const bufTarget = isChannel ? target : isSelf ? target : nick;

		// CTCP handling
		if (text.startsWith('\x01') && text.endsWith('\x01')) {
			const ctcp = text.slice(1, -1);
			if (ctcp.startsWith('ACTION ')) {
				const actionText = ctcp.slice(7);
				const buf = this.getOrCreateBuffer(
					isChannel ? 'channel' : 'query',
					isChannel ? 'channel' : 'query',
					bufTarget
				);
				const line = makeLine('action', actionText, nick, msg.tags, isSelf, serverTime);
				this.addLineToBuffer(buf, line);
			} else {
				// Other CTCP — reply VERSION
				if (ctcp === 'VERSION') {
					this.notice(nick, '\x01VERSION DarkBear IRC client\x01');
				}
				if (ctcp === 'PING') {
					// Echo back (pass through CTCP ping)
					this.notice(nick, `\x01PING\x01`);
				}
			}
			return;
		}

		const buf = this.getOrCreateBuffer(
			isChannel ? 'channel' : 'query',
			isChannel ? 'channel' : 'query',
			bufTarget
		);
		const line = makeLine('message', text, nick, msg.tags, isSelf, serverTime);
		this.addLineToBuffer(buf, line);
	}

	private handleNotice(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		const prefix = msg.prefix ?? '';
		const { nick } = prefix.includes('!') ? parsePrefix(prefix) : { nick: prefix };
		const target = msg.params[0] ?? '';
		const text = msg.params[1] ?? '';
		const isSelf = this.ircEq(nick, this._nick);

		// CTCP notice
		if (text.startsWith('\x01') && text.endsWith('\x01')) {
			// Ignore CTCP replies for now
			return;
		}

		const isChannel = this.isChannelName(target);
		let bufTarget: string;

		if (isChannel) {
			bufTarget = target;
		} else {
			// Server notices go to server buffer
			bufTarget = nick && nick !== this._server ? nick : 'server';
		}

		const bufType = bufTarget === 'server' ? 'server' : isChannel ? 'channel' : 'query';
		const buf = this.getOrCreateBuffer(bufType, bufType, bufTarget);
		const line = makeLine('notice', text, nick || undefined, msg.tags, isSelf, serverTime);
		this.addLineToBuffer(buf, line);
	}

	private handleNick(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick: oldNick } = parsePrefix(msg.prefix);
		const newNick = msg.params[0] ?? '';
		const isSelf = this.ircEq(oldNick, this._nick);

		if (isSelf) {
			this._nick = newNick;
		}

		// Update in all channels
		for (const [, buf] of this.buffers) {
			if (buf.type === 'channel') {
				const key = this.normalizeNick(oldNick);
				const user = buf.users.get(key);
				if (user) {
					user.nick = newNick;
					buf.users.delete(key);
					buf.users.set(this.normalizeNick(newNick), user);

					const line = makeLine(
						'nick',
						`${oldNick} is now known as ${newNick}`,
						oldNick,
						msg.tags,
						isSelf,
						serverTime
					);
					this.addLineToBuffer(buf, line);
					this.emit('nicklist', { buffer: buf.name, users: buf.users });
				}
			}
		}
	}

	private handleMode(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		const target = msg.params[0] ?? '';
		const modeStr = msg.params[1] ?? '';
		const isChannel = this.isChannelName(target);

		if (isChannel) {
			const buf = this.getOrCreateBuffer('channel', 'channel', target);
			this.applyChannelModes(buf, msg.params.slice(1));

			const prefix = msg.prefix ?? '';
			const { nick } = prefix.includes('!') ? parsePrefix(prefix) : { nick: prefix };
			const modeArgs = msg.params.slice(2).join(' ');
			const text = modeArgs
				? `${nick} sets mode ${modeStr} ${modeArgs} on ${target}`
				: `${nick} sets mode ${modeStr} on ${target}`;

			const line = makeLine('mode', text, nick || undefined, msg.tags, false, serverTime);
			this.addLineToBuffer(buf, line);
			this.emit('nicklist', { buffer: target, users: buf.users });
			this.emit('bufferUpdate', { buffer: buf, action: 'update' });
		} else {
			// User mode change
			const buf = this.getOrCreateBuffer('server', 'server', this._server);
			const text = `Mode ${modeStr} set on ${target}`;
			this.addLineToBuffer(buf, makeLine('mode', text, undefined, msg.tags, false, serverTime));
		}
	}

	private handleTopic(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const channel = msg.params[0] ?? '';
		const topic = msg.params[1] ?? '';

		const buf = this.getOrCreateBuffer('channel', 'channel', channel);
		buf.topic = topic;
		buf.topicSetBy = nick;
		buf.topicSetAt = new Date();

		const text = topic
			? `${nick} changed the topic to: ${topic}`
			: `${nick} cleared the topic`;

		const line = makeLine('topic', text, nick, msg.tags, false, serverTime);
		this.addLineToBuffer(buf, line);
		this.emit('bufferUpdate', { buffer: buf, action: 'update' });
	}

	private handleAway(msg: ReturnType<typeof parseIRC>): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const awayMsg = msg.params[0] ?? '';

		// Update user in all channels
		for (const [, buf] of this.buffers) {
			if (buf.type === 'channel') {
				const user = buf.users.get(this.normalizeNick(nick));
				if (user) {
					user.away = awayMsg.length > 0;
				}
			}
		}
	}

	private handleChghost(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const newIdent = msg.params[0] ?? '';
		const newHost = msg.params[1] ?? '';

		for (const [, buf] of this.buffers) {
			if (buf.type === 'channel') {
				const user = buf.users.get(this.normalizeNick(nick));
				if (user) {
					user.ident = newIdent;
					user.host = newHost;
				}
			}
		}

		const buf = this.getOrCreateBuffer('server', 'server', this._server);
		this.addLineToBuffer(
			buf,
			makeLine('info', `${nick} changed host to ${newIdent}@${newHost}`, nick, msg.tags, false, serverTime)
		);
	}

	private handleSetname(msg: ReturnType<typeof parseIRC>, serverTime?: string): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const realname = msg.params[0] ?? '';

		for (const [, buf] of this.buffers) {
			if (buf.type === 'channel') {
				const user = buf.users.get(this.normalizeNick(nick));
				if (user) {
					user.realname = realname;
				}
			}
		}

		const isSelf = this.ircEq(nick, this._nick);
		if (isSelf) {
			const buf = this.getOrCreateBuffer('server', 'server', this._server);
			this.addLineToBuffer(
				buf,
				makeLine('info', `Your realname is now: ${realname}`, undefined, msg.tags, false, serverTime)
			);
		}
	}

	private handleAccount(msg: ReturnType<typeof parseIRC>): void {
		if (!msg.prefix) return;
		const { nick } = parsePrefix(msg.prefix);
		const account = msg.params[0] !== '*' ? msg.params[0] : undefined;

		for (const [, buf] of this.buffers) {
			if (buf.type === 'channel') {
				const user = buf.users.get(this.normalizeNick(nick));
				if (user) {
					user.account = account;
				}
			}
		}
	}

	private handleNames(params: string[]): void {
		// params: [nick, type, channel, :names...]
		const channel = params[2] ?? '';
		const names = (params[3] ?? '').split(' ').filter(Boolean);

		const buf = this.getOrCreateBuffer('channel', 'channel', channel);
		const prefixChars = new Set(this.isupport.PREFIX.values());

		for (const nameEntry of names) {
			let name = nameEntry;
			const userModes = new Set<string>();

			// Strip multi-prefix mode chars
			while (name.length > 0 && prefixChars.has(name[0])) {
				// Find the mode char for this prefix
				for (const [mode, prefix] of this.isupport.PREFIX) {
					if (prefix === name[0]) {
						userModes.add(mode);
					}
				}
				name = name.slice(1);
			}

			// userhost-in-names: nick!ident@host
			let nick = name;
			let ident = '';
			let host = '';
			if (name.includes('!')) {
				const parsed = parsePrefix(name);
				nick = parsed.nick;
				ident = parsed.ident;
				host = parsed.host;
			}

			const existing = buf.users.get(this.normalizeNick(nick));
			if (existing) {
				for (const m of userModes) existing.modes.add(m);
				if (ident) existing.ident = ident;
				if (host) existing.host = host;
			} else {
				buf.users.set(this.normalizeNick(nick), { nick, ident, host, modes: userModes });
			}
		}
	}

	private applyChannelModes(buf: IrcBuffer, modeParams: string[]): void {
		const modeStr = modeParams[0] ?? '';
		let paramIdx = 1;
		let adding = true;
		const prefixModes = new Set(this.isupport.PREFIX.keys());

		for (const ch of modeStr) {
			if (ch === '+') {
				adding = true;
			} else if (ch === '-') {
				adding = false;
			} else if (prefixModes.has(ch)) {
				// Nick mode
				const targetNick = modeParams[paramIdx++] ?? '';
				const user = buf.users.get(this.normalizeNick(targetNick));
				if (user) {
					if (adding) {
						user.modes.add(ch);
					} else {
						user.modes.delete(ch);
					}
				}
			} else if (this.isupport.CHANMODES.listModes.includes(ch)) {
				paramIdx++; // has param always
			} else if (this.isupport.CHANMODES.paramAlways.includes(ch)) {
				paramIdx++; // has param always
			} else if (this.isupport.CHANMODES.paramOnSet.includes(ch) && adding) {
				paramIdx++; // param only on set
			} else {
				// No param — channel mode
				if (adding) {
					buf.modes.add(ch);
				} else {
					buf.modes.delete(ch);
				}
			}
		}
	}

	// --- Buffer management ---

	private normalizeTarget(name: string): string {
		return name.toLowerCase();
	}

	private normalizeNick(nick: string): string {
		return nick.toLowerCase();
	}

	private ircEq(a: string, b: string): boolean {
		return a.toLowerCase() === b.toLowerCase();
	}

	private isChannelName(name: string): boolean {
		return this.isupport.CHANTYPES.some((c) => name.startsWith(c));
	}

	getOrCreateBuffer(
		_type: IrcBuffer['type'],
		type: IrcBuffer['type'],
		name: string
	): IrcBuffer {
		const key = this.normalizeTarget(name);
		let buf = this.buffers.get(key);
		if (!buf) {
			buf = {
				id: makeId(),
				type,
				name,
				messages: [],
				users: new Map(),
				unread: 0,
				mentioned: false,
				joined: type === 'server',
				modes: new Set()
			};
			this.buffers.set(key, buf);
			this.emit('bufferUpdate', { buffer: buf, action: 'create' });
		}
		return buf;
	}

	private addLineToBuffer(buf: IrcBuffer, line: IrcLine): void {
		buf.messages.push(line);
		if (buf.messages.length > MAX_MESSAGES) {
			buf.messages = buf.messages.slice(-MAX_MESSAGES);
		}
		this.emit('line', { buffer: buf.name, line });
	}

	/**
	 * Remove a buffer (used when closing a query or leaving a channel).
	 */
	removeBuffer(name: string): void {
		const key = this.normalizeTarget(name);
		const buf = this.buffers.get(key);
		if (buf) {
			this.buffers.delete(key);
			this.emit('bufferUpdate', { buffer: buf, action: 'delete' });
		}
	}
}

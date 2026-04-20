// WeeChat relay object types
export type WeeChatType = 'chr' | 'int' | 'lon' | 'str' | 'buf' | 'ptr' | 'tim' | 'htb' | 'hda' | 'inf' | 'inl' | 'arr';

export interface WeeChatMessage {
	length: number;
	compression: number;
	id: string;
	objects: WeeChatObject[];
}

export interface WeeChatObject {
	type: WeeChatType;
	value: unknown;
}

export interface HdataResult {
	hpath: string;
	keys: Record<string, WeeChatType>;
	count: number;
	items: HdataItem[];
}

export interface HdataItem {
	pointers: string[];
	objects: Record<string, unknown>;
}

export interface WeeChatBuffer {
	id: string;          // pointer
	name: string;        // e.g. "irc.server.libera" or "irc.#channel"
	fullName: string;
	shortName: string;
	title: string;
	number: number;
	type: number;        // 0=formatted, 1=free
	nicksCount: number;
	localVars: Record<string, string>;
	notify: number;
	hidden: boolean;
}

export interface WeeChatLine {
	id: string;
	buffer: string;      // pointer
	date: Date;
	datePrinted: Date;
	displayed: boolean;
	highlight: boolean;
	tags: string[];
	prefix: string;      // formatted nick prefix
	message: string;     // formatted message
	// parsed WeeChat flags
	nick?: string;
	isAction?: boolean;
	isSelf?: boolean;
	isNotice?: boolean;
	isJoin?: boolean;
	isPart?: boolean;
	isQuit?: boolean;
	isNick?: boolean;
	isTopic?: boolean;
	isMode?: boolean;
	isTagMsg?: boolean;   // IRCv3 TAGMSG (typing, reactions)
	isWhisper?: boolean;  // IRCx WHISPER
	// IRCv3 tags
	ircTags: Map<string, string>;
	msgid?: string;       // msgid= tag
	replyTo?: string;     // +reply= tag (msgid of original message)
	account?: string;     // account= tag
}

export interface WeeChatNick {
	id: string;
	pointer: string;
	level: number;
	name: string;
	color: string;
	prefix: string;
	prefixColor: string;
	visible: boolean;
	group?: boolean;
}

export interface WeeChatHotlist {
	buffer: string;  // pointer
	count: [number, number, number, number]; // low, message, private, highlight
}

export const enum ConnectionState {
	DISCONNECTED = 'disconnected',
	CONNECTING = 'connecting',
	AUTHENTICATING = 'authenticating',
	CONNECTED = 'connected',
	RECONNECTING = 'reconnecting',
	ERROR = 'error',
}

export interface RelaySettings {
	host: string;
	port: number;
	password: string;
	tls: boolean;
	compression: boolean;
}

// WeeChat/IRC text formatter — converts WeeChat color codes and IRC markup to safe HTML

// IRC color index → hex value
const IRC_COLORS: Record<number, string> = {
	0:  '#ffffff',
	1:  '#000000',
	2:  '#00007f',
	3:  '#009300',
	4:  '#ff0000',
	5:  '#7f0000',
	6:  '#9c009c',
	7:  '#fc7f00',
	8:  '#ffff00',
	9:  '#00fc00',
	10: '#009393',
	11: '#00ffff',
	12: '#0000fc',
	13: '#ff00ff',
	14: '#7f7f7f',
	15: '#d2d2d2'
};

// Build extended 256-color palette (xterm-256)
function buildExtended(): string[] {
	const out: string[] = new Array(256);

	// 0-15: IRC/standard colors (already defined above, but we fill them here too)
	const base: [number, number, number][] = [
		[255,255,255],[0,0,0],[0,0,127],[0,147,0],[255,0,0],[127,0,0],
		[156,0,156],[252,127,0],[255,255,0],[0,252,0],[0,147,147],[0,255,255],
		[0,0,252],[255,0,255],[127,127,127],[210,210,210]
	];
	for (let i = 0; i < 16; i++) {
		const [r, g, b] = base[i];
		out[i] = `rgb(${r},${g},${b})`;
	}

	// 16-231: 6×6×6 color cube
	for (let i = 16; i < 232; i++) {
		const n = i - 16;
		const b = n % 6;
		const g = Math.floor(n / 6) % 6;
		const r = Math.floor(n / 36);
		const toV = (v: number) => v === 0 ? 0 : 55 + v * 40;
		out[i] = `rgb(${toV(r)},${toV(g)},${toV(b)})`;
	}

	// 232-255: grayscale
	for (let i = 232; i < 256; i++) {
		const v = 8 + (i - 232) * 10;
		out[i] = `rgb(${v},${v},${v})`;
	}

	return out;
}

const EXTENDED_COLORS = buildExtended();

function colorStyle(index: number): string {
	if (index >= 0 && index < 16 && IRC_COLORS[index]) return IRC_COLORS[index];
	if (index >= 0 && index < 256) return EXTENDED_COLORS[index];
	return '';
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?[^\s]*)?$/i;
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

interface Segment {
	type: 'text' | 'url' | 'image';
	value: string;
}

function tokenizeUrls(text: string): Segment[] {
	const segs: Segment[] = [];
	let last = 0;
	URL_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = URL_RE.exec(text)) !== null) {
		if (m.index > last) segs.push({ type: 'text', value: text.slice(last, m.index) });
		const url = m[0];
		segs.push({ type: IMAGE_EXT.test(url) ? 'image' : 'url', value: url });
		last = m.index + url.length;
	}
	if (last < text.length) segs.push({ type: 'text', value: text.slice(last) });
	return segs;
}

interface FmtState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	reverse: boolean;
	fg: string | null;
	bg: string | null;
}

function stateHasFormatting(s: FmtState): boolean {
	return s.bold || s.italic || s.underline || s.reverse || s.fg !== null || s.bg !== null;
}

function openTag(s: FmtState): string {
	if (!stateHasFormatting(s)) return '';
	const parts: string[] = [];
	if (s.bold) parts.push('font-weight:bold');
	if (s.italic) parts.push('font-style:italic');
	if (s.underline) parts.push('text-decoration:underline');
	if (s.reverse) {
		// Swap fg/bg visually — approximate with a CSS filter
		const fg = s.fg ?? '#e0e0e0';
		const bg = s.bg ?? '#1a1a1a';
		parts.push(`color:${bg};background-color:${fg}`);
	} else {
		if (s.fg) parts.push(`color:${s.fg}`);
		if (s.bg) parts.push(`background-color:${s.bg}`);
	}
	return `<span style="${parts.join(';')}">`;
}

function resetState(): FmtState {
	return { bold: false, italic: false, underline: false, reverse: false, fg: null, bg: null };
}

// Parse up to 2 decimal digits starting at position i in str
function parseDigits(str: string, i: number): [number | null, number] {
	if (i >= str.length || !/\d/.test(str[i])) return [null, i];
	let s = str[i++];
	if (i < str.length && /\d/.test(str[i])) s += str[i++];
	return [parseInt(s, 10), i];
}

// Parse a WeeChat color number: may be 1-2 digits, or 3 digits for index 16-255, or "F"/"B"/"*"
function parseWeeChatColor(str: string, i: number): [number | null, number] {
	if (i >= str.length) return [null, i];
	const ch = str[i];
	if (ch === 'F' || ch === 'B' || ch === '*') return [null, i]; // handled by caller
	// Up to 5 decimal digits for extended colors
	let s = '';
	let j = i;
	while (j < str.length && /\d/.test(str[j]) && s.length < 5) {
		s += str[j++];
	}
	if (s.length === 0) return [null, i];
	return [parseInt(s, 10), j];
}

function applyFormatting(text: string): string {
	let state = resetState();
	let out = '';
	let spanOpen = false;
	let i = 0;

	const close = () => {
		if (spanOpen) { out += '</span>'; spanOpen = false; }
	};

	const open = () => {
		const tag = openTag(state);
		if (tag) { out += tag; spanOpen = true; }
	};

	while (i < text.length) {
		const code = text.charCodeAt(i);

		// \x02 — bold toggle
		if (code === 0x02) {
			close(); state.bold = !state.bold; open(); i++; continue;
		}

		// \x1d or \x1c — italic toggle (WeeChat uses \x1c, IRC uses \x1d)
		if (code === 0x1d || code === 0x1c) {
			close(); state.italic = !state.italic; open(); i++; continue;
		}

		// \x1f — underline toggle
		if (code === 0x1f) {
			close(); state.underline = !state.underline; open(); i++; continue;
		}

		// \x16 — reverse toggle
		if (code === 0x16) {
			close(); state.reverse = !state.reverse; open(); i++; continue;
		}

		// \x0f — reset all
		if (code === 0x0f || code === 0x1b) {
			close(); state = resetState(); i++; continue;
		}

		// \x03 — IRC color code
		if (code === 0x03) {
			close();
			i++;
			const [fg, afterFg] = parseDigits(text, i);
			if (fg === null) {
				// Reset colors
				state.fg = null;
				state.bg = null;
			} else {
				i = afterFg;
				state.fg = colorStyle(fg);
				if (i < text.length && text[i] === ',') {
					const saved = i;
					i++; // skip comma
					const [bg, afterBg] = parseDigits(text, i);
					if (bg !== null) {
						state.bg = colorStyle(bg);
						i = afterBg;
					} else {
						i = saved; // no bg digits — backtrack past comma
					}
				}
			}
			open(); continue;
		}

		// \x19 — WeeChat color escape
		if (code === 0x19) {
			close();
			i++;
			if (i >= text.length) break;
			const next = text[i];
			const nextCode = text.charCodeAt(i);

			if (next === 'F') {
				// Reset fg
				i++;
				state.fg = null;
			} else if (next === 'B') {
				// Reset bg
				i++;
				state.bg = null;
			} else if (next === '*') {
				// Reset all colors
				i++;
				state.fg = null;
				state.bg = null;
			} else if (next === 'b') {
				// Set background only: \x19bNN
				i++;
				const [bg, afterBg] = parseWeeChatColor(text, i);
				if (bg !== null) { state.bg = colorStyle(bg); i = afterBg; }
			} else if (/\d/.test(next)) {
				// \x19NN or \x19NN,MM
				const [fg, afterFg] = parseWeeChatColor(text, i);
				if (fg !== null) {
					i = afterFg;
					state.fg = colorStyle(fg);
					if (i < text.length && text[i] === ',') {
						const saved = i;
						i++;
						const [bg, afterBg] = parseWeeChatColor(text, i);
						if (bg !== null) {
							state.bg = colorStyle(bg);
							i = afterBg;
						} else {
							i = saved;
						}
					}
				}
			} else if (nextCode >= 0x20) {
				// Single-byte WeeChat attribute — skip it
				i++;
			}
			open(); continue;
		}

		// \x1a — bold start (WeeChat)
		if (code === 0x1a) {
			close(); state.bold = true; open(); i++; continue;
		}

		// Regular character — append as-is (already HTML-escaped by caller)
		out += text[i];
		i++;
	}

	close();
	return out;
}

export function formatWeeChatText(
	text: string,
	options?: { inlineImages?: boolean; maxImageWidth?: number }
): string {
	const inlineImages = options?.inlineImages ?? false;
	const maxWidth = options?.maxImageWidth ?? 400;

	// Tokenize URLs first (before escaping, to preserve raw URLs)
	const segments = tokenizeUrls(text);
	let result = '';

	for (const seg of segments) {
		if (seg.type === 'text') {
			// Escape HTML, then apply formatting codes
			const escaped = escapeHtml(seg.value);
			result += applyFormatting(escaped);
		} else if (seg.type === 'url') {
			const escaped = escapeHtml(seg.value);
			result += `<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="chat-link">${escaped}</a>`;
		} else {
			// image
			const escaped = escapeHtml(seg.value);
			if (inlineImages) {
				const widthAttr = maxWidth ? ` style="max-width:${maxWidth}px"` : '';
				result +=
					`<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="chat-link chat-image-link">` +
					`<img src="${escaped}" alt="${escaped}" class="chat-inline-image" loading="lazy"${widthAttr}/>` +
					`</a>`;
			} else {
				result += `<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="chat-link">${escaped}</a>`;
			}
		}
	}

	return result;
}

// Strip all formatting codes for plain-text use (notifications, titles, etc.)
export function stripFormatting(text: string): string {
	return text
		// eslint-disable-next-line no-control-regex
		.replace(/[\x02\x03\x0f\x16\x1a\x1b\x1c\x1d\x1f](\d{1,2}(,\d{1,2})?)?/g, '')
		// eslint-disable-next-line no-control-regex
		.replace(/\x19[FBb*]?[\d,]*/g, '');
}

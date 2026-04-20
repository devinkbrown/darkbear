<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';
  import { nickColor } from '$lib/irc/formatter.js';

  interface Props {
    nick: string;
    bufferPointer: string;
    onclose: () => void;
  }
  const { nick, bufferPointer, onclose }: Props = $props();

  // ── Derived info from what we already know ─────────────────────────────────

  // Scan message history for account tag from this nick
  const knownAccount = $derived.by(() => {
    const entry = buffers.buffers.get(bufferPointer);
    if (!entry) return '';
    for (let i = entry.lines.length - 1; i >= 0; i--) {
      const l = entry.lines[i];
      if (l.nick === nick && l.account) return l.account;
      if (l.nick === nick && l.ircTags.get('account')) return l.ircTags.get('account')!;
    }
    return '';
  });

  // Find nick in any buffer's nick list for mode prefix + host
  const nickEntry = $derived.by(() => {
    for (const entry of buffers.buffers.values()) {
      const n = entry.nicks.get(nick);
      if (n) return n;
    }
    return null;
  });

  // Channels the nick is in (that we can see)
  const sharedChannels = $derived.by(() => {
    const chans: string[] = [];
    for (const entry of buffers.buffers.values()) {
      if (entry.buffer.localVars['type'] !== 'channel') continue;
      if (entry.nicks.has(nick)) {
        chans.push(entry.buffer.shortName || entry.buffer.name);
      }
    }
    return chans;
  });

  // ── WHOIS ──────────────────────────────────────────────────────────────────

  interface WhoisData {
    realname?: string;
    ident?: string;
    host?: string;
    server?: string;
    away?: string;
    oper?: boolean;
    secure?: boolean;
    account?: string;
    idle?: string;
    channels?: string;
    signonRaw?: string;
  }

  let whois = $state<WhoisData>({});
  let whoisDone = $state(false);
  let whoisPending = $state(true);

  // Find server buffer to watch for whois responses
  function serverBufferPointer(): string | null {
    for (const entry of buffers.buffers.values()) {
      if (entry.buffer.localVars['type'] === 'server') return entry.buffer.id;
    }
    return null;
  }

  // Parse a WeeChat-formatted WHOIS line about `nick`
  function parseWhoisLine(msg: string): Partial<WhoisData> | null {
    // WeeChat formats: "[nick] (...)" or "[nick] is ..."
    const prefix = `[${nick}]`;
    if (!msg.includes(nick)) return null;

    // Strip IRC color codes for matching
    const plain = msg.replace(/\x02|\x03(\d{1,2}(,\d{1,2})?)?|\x0f|\x1d|\x1f|\x16|\x1e/g, '');

    // 311 RPL_WHOISUSER — [nick] (ident@host): Real Name
    let m = plain.match(/\[.+?\]\s+\(([^@]+)@([^)]+)\):\s*(.+)/);
    if (m) return { ident: m[1], host: m[2], realname: m[3] };

    // 312 RPL_WHOISSERVER
    m = plain.match(/\[.+?\]\s+(.+?)\s*:/);
    if (m && plain.includes('.') && !plain.includes('idle') && !plain.includes('channel') && !plain.includes('logged')) {
      // ambiguous — skip unless clearly a server line
    }

    // 301 RPL_AWAY
    m = plain.match(/\[.+?\]\s+is away:\s*(.+)/i);
    if (m) return { away: m[1] };

    // 313 RPL_WHOISOPERATOR
    if (plain.match(/\[.+?\].*is an IRC (operator|oper)/i)) return { oper: true };

    // 671 RPL_WHOISSECURE
    if (plain.match(/\[.+?\].*secure connection/i)) return { secure: true };

    // 317 RPL_WHOISIDLE — idle: Xd Xh Xm Xs
    m = plain.match(/\[.+?\]\s+idle:\s*([^,]+)/i);
    if (m) return { idle: m[1].trim() };

    // 319 RPL_WHOISCHANNELS
    m = plain.match(/\[.+?\]\s+(?:is in channels?|channels?):\s*(.+)/i);
    if (m) return { channels: m[1].trim() };

    // 330 RPL_WHOISACCOUNT
    m = plain.match(/\[.+?\]\s+is logged in as\s+(\S+)/i);
    if (m) return { account: m[1] };

    return null;
  }

  // Watch for new lines arriving in any buffer while whois is pending
  let prevLineCounts = new Map<string, number>();
  $effect(() => {
    if (!whoisPending) return;
    for (const [ptr, entry] of buffers.buffers) {
      const prev = prevLineCounts.get(ptr) ?? entry.lines.length;
      const cur = entry.lines.length;
      if (cur > prev) {
        const newLines = entry.lines.slice(prev);
        for (const line of newLines) {
          if (!line.message) continue;
          const parsed = parseWhoisLine(line.message);
          if (parsed) {
            whois = { ...whois, ...parsed };
          }
          // End of WHOIS
          if (line.message.includes('End of') && line.message.toLowerCase().includes('whois')) {
            whoisDone = true;
            whoisPending = false;
          }
        }
      }
      prevLineCounts.set(ptr, cur);
    }
  });

  onMount(() => {
    // Snapshot current line counts so we only process new lines
    for (const [ptr, entry] of buffers.buffers) {
      prevLineCounts.set(ptr, entry.lines.length);
    }
    // Send WHOIS — double nick for extended info
    chat.sendTo(bufferPointer, `/quote WHOIS ${nick} ${nick}`);
    // Timeout if no response
    const t = setTimeout(() => { whoisPending = false; }, 8000);
    return () => clearTimeout(t);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function mention() {
    window.dispatchEvent(new CustomEvent('insert-text', { detail: nick + ': ' }));
    onclose();
  }

  function openPm() {
    // Switch to an existing PM buffer immediately if one exists
    for (const [id, entry] of buffers.buffers) {
      const btype = entry.buffer.localVars['type'];
      const channel = (entry.buffer.localVars['channel'] ?? '').toLowerCase();
      const short   = (entry.buffer.shortName || entry.buffer.name).toLowerCase();
      if (btype === 'private' && (channel === nick.toLowerCase() || short === nick.toLowerCase())) {
        chat.setActive(id);
        onclose();
        return;
      }
    }
    // No existing PM buffer — ask WeeChat to open one; chat store will auto-switch when it opens
    chat.openQuery(nick);
    onclose();
  }

  function initial(n: string) { return n[0]?.toUpperCase() ?? '?'; }

  // Derive a background colour from the nick colour (which returns a hex/name)
  function avatarStyle(n: string) {
    const c = nickColor(n);
    return `background: ${c}22; border: 1.5px solid ${c}55; color: ${c};`;
  }

  const displayAccount = $derived(whois.account || knownAccount);
  const displayHost    = $derived(whois.host ? `${whois.ident ?? '~'}@${whois.host}` : '');
  const modePrefix     = $derived(nickEntry?.prefix?.trim() ?? '');
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  role="presentation"
  class="fixed inset-0 z-40"
  transition:fade={{ duration: 150 }}
  onclick={onclose}
></div>

<!-- Panel -->
<div
  class="fixed top-0 right-0 h-full w-72 max-w-[85vw] z-50 flex flex-col
         bg-gray-900 border-l border-white/[0.07] shadow-2xl shadow-black/60"
  transition:fly={{ x: 288, duration: 220, easing: cubicOut }}
>
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Profile</span>
    <button onclick={onclose} aria-label="Close" class="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded">
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 4l8 8M12 4l-8 8"/>
      </svg>
    </button>
  </div>

  <!-- Body -->
  <div class="flex-1 overflow-y-auto">

    <!-- Avatar + nick -->
    <div class="flex flex-col items-center gap-3 px-4 py-6 border-b border-white/[0.05]">
      <div
        class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold select-none"
        style={avatarStyle(nick)}
      >{initial(nick)}</div>

      <div class="text-center">
        <div class="flex items-center gap-1.5 justify-center">
          {#if modePrefix}
            <span class="text-xs font-mono text-yellow-400/80 leading-none">{modePrefix}</span>
          {/if}
          <span class="text-lg font-semibold text-gray-100">{nick}</span>
        </div>
        {#if whois.realname}
          <div class="text-sm text-gray-400 mt-0.5">{whois.realname}</div>
        {/if}
        {#if whois.away}
          <div class="flex items-center gap-1.5 justify-center mt-1.5">
            <span class="w-2 h-2 rounded-full bg-yellow-500/70 flex-shrink-0"></span>
            <span class="text-xs text-yellow-400/80 italic">{whois.away}</span>
          </div>
        {:else if !whoisPending}
          <div class="flex items-center gap-1.5 justify-center mt-1.5">
            <span class="w-2 h-2 rounded-full bg-green-500/70 flex-shrink-0"></span>
            <span class="text-xs text-green-400/70">Online</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Info rows -->
    <div class="px-4 py-3 flex flex-col gap-3">

      {#if displayAccount}
        <div class="flex flex-col gap-0.5">
          <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Account</span>
          <span class="text-sm text-blue-300 font-mono">{displayAccount}</span>
        </div>
      {/if}

      {#if displayHost}
        <div class="flex flex-col gap-0.5">
          <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Host</span>
          <span class="text-xs text-gray-400 font-mono break-all">{displayHost}</span>
        </div>
      {/if}

      {#if whois.idle}
        <div class="flex flex-col gap-0.5">
          <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Idle</span>
          <span class="text-sm text-gray-400">{whois.idle}</span>
        </div>
      {/if}

      {#if whois.oper || whois.secure}
        <div class="flex gap-2 flex-wrap">
          {#if whois.oper}
            <span class="px-2 py-0.5 rounded-full text-[11px] bg-yellow-500/15 text-yellow-300 border border-yellow-500/20">IRC Operator</span>
          {/if}
          {#if whois.secure}
            <span class="px-2 py-0.5 rounded-full text-[11px] bg-green-500/15 text-green-300 border border-green-500/20">Secure</span>
          {/if}
        </div>
      {/if}

      {#if sharedChannels.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Shared channels</span>
          <div class="flex flex-wrap gap-1">
            {#each sharedChannels as chan}
              <button
                onclick={() => {
                  const e = buffers.findByShortName(chan);
                  if (e) chat.setActive(e.buffer.id);
                  onclose();
                }}
                class="px-2 py-0.5 rounded-full text-[11px] bg-gray-800 text-gray-300 border border-white/[0.07] hover:bg-gray-700 transition-colors"
              >{chan}</button>
            {/each}
          </div>
        </div>
      {:else if whois.channels}
        <div class="flex flex-col gap-1">
          <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Channels</span>
          <span class="text-xs text-gray-400 font-mono break-words">{whois.channels}</span>
        </div>
      {/if}

      {#if whoisPending}
        <div class="flex items-center gap-2 text-xs text-gray-600 py-1">
          <span class="w-3 h-3 border border-gray-600 border-t-gray-400 rounded-full animate-spin inline-block flex-shrink-0"></span>
          Fetching WHOIS…
        </div>
      {/if}

    </div>
  </div>

  <!-- Actions -->
  <div class="px-4 py-3 border-t border-white/[0.06] flex flex-col gap-2 shrink-0">
    <button
      onclick={openPm}
      class="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium transition-colors"
    >Message</button>
    <button
      onclick={mention}
      class="w-full py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
    >Mention</button>
  </div>
</div>

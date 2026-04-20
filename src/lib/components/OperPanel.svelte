<script lang="ts">
  import { chat } from '$lib/stores/chat.svelte.js';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  interface Props { onclose?: () => void; }
  const { onclose }: Props = $props();

  type Tab = 'actions' | 'bans' | 'server' | 'network' | 'accounts' | 'ircx' | 'debug';
  let activeTab = $state<Tab>('actions');

  // Form state
  let killNick = $state(''); let killReason = $state('');
  let gagNick = $state('');
  let chghostNick = $state(''); let chghostHost = $state('');
  let opforceAction = $state<'JOIN'|'OP'|'KICK'|'MODE'|'CLOSE'>('JOIN');
  let opforceChan = $state(''); let opforceTarget = $state(''); let opforceArg = $state('');
  let banMask = $state(''); let banDur = $state('0'); let banReason = $state('');
  let unbanMask = $state('');
  let xlineGecos = $state(''); let xlineReason = $state('');
  let dlineMask = $state(''); let dlineDur = $state('0'); let dlineReason = $state('');
  let sfPattern = $state(''); let sfAction = $state('kill'); let sfReason = $state('');
  let connectServer = $state(''); let connectPort = $state('6667');
  let squitServer = $state(''); let squitReason = $state('Delinked');
  let jupeServer = $state(''); let jupeReason = $state('');
  let unjupeServer = $state('');
  let statsType = $state('u');
  let rehashOption = $state('');
  let wallopsMsg = $state(''); let operwallMsg = $state('');
  let snoteFlag = $state(''); let snoteMsg = $state('');
  let traceMask = $state('');
  let testlineMask = $state(''); let testmaskMask = $state('');
  let masktraceUserhost = $state('');
  let suspendNick = $state('');
  let forbidNick = $state(''); let forbidReason = $state('');
  let setaccNick = $state(''); let setaccAccount = $state('');
  let acreateAccount = $state(''); let acreatePass = $state('');
  let propTarget = $state(''); let propName = $state(''); let propValue = $state('');
  let accessTarget = $state(''); let accessLevel = $state(''); let accessMask = $state('');
  let whisperChan = $state(''); let whisperNick = $state(''); let whisperMsg = $state('');
  let modexTarget = $state(''); let modexModes = $state('');
  let vhostNick = $state(''); let vhostHost = $state('');
  let debugLevel = $state('3');

  // Command log
  let cmdLog = $state<{ cmd: string; ts: number }[]>([]);

  function send(cmd: string) {
    chat.sendInput(cmd);
    cmdLog = [{ cmd, ts: Date.now() }, ...cmdLog.slice(0, 19)];
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'actions',  label: 'Actions',  icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'bans',     label: 'Bans',     icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
    { id: 'server',   label: 'Server',   icon: 'M5 12H3m18 0h-2M12 5V3m0 18v-2m4.95-13.95l-1.41 1.41M7.46 16.54l-1.41 1.41M19.95 16.54l-1.41-1.41M7.46 7.46L6.05 6.05M12 8a4 4 0 100 8 4 4 0 000-8z' },
    { id: 'network',  label: 'Network',  icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'accounts', label: 'Accounts', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'ircx',     label: 'IRCx',     icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { id: 'debug',    label: 'Debug',    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  ];

  // Styling helpers
  const I = 'w-full bg-gray-900 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20 transition-colors placeholder-gray-600';
  const SI = 'bg-gray-900 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/70 transition-colors placeholder-gray-600';
  const SEL = 'bg-gray-900 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/70 transition-colors';

  function btn(variant: 'default'|'danger'|'warn'|'blue'|'green' = 'default') {
    const base = 'px-4 py-2 text-xs font-semibold rounded-lg transition-all active:scale-95 flex-shrink-0 whitespace-nowrap';
    const variants = {
      default: 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/60',
      danger:  'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30',
      warn:    'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30',
      blue:    'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30',
      green:   'bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30',
    };
    return `${base} ${variants[variant]}`;
  }

  const card = 'bg-gray-900/60 border border-gray-700/40 rounded-xl p-4 flex flex-col gap-3';
  const cardTitle = 'text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2';
  const row = 'flex items-center gap-2 flex-wrap';
  const lbl = 'text-xs text-gray-500 flex-shrink-0 min-w-[3rem]';
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div role="presentation" class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
  transition:fade={{ duration: 150 }}
  onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }}
>
  <!-- Panel -->
  <div
    class="absolute top-0 right-0 h-full flex flex-col bg-gray-950 border-l border-white/[0.06] shadow-2xl shadow-black/80"
    style="width: min(680px, 100vw);"
    transition:fly={{ x: 680, duration: 280, easing: cubicOut }}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >

    <!-- ── Header ── -->
    <div class="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
      <!-- Crown icon — red for admin, amber for oper -->
      <div class="relative flex-shrink-0">
        {#if chat.isAdmin}
          <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/30">
            <svg class="w-5 h-5 text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 19h20M2 19l3-9 5 4 2-7 2 7 5-4 3 9"/>
              <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="19.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <span class="absolute -bottom-1 -right-1 text-[8px] font-black bg-red-500 text-white rounded px-0.5 leading-tight tracking-tight">ADM</span>
        {:else}
          <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20">
            <svg class="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 19h20M2 19l3-9 5 4 2-7 2 7 5-4 3 9"/>
              <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="19.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
        {/if}
      </div>

      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-gray-100 flex items-center gap-2">
          Oper Console
          {#if chat.isAdmin}
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">SERVER ADMINISTRATOR</span>
          {:else if chat.isOper}
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">IRC OPERATOR</span>
          {:else}
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">NOT OPERED</span>
          {/if}
        </div>
        <div class="text-[11px] text-gray-600 mt-0.5">Administrative controls</div>
      </div>

      <button onclick={onclose} aria-label="Close"
        class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors flex-shrink-0">
        <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 3l10 10M13 3L3 13"/>
        </svg>
      </button>
    </div>

    <!-- ── Body: sidebar tabs + content ── -->
    <div class="flex flex-1 min-h-0">

      <!-- Sidebar tabs -->
      <nav class="flex flex-col gap-0.5 p-2 border-r border-white/[0.05] shrink-0 w-[52px] sm:w-36 overflow-y-auto">
        {#each tabs as tab (tab.id)}
          <button
            onclick={() => (activeTab = tab.id)}
            class="flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-left transition-colors group
              {activeTab === tab.id
                ? 'bg-white/[0.08] text-gray-100'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}"
          >
            <svg class="w-4 h-4 flex-shrink-0 {activeTab === tab.id ? 'text-blue-400' : 'text-gray-600 group-hover:text-gray-400'}"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d={tab.icon}/>
            </svg>
            <span class="hidden sm:block text-xs font-medium truncate">{tab.label}</span>
          </button>
        {/each}

        <!-- Command log toggle -->
        <div class="mt-auto pt-2 border-t border-white/[0.05]">
          <button
            onclick={() => (activeTab = activeTab === ('log' as Tab) ? 'actions' : ('log' as Tab))}
            class="flex items-center gap-2.5 px-2 py-2.5 rounded-lg w-full transition-colors
              {activeTab === ('log' as Tab) ? 'bg-white/[0.08] text-gray-100' : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.04]'}"
            title="Command log"
          >
            <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <span class="hidden sm:flex items-center gap-1.5 text-xs font-medium">
              Log
              {#if cmdLog.length > 0}
                <span class="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[9px] flex items-center justify-center font-bold">{cmdLog.length > 9 ? '9+' : cmdLog.length}</span>
              {/if}
            </span>
          </button>
        </div>
      </nav>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-w-0">

        {#if activeTab === 'actions'}

          <!-- Kill -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
              Kill User
            </div>
            <div class={row}>
              <span class={lbl}>Nick</span>
              <input class="{SI} flex-1" bind:value={killNick} placeholder="nickname" />
            </div>
            <div class={row}>
              <span class={lbl}>Reason</span>
              <input class="{SI} flex-1" bind:value={killReason} placeholder="Kill reason" />
              <button class={btn('danger')} onclick={() => { if (killNick) { send(`/KILL ${killNick} ${killReason || 'No reason'}`); killNick = ''; killReason = ''; }}}>Kill</button>
            </div>
          </div>

          <!-- CHGHOST / VHOST -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
              Host Masking
            </div>
            <div class={row}>
              <span class={lbl}>CHGHOST</span>
              <input class="{SI} flex-1" bind:value={chghostNick} placeholder="nick" />
              <input class="{SI} flex-1" bind:value={chghostHost} placeholder="new.host" />
              <button class={btn('blue')} onclick={() => { if (chghostNick && chghostHost) { send(`/CHGHOST ${chghostNick} ${chghostHost}`); chghostNick = ''; chghostHost = ''; }}}>Set</button>
            </div>
            <div class={row}>
              <span class={lbl}>VHOST</span>
              <input class="{SI} flex-1" bind:value={vhostNick} placeholder="nick" />
              <input class="{SI} flex-1" bind:value={vhostHost} placeholder="vhost.mask" />
              <button class={btn('blue')} onclick={() => { if (vhostNick && vhostHost) { send(`/VHOST ${vhostNick} ${vhostHost}`); vhostNick = ''; vhostHost = ''; }}}>Set</button>
            </div>
          </div>

          <!-- Gag -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Gag / Silence
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={gagNick} placeholder="nick!user@host" />
              <button class={btn('warn')} onclick={() => { if (gagNick) send(`/GAG ${gagNick} ON`); }}>Gag</button>
              <button class={btn()} onclick={() => { if (gagNick) { send(`/GAG ${gagNick} OFF`); gagNick = ''; }}}>Ungag</button>
              <button class={btn()} onclick={() => send('/GAG LIST')}>List</button>
            </div>
          </div>

          <!-- OpForce -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              OpForce
            </div>
            <div class={row}>
              <select class={SEL} bind:value={opforceAction}>
                {#each ['JOIN','OP','KICK','MODE','CLOSE'] as a}<option>{a}</option>{/each}
              </select>
              <input class="{SI} w-28" bind:value={opforceChan} placeholder="#channel" />
              <input class="{SI} flex-1" bind:value={opforceTarget} placeholder="target / modes" />
              <input class="{SI} w-20" bind:value={opforceArg} placeholder="arg" />
              <button class={btn('warn')} onclick={() => {
                if (opforceChan) {
                  const parts = [opforceAction, opforceChan, opforceTarget, opforceArg].filter(Boolean);
                  send(`/OPFORCE ${parts.join(' ')}`);
                }
              }}>Force</button>
            </div>
          </div>

          <!-- Quick actions -->
          <div class="flex flex-wrap gap-2">
            <button class={btn()} onclick={() => send('/GOPER')}>GOPER</button>
            <button class={btn()} onclick={() => send('/MAP')}>MAP</button>
            <button class={btn()} onclick={() => send('/LINKS')}>LINKS</button>
            <button class={btn()} onclick={() => send('/LUSERS')}>LUSERS</button>
            <button class={btn()} onclick={() => send('/PRIVS')}>PRIVS</button>
            <button class={btn()} onclick={() => send('/MOTD')}>MOTD</button>
          </div>

        {:else if activeTab === 'bans'}

          <!-- K/G/Z-Line -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Ban Lines
            </div>
            <div class={row}>
              <span class={lbl}>Mask</span>
              <input class="{SI} flex-1" bind:value={banMask} placeholder="nick!user@host" />
              <span class="text-xs text-gray-500 flex-shrink-0">Dur (min)</span>
              <input class="{SI} w-16" type="number" bind:value={banDur} min="0" />
            </div>
            <div class={row}>
              <span class={lbl}>Reason</span>
              <input class="{I}" bind:value={banReason} placeholder="ban reason" />
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class={btn('danger')} onclick={() => { if (banMask) send(`/BAN KLINE ${banDur} ${banMask} :${banReason || 'No reason'}`); }}>K-Line</button>
              <button class={btn('danger')} onclick={() => { if (banMask) send(`/BAN GLINE ${banDur} ${banMask} :${banReason || 'No reason'}`); }}>G-Line</button>
              <button class={btn('danger')} onclick={() => { if (banMask) send(`/BAN ZLINE ${banDur} ${banMask} :${banReason || 'No reason'}`); }}>Z-Line</button>
            </div>
          </div>

          <!-- D-Line -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              D-Line (IP ban)
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={dlineMask} placeholder="1.2.3.4 or CIDR" />
              <input class="{SI} w-16" type="number" bind:value={dlineDur} min="0" placeholder="min" />
              <input class="{SI} flex-1" bind:value={dlineReason} placeholder="reason" />
              <button class={btn('danger')} onclick={() => { if (dlineMask) send(`/DLINE ${dlineDur} ${dlineMask} :${dlineReason || 'No reason'}`); }}>D-Line</button>
            </div>
          </div>

          <!-- X-Line -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/></svg>
              X-Line (GECOS)
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={xlineGecos} placeholder="realname pattern" />
              <input class="{SI} flex-1" bind:value={xlineReason} placeholder="reason" />
              <button class={btn('warn')} onclick={() => { if (xlineGecos) send(`/XLINE ${xlineGecos} :${xlineReason || 'No reason'}`); }}>X-Line</button>
            </div>
          </div>

          <!-- Remove bans -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Remove Bans
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={unbanMask} placeholder="nick!user@host or IP" />
              <button class={btn('green')} onclick={() => { if (unbanMask) send(`/UNKLINE ${unbanMask}`); }}>UNKLINE</button>
              <button class={btn('green')} onclick={() => { if (unbanMask) send(`/BAN UNGLINE ${unbanMask}`); }}>UNGLINE</button>
              <button class={btn('green')} onclick={() => { if (unbanMask) send(`/BAN UNZLINE ${unbanMask}`); }}>UNZLINE</button>
              <button class={btn('green')} onclick={() => { if (unbanMask) { send(`/UNDLINE ${unbanMask}`); unbanMask = ''; }}}>UNDLINE</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class={btn()} onclick={() => send('/STATS K')}>List K-Lines</button>
              <button class={btn()} onclick={() => send('/STATS G')}>List G-Lines</button>
              <button class={btn()} onclick={() => send('/STATS D')}>List D-Lines</button>
            </div>
          </div>

          <!-- Spam filter -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              Spam Filter
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={sfPattern} placeholder="regex pattern" />
              <select class={SEL} bind:value={sfAction}>
                {#each ['kill','gline','zline','shun','kline'] as a}<option>{a}</option>{/each}
              </select>
              <input class="{SI} flex-1" bind:value={sfReason} placeholder="reason" />
              <button class={btn('warn')} onclick={() => { if (sfPattern) send(`/SPAMFILTER add ${sfAction} ${sfPattern} :${sfReason}`); }}>Add</button>
              <button class={btn()} onclick={() => send('/SPAMFILTER list')}>List</button>
            </div>
          </div>

          <!-- RESV -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Nick / Channel Reserve
            </div>
            <div class={row}>
              <input class="{SI} flex-1" id="resv-target" placeholder="nick or #channel" />
              <input class="{SI} flex-1" id="resv-reason" placeholder="reason" />
              <button class={btn('warn')} onclick={() => {
                const t = (document.getElementById('resv-target') as HTMLInputElement)?.value;
                const r = (document.getElementById('resv-reason') as HTMLInputElement)?.value;
                if (t) send(`/RESV ${t} :${r || 'Reserved'}`);
              }}>RESV</button>
              <button class={btn()} onclick={() => {
                const t = (document.getElementById('resv-target') as HTMLInputElement)?.value;
                if (t) send(`/UNRESV ${t}`);
              }}>UNRESV</button>
            </div>
          </div>

        {:else if activeTab === 'server'}

          <!-- Danger zone -->
          <div class="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex flex-col gap-3">
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
              Danger Zone
            </div>
            <div class={row}>
              <button class={btn('blue')} onclick={() => send(`/REHASH${rehashOption ? ' ' + rehashOption : ''}`)}>
                REHASH{rehashOption ? ' '+rehashOption : ''}
              </button>
              <input class="{SI} w-32" bind:value={rehashOption} placeholder="option" />
              <button class={btn('danger')} onclick={() => { if (confirm('RESTART the server?')) send('/RESTART'); }}>RESTART</button>
              <button class={btn('danger')} onclick={() => { if (confirm('DIE — shut down the server?')) send('/DIE'); }}>DIE</button>
            </div>
          </div>

          <!-- Connect / Squit -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Connect / Squit
            </div>
            <div class={row}>
              <span class={lbl}>Connect</span>
              <input class="{SI} flex-1" bind:value={connectServer} placeholder="server.name" />
              <input class="{SI} w-20" type="number" bind:value={connectPort} placeholder="6667" />
              <button class={btn('blue')} onclick={() => { if (connectServer) send(`/CONNECT ${connectServer} ${connectPort}`); }}>Connect</button>
            </div>
            <div class={row}>
              <span class={lbl}>Squit</span>
              <input class="{SI} flex-1" bind:value={squitServer} placeholder="server.name" />
              <input class="{SI} flex-1" bind:value={squitReason} placeholder="reason" />
              <button class={btn('danger')} onclick={() => { if (squitServer) send(`/SQUIT ${squitServer} :${squitReason}`); }}>Squit</button>
            </div>
            <div class={row}>
              <span class={lbl}>Jupe</span>
              <input class="{SI} flex-1" bind:value={jupeServer} placeholder="server.name" />
              <input class="{SI} flex-1" bind:value={jupeReason} placeholder="reason" />
              <button class={btn('warn')} onclick={() => { if (jupeServer) send(`/JUPE ${jupeServer} ${jupeReason}`); }}>Jupe</button>
              <input class="{SI} flex-1" bind:value={unjupeServer} placeholder="unjupe target" />
              <button class={btn()} onclick={() => { if (unjupeServer) { send(`/UNJUPE ${unjupeServer}`); unjupeServer = ''; }}}>Unjupe</button>
            </div>
          </div>

          <!-- Stats -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Stats
            </div>
            <div class={row}>
              <select class="{SEL} flex-1" bind:value={statsType}>
                {#each [
                  ['u','uptime'],['c','connections'],['d','dlines'],['e','exempts'],
                  ['f','features'],['g','glines'],['h','hubs'],['i','allows'],
                  ['k','klines'],['l','links'],['m','commands'],['n','dnsbls'],
                  ['o','opers'],['p','ports'],['q','qlines'],['t','traffic'],
                  ['v','version'],['x','xlines'],['y','classes'],['z','memory'],
                ] as [v, l]}
                  <option value={v}>{v} — {l}</option>
                {/each}
              </select>
              <button class={btn('blue')} onclick={() => send(`/STATS ${statsType}`)}>STATS {statsType}</button>
            </div>
          </div>

          <!-- Modules -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5zM16 8L2 22M17.5 15H9"/></svg>
              Modules
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class={btn()} onclick={() => send('/MODLIST')}>MODLIST</button>
              <button class={btn()} onclick={() => send('/MODSTATS')}>MODSTATS</button>
            </div>
            <div class={row}>
              <input class="{SI} flex-1" id="mod-name" placeholder="module_name" />
              <button class={btn('blue')} onclick={() => { const m = (document.getElementById('mod-name') as HTMLInputElement)?.value; if (m) send(`/MODLOAD ${m}`); }}>Load</button>
              <button class={btn()} onclick={() => { const m = (document.getElementById('mod-name') as HTMLInputElement)?.value; if (m) send(`/MODUNLOAD ${m}`); }}>Unload</button>
              <button class={btn('blue')} onclick={() => { const m = (document.getElementById('mod-name') as HTMLInputElement)?.value; if (m) send(`/MODRELOAD ${m}`); }}>Reload</button>
            </div>
          </div>

          <!-- Trace tools -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              Trace / Inspect
            </div>
            <div class={row}>
              <span class={lbl}>Trace</span>
              <input class="{SI} flex-1" bind:value={traceMask} placeholder="nick or server" />
              <button class={btn()} onclick={() => send(`/TRACE${traceMask ? ' ' + traceMask : ''}`)}>TRACE</button>
              <button class={btn()} onclick={() => send(`/ETRACE${traceMask ? ' ' + traceMask : ''}`)}>ETRACE</button>
            </div>
            <div class={row}>
              <span class={lbl}>Testline</span>
              <input class="{SI} flex-1" bind:value={testlineMask} placeholder="nick!user@host" />
              <button class={btn()} onclick={() => { if (testlineMask) send(`/TESTLINE ${testlineMask}`); }}>TESTLINE</button>
            </div>
            <div class={row}>
              <span class={lbl}>Testmask</span>
              <input class="{SI} flex-1" bind:value={testmaskMask} placeholder="nick!user@host" />
              <button class={btn()} onclick={() => { if (testmaskMask) send(`/TESTMASK ${testmaskMask}`); }}>TESTMASK</button>
            </div>
            <div class={row}>
              <span class={lbl}>Masktrace</span>
              <input class="{SI} flex-1" bind:value={masktraceUserhost} placeholder="nick!user@host" />
              <button class={btn()} onclick={() => { if (masktraceUserhost) send(`/MASKTRACE ${masktraceUserhost}`); }}>MASKTRACE</button>
            </div>
            <div class={row}>
              <span class={lbl}>OPERSPY</span>
              <input class="{SI} flex-1" id="operspy-cmd" placeholder="/WHOIS nick or /MODE #chan" />
              <button class={btn('warn')} onclick={() => { const c = (document.getElementById('operspy-cmd') as HTMLInputElement)?.value; if (c) send(`/OPERSPY ${c}`); }}>OPERSPY</button>
            </div>
          </div>

          <div class="flex gap-2 flex-wrap">
            <button class={btn()} onclick={() => send('/MAP')}>MAP</button>
            <button class={btn()} onclick={() => send('/LINKS')}>LINKS</button>
            <button class={btn()} onclick={() => send('/INFO')}>INFO</button>
            <button class={btn()} onclick={() => send('/VERSION')}>VERSION</button>
            <button class={btn()} onclick={() => send('/ADMIN')}>ADMIN</button>
            <button class={btn()} onclick={() => send('/TIME')}>TIME</button>
            <button class={btn()} onclick={() => send('/GOPER')}>GOPER</button>
          </div>

        {:else if activeTab === 'network'}

          <!-- Broadcast -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.01 2.2 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/></svg>
              Broadcast
            </div>
            <div class={row}>
              <span class="text-xs text-gray-500 w-24 flex-shrink-0">WALLOPS</span>
              <input class="{SI} flex-1" bind:value={wallopsMsg} placeholder="message to users set +w" />
              <button class={btn()} onclick={() => { if (wallopsMsg) { send(`/WALLOPS :${wallopsMsg}`); wallopsMsg = ''; }}}>Send</button>
            </div>
            <div class={row}>
              <span class="text-xs text-gray-500 w-24 flex-shrink-0">OPERWALL</span>
              <input class="{SI} flex-1" bind:value={operwallMsg} placeholder="message to all opers" />
              <button class={btn('blue')} onclick={() => { if (operwallMsg) { send(`/OPERWALL :${operwallMsg}`); operwallMsg = ''; }}}>Send</button>
            </div>
            <div class={row}>
              <span class="text-xs text-gray-500 w-24 flex-shrink-0">SNOTE</span>
              <input class="{SI} w-12" bind:value={snoteFlag} placeholder="f" maxlength="1" />
              <input class="{SI} flex-1" bind:value={snoteMsg} placeholder="server notice text" />
              <button class={btn()} onclick={() => { if (snoteMsg) { send(`/SNOTE ${snoteFlag || '*'} :${snoteMsg}`); snoteMsg = ''; }}}>Send</button>
            </div>
          </div>

          <!-- Channel tools -->
          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Channel Tools
            </div>
            <div class={row}>
              <span class={lbl}>CHANTRACE</span>
              <input class="{SI} flex-1" id="chantrace-chan" placeholder="#channel" />
              <button class={btn()} onclick={() => { const c = (document.getElementById('chantrace-chan') as HTMLInputElement)?.value; if (c) send(`/CHANTRACE ${c}`); }}>CHANTRACE</button>
            </div>
            <div class={row}>
              <span class={lbl}>SCAN</span>
              <input class="{SI} flex-1" id="scan-opts" placeholder="UMODES +o SHOW" />
              <button class={btn()} onclick={() => { const o = (document.getElementById('scan-opts') as HTMLInputElement)?.value; send(`/SCAN ${o || 'UMODES +o SHOW'}`); }}>SCAN</button>
            </div>
          </div>

          <div class="flex gap-2 flex-wrap">
            <button class={btn()} onclick={() => send('/GOPER')}>GOPER</button>
            <button class={btn()} onclick={() => send('/PRIVS')}>PRIVS</button>
            <button class={btn()} onclick={() => send('/MOTD')}>MOTD</button>
          </div>

        {:else if activeTab === 'accounts'}

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
              Suspend / Forbid
            </div>
            <div class={row}>
              <span class={lbl}>Suspend</span>
              <input class="{SI} flex-1" bind:value={suspendNick} placeholder="account name" />
              <button class={btn('warn')} onclick={() => { if (suspendNick) send(`/SUSPEND ${suspendNick}`); }}>Suspend</button>
              <button class={btn('green')} onclick={() => { if (suspendNick) { send(`/UNSUSPEND ${suspendNick}`); suspendNick = ''; }}}>Unsuspend</button>
            </div>
            <div class={row}>
              <span class={lbl}>Forbid</span>
              <input class="{SI} flex-1" bind:value={forbidNick} placeholder="nickname" />
              <input class="{SI} flex-1" bind:value={forbidReason} placeholder="reason" />
              <button class={btn('danger')} onclick={() => { if (forbidNick) send(`/FORBID ${forbidNick} :${forbidReason || 'Forbidden'}`); }}>Forbid</button>
              <button class={btn('green')} onclick={() => { if (forbidNick) { send(`/UNFORBID ${forbidNick}`); forbidNick = ''; }}}>Unforbid</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Set / Create Account
            </div>
            <div class={row}>
              <span class={lbl}>Set Acc</span>
              <input class="{SI} flex-1" bind:value={setaccNick} placeholder="nick" />
              <input class="{SI} flex-1" bind:value={setaccAccount} placeholder="account name" />
              <button class={btn('blue')} onclick={() => { if (setaccNick && setaccAccount) { send(`/SETACCOUNT ${setaccNick} ${setaccAccount}`); setaccNick = ''; setaccAccount = ''; }}}>Set</button>
            </div>
            <div class={row}>
              <span class={lbl}>Create</span>
              <input class="{SI} flex-1" bind:value={acreateAccount} placeholder="account name" />
              <input class="{SI} flex-1" type="password" bind:value={acreatePass} placeholder="password" />
              <button class={btn('blue')} onclick={() => { if (acreateAccount) { send(`/ACREATE ${acreateAccount} ${acreatePass}`); acreateAccount = ''; acreatePass = ''; }}}>Create</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Services
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class={btn('warn')} onclick={() => { if (confirm('Pause services?')) send('/SVCPAUSE'); }}>Pause Services</button>
              <button class={btn('blue')} onclick={() => send('/SVCRESUME')}>Resume Services</button>
            </div>
            <div class={row}>
              <input class="{SI} flex-1" id="noexpire-nick" placeholder="nick or #channel" />
              <button class={btn()} onclick={() => { const n = (document.getElementById('noexpire-nick') as HTMLInputElement)?.value; if (n) send(`/NOEXPIRE ${n}`); }}>NOEXPIRE</button>
              <button class={btn()} onclick={() => { const n = (document.getElementById('noexpire-nick') as HTMLInputElement)?.value; if (n) send(`/CHANNOEXPIRE ${n}`); }}>CHANNOEXPIRE</button>
            </div>
          </div>

        {:else if activeTab === 'ircx'}

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PROP — Properties
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={propTarget} placeholder="#channel or nick" />
              <input class="{SI} flex-1" bind:value={propName} placeholder="TOPIC / ONJOIN / ..." />
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={propValue} placeholder="value (leave empty to GET)" />
              <button class={btn('blue')} onclick={() => {
                if (propTarget && propName) send(propValue ? `/PROP ${propTarget} ${propName} :${propValue}` : `/PROP ${propTarget} ${propName}`);
              }}>{propValue ? 'SET' : 'GET'}</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              ACCESS — Channel Lists
            </div>
            <div class={row}>
              <input class="{SI} flex-1" bind:value={accessTarget} placeholder="#channel" />
              <select class={SEL} bind:value={accessLevel}>
                <option value="">level</option>
                <option value="OWNER">OWNER</option>
                <option value="HOST">HOST</option>
                <option value="VOICE">VOICE</option>
                <option value="DENY">DENY</option>
              </select>
              <input class="{SI} flex-1" bind:value={accessMask} placeholder="nick!user@host" />
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class={btn('blue')} onclick={() => { if (accessTarget && accessLevel && accessMask) send(`/ACCESS ${accessTarget} ${accessLevel} ADD ${accessMask}`); }}>Add</button>
              <button class={btn('danger')} onclick={() => { if (accessTarget && accessLevel && accessMask) send(`/ACCESS ${accessTarget} ${accessLevel} DEL ${accessMask}`); }}>Del</button>
              <button class={btn()} onclick={() => { if (accessTarget) send(`/ACCESS ${accessTarget} ${accessLevel || 'OWNER'} LIST`); }}>List</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              WHISPER
            </div>
            <div class={row}>
              <input class="{SI} w-28" bind:value={whisperChan} placeholder="#channel" />
              <input class="{SI} w-28" bind:value={whisperNick} placeholder="nick" />
              <input class="{SI} flex-1" bind:value={whisperMsg} placeholder="message" />
              <button class={btn()} onclick={() => { if (whisperChan && whisperNick && whisperMsg) { send(`/WHISPER ${whisperChan} ${whisperNick} :${whisperMsg}`); whisperMsg = ''; }}}>Send</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              MODEX / LISTX
            </div>
            <div class={row}>
              <span class={lbl}>MODEX</span>
              <input class="{SI} flex-1" bind:value={modexTarget} placeholder="#channel or nick" />
              <input class="{SI} flex-1" bind:value={modexModes} placeholder="+i etc." />
              <button class={btn('blue')} onclick={() => { if (modexTarget) send(`/MODEX ${modexTarget}${modexModes ? ' ' + modexModes : ''}`); }}>MODEX</button>
            </div>
            <div class={row}>
              <span class={lbl}>LISTX</span>
              <input class="{SI} flex-1" id="listx-opts" placeholder="MEMBERCOUNT > 5 MODE +i" />
              <button class={btn()} onclick={() => { const o = (document.getElementById('listx-opts') as HTMLInputElement)?.value; send(`/LISTX${o ? ' ' + o : ''}`); }}>LISTX</button>
            </div>
          </div>

          <div class="flex gap-2 flex-wrap">
            <button class={btn()} onclick={() => send('/IRCX')}>IRCX</button>
            <button class={btn()} onclick={() => send('/ISIRCX')}>ISIRCX</button>
            <button class={btn()} onclick={() => send('/REQUEST FEATURELIST')}>FEATURELIST</button>
          </div>

        {:else if activeTab === 'debug'}

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Debug Level
            </div>
            <div class={row}>
              <input class="{SI} w-20" type="number" bind:value={debugLevel} min="0" max="10" />
              <input class="{SI} flex-1" id="debug-subsys" placeholder="subsystem (optional)" />
              <button class={btn('blue')} onclick={() => send(`/DEBUGLEVEL ${debugLevel}`)}>Set Level</button>
              <button class={btn()} onclick={() => send('/DEBUGINFO')}>INFO</button>
              <button class={btn()} onclick={() => send('/DEBUGSTATS')}>STATS</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
              Log / Watch
            </div>
            <div class="flex gap-2 flex-wrap">
              <button class={btn()} onclick={() => send('/DEBUGROTATE')}>DEBUGROTATE</button>
              <button class={btn()} onclick={() => send('/DEBUGLOG')}>DEBUGLOG</button>
            </div>
            <div class={row}>
              <input class="{SI} flex-1" id="debug-watch" placeholder="watch pattern" />
              <button class={btn()} onclick={() => { const w = (document.getElementById('debug-watch') as HTMLInputElement)?.value; if (w) send(`/DEBUGWATCH ${w}`); }}>DEBUGWATCH</button>
            </div>
          </div>

          <div class={card}>
            <div class={cardTitle}>
              <svg class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Correlation / Hash
            </div>
            <div class={row}>
              <input class="{SI} flex-1" id="debug-corr" placeholder="arg" />
              <button class={btn()} onclick={() => { const c = (document.getElementById('debug-corr') as HTMLInputElement)?.value; send(`/DEBUGCORR${c ? ' ' + c : ''}`); }}>DEBUGCORR</button>
              <button class={btn()} onclick={() => send('/HASHCHECK')}>HASHCHECK</button>
            </div>
          </div>

        {:else if (activeTab as string) === 'log'}

          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Command Log</span>
            <button class="text-[11px] text-gray-600 hover:text-gray-400 transition-colors" onclick={() => (cmdLog = [])}>Clear</button>
          </div>
          {#if cmdLog.length === 0}
            <div class="text-sm text-gray-600 text-center py-12">No commands sent yet.</div>
          {:else}
            <div class="flex flex-col gap-1.5">
              {#each cmdLog as entry (entry.ts)}
                <div class="bg-gray-900 border border-gray-700/40 rounded-lg px-3 py-2 flex items-center gap-3">
                  <span class="font-mono text-sm text-green-400 flex-1 truncate">{entry.cmd}</span>
                  <span class="text-[10px] text-gray-600 flex-shrink-0">{new Date(entry.ts).toLocaleTimeString()}</span>
                </div>
              {/each}
            </div>
          {/if}

        {/if}
      </div>
    </div>
  </div>
</div>

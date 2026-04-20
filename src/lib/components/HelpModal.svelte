<script lang="ts">
  interface Props { onclose?: () => void; }
  const { onclose }: Props = $props();

  function close() { onclose?.(); }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); close(); }
  }

  const sections: { title: string; keys: { keys: string[]; desc: string }[] }[] = [
    {
      title: 'Navigation',
      keys: [
        { keys: ['Ctrl+K'],        desc: 'Quick buffer switch' },
        { keys: ['Alt+1–9'],       desc: 'Jump to Nth buffer' },
        { keys: ['Alt+↑ / Alt+↓'], desc: 'Jump to next/prev unread highlight' },
        { keys: ['Alt+PgUp / Alt+PgDn'], desc: 'Previous/next buffer' },
        { keys: ['Ctrl+\\'],       desc: 'Toggle sidebar' },
      ],
    },
    {
      title: 'Input',
      keys: [
        { keys: ['↑ / ↓'],         desc: 'Browse history' },
        { keys: ['Tab'],            desc: 'Nick/command completion' },
        { keys: ['Ctrl+A'],         desc: 'Move to start of line' },
        { keys: ['Ctrl+E'],         desc: 'Move to end of line' },
        { keys: ['Ctrl+K'],         desc: 'Delete to end of line' },
        { keys: ['Ctrl+U'],         desc: 'Delete to start of line' },
        { keys: ['Ctrl+W'],         desc: 'Delete word before cursor' },
        { keys: ['Ctrl+B'],         desc: 'Bold (IRC \x02 wrap)' },
        { keys: ['Ctrl+I'],         desc: 'Italic (IRC \x1d wrap)' },
      ],
    },
    {
      title: 'Interface',
      keys: [
        { keys: ['Ctrl+,'],        desc: 'Open Settings' },
        { keys: ['Ctrl+O'],        desc: 'Toggle Oper Console' },
        { keys: ['Ctrl+F'],        desc: 'Search messages in buffer' },
        { keys: ['/'],             desc: 'Focus input bar' },
        { keys: ['Ctrl+Shift+S'],  desc: 'Open buffer in split pane' },
        { keys: ['Ctrl+W'],        desc: 'Part channel / close query' },
        { keys: ['?'],             desc: 'This help' },
        { keys: ['Esc'],           desc: 'Close modal / dismiss' },
      ],
    },
  ];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onkeydown={onKeydown} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={close}></div>
  <div class="panel">
    <div class="header">
      <h2 class="title">Keyboard Shortcuts</h2>
      <button onclick={close} class="close-btn" aria-label="Close">
        <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 3l10 10M13 3L3 13"/>
        </svg>
      </button>
    </div>
    <div class="body">
      {#each sections as sec}
        <div class="section">
          <div class="section-title">{sec.title}</div>
          {#each sec.keys as row}
            <div class="row">
              <div class="keys">
                {#each row.keys as k, i}
                  {#if i > 0}<span class="slash">/</span>{/if}
                  {#each k.split('+') as part, pi}
                    {#if pi > 0}<span class="plus">+</span>{/if}
                    <kbd>{part}</kbd>
                  {/each}
                {/each}
              </div>
              <span class="desc">{row.desc}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
    <p class="footer">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
  }
  .panel {
    position: relative;
    width: 100%;
    max-width: 440px;
    max-height: 85vh;
    background: #111318;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: pop 0.2s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes pop {
    from { opacity: 0; transform: scale(0.94) translateY(6px); }
    to   { opacity: 1; transform: none; }
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .title {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-gray-100, #e8ebf5);
    margin: 0;
  }
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px; height: 28px;
    border-radius: 8px;
    background: none;
    border: none;
    color: var(--color-gray-500, #484b5c);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .close-btn:hover { color: var(--color-gray-200, #c4c8d8); background: rgba(255,255,255,0.06); }

  .body {
    overflow-y: auto;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .section { display: flex; flex-direction: column; gap: 6px; }
  .section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-gray-500, #484b5c);
    margin-bottom: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }
  .keys {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
    min-width: 160px;
  }
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    min-width: 22px;
    border-radius: 5px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    font-family: monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-gray-200, #c4c8d8);
    box-shadow: 0 1px 0 rgba(0,0,0,0.4);
  }
  .plus, .slash {
    font-size: 10px;
    color: var(--color-gray-600, #25272e);
    padding: 0 1px;
  }
  .desc {
    font-size: 13px;
    color: var(--color-gray-400, #686c7e);
  }
  .footer {
    padding: 10px 18px;
    font-size: 11px;
    color: var(--color-gray-600, #25272e);
    text-align: center;
    border-top: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
    margin: 0;
  }
</style>

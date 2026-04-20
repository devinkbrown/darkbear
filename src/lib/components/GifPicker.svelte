<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    onselect: (url: string) => void;
    onclose: () => void;
  }
  const { onselect, onclose }: Props = $props();

  // Tenor v2 demo key (same as Nexus)
  const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
  const BASE = 'https://tenor.googleapis.com/v2';

  interface GifResult { id: string; preview: string; url: string; title: string; }

  let query      = $state('');
  let gifs       = $state<GifResult[]>([]);
  let loading    = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  async function fetchGifs(q: string) {
    loading = true;
    try {
      const p = new URLSearchParams({ key: TENOR_KEY, limit: '24', media_filter: 'tinygif,gif' });
      if (q.trim()) p.set('q', q.trim());
      const url = q.trim() ? `${BASE}/search?${p}` : `${BASE}/featured?${p}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      gifs = (json.results ?? []).map((g: Record<string, unknown>) => {
        const mf = g.media_formats as Record<string, { url: string }> | undefined;
        return {
          id: g.id as string,
          title: (g.content_description as string) || '',
          preview: mf?.tinygif?.url ?? mf?.gif?.url ?? '',
          url:     mf?.gif?.url     ?? mf?.tinygif?.url ?? '',
        };
      });
    } catch { /* ignore */ } finally { loading = false; }
  }

  onMount(() => { fetchGifs(''); });

  function onInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => fetchGifs(query), 400);
  }

  function onDown(e: MouseEvent) {
    if (!(e.target as Element).closest('[data-gif-picker]')) onclose();
  }
</script>

<svelte:window onmousedown={onDown} ontouchstart={onDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div data-gif-picker class="picker">
  <div class="header">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      autofocus
      class="search"
      type="text"
      bind:value={query}
      oninput={onInput}
      placeholder="Search GIFs…"
    />
    <button class="close-btn" onclick={onclose} aria-label="Close">
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 4l8 8M12 4l-8 8"/>
      </svg>
    </button>
  </div>

  <div class="grid">
    {#if loading}
      <div class="loading">
        <span class="spinner"></span>
      </div>
    {:else if gifs.length === 0}
      <div class="empty">No GIFs found</div>
    {:else}
      {#each gifs as gif (gif.id)}
        <button class="item" onclick={() => onselect(gif.url)} title={gif.title}>
          <img src={gif.preview} alt={gif.title} loading="lazy" />
        </button>
      {/each}
    {/if}
  </div>

  <div class="footer">
    <span class="tenor-badge">via Tenor</span>
  </div>
</div>

<style>
  .picker {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 60px);
    right: max(8px, env(safe-area-inset-right, 8px));
    left: max(8px, env(safe-area-inset-left, 8px));
    width: min(320px, calc(100vw - 16px));
    max-height: min(360px, calc(100dvh - 80px));
    margin-left: auto;
    background: var(--color-gray-900, #111318);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.7);
    z-index: 40;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .search {
    flex: 1;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    color: #e8ebf5;
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.15s;
  }
  .search:focus { border-color: rgba(59,130,246,0.4); }
  .search::placeholder { color: #484b5c; }
  .close-btn {
    flex-shrink: 0;
    color: #484b5c;
    background: none; border: none; cursor: pointer;
    padding: 4px; border-radius: 6px; transition: color 0.1s;
    display: flex; align-items: center;
  }
  .close-btn:hover { color: #9ca3af; }
  .grid {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .loading, .empty {
    grid-column: 1/-1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 28px;
    color: #484b5c;
    font-size: 12px;
  }
  .spinner {
    display: block;
    width: 20px; height: 20px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.15);
    border-top-color: rgba(255,255,255,0.5);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .item {
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 8px;
    cursor: pointer;
    background: rgba(255,255,255,0.04);
    border: none; padding: 0;
    transition: transform 0.1s, opacity 0.1s;
  }
  .item:hover { transform: scale(1.04); }
  .item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .footer {
    padding: 4px 12px 6px;
    border-top: 1px solid rgba(255,255,255,0.04);
    flex-shrink: 0;
  }
  .tenor-badge { font-size: 10px; color: #484b5c; }
</style>

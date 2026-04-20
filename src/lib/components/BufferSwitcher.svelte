<script lang="ts">
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';
  import type { BufferEntry } from '$lib/stores/buffers.svelte.js';

  interface Props {
    open?: boolean;
    onclose?: () => void;
    onpick?: (pointer: string) => void; // if set, calls this instead of setActive
  }

  const { onclose, onpick }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement;

  function close() {
    query = '';
    selectedIndex = 0;
    onclose?.();
  }

  $effect(() => {
    // Focus input on mount
    requestAnimationFrame(() => inputEl?.focus());
  });

  // Simple fuzzy match: all chars of query appear in order in candidate
  function fuzzyMatch(candidate: string, q: string): boolean {
    if (!q) return true;
    const lc = candidate.toLowerCase();
    const qlc = q.toLowerCase();
    let ci = 0;
    for (let i = 0; i < lc.length && ci < qlc.length; i++) {
      if (lc[i] === qlc[ci]) ci++;
    }
    return ci === qlc.length;
  }

  function highlightMatch(name: string, q: string): string {
    if (!q) return name;
    const qlc = q.toLowerCase();
    let result = '';
    let qi = 0;
    for (let i = 0; i < name.length; i++) {
      if (qi < qlc.length && name[i].toLowerCase() === qlc[qi]) {
        result += `<span class="text-blue-300 font-bold">${name[i]}</span>`;
        qi++;
      } else {
        result += name[i];
      }
    }
    return result;
  }

  const filtered = $derived((() => {
    const all = buffers.sorted;
    if (!query) return all;
    return all.filter(e => {
      const name = (e.buffer.shortName || e.buffer.name).toLowerCase();
      const full = e.buffer.fullName.toLowerCase();
      return fuzzyMatch(name, query) || fuzzyMatch(full, query);
    });
  })());

  $effect(() => {
    // Clamp selectedIndex when filter changes
    if (selectedIndex >= filtered.length) {
      selectedIndex = Math.max(0, filtered.length - 1);
    }
  });

  function selectEntry(entry: BufferEntry) {
    if (onpick) {
      onpick(entry.buffer.id);
    } else {
      chat.setActive(entry.buffer.id);
    }
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      scrollSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = filtered[selectedIndex];
      if (entry) selectEntry(entry);
    }
  }

  let listEl: HTMLDivElement;
  function scrollSelected() {
    requestAnimationFrame(() => {
      const item = listEl?.children[selectedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    });
  }

  function displayName(e: BufferEntry): string {
    return e.buffer.shortName || e.buffer.name;
  }

  function bufferType(e: BufferEntry): string {
    return e.buffer.localVars['type'] ?? 'server';
  }
</script>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-[15vh] px-4"
    onclick={(ev) => { if (ev.target === ev.currentTarget) close(); }}
    onkeydown={onKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Switch buffer"
    tabindex="-1"
  >
    <div
      class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
      style="max-height: 60vh;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Search input -->
      <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <svg class="w-4 h-4 text-gray-500 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="4.5"/>
          <path d="M10.5 10.5l3 3"/>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKeydown}
          class="flex-1 bg-transparent text-gray-200 text-sm outline-none placeholder-gray-600"
          placeholder="Jump to buffer…"
          autocomplete="off"
          spellcheck="false"
        />
        {#if query}
          <button
            onclick={() => { query = ''; inputEl?.focus(); }}
            class="text-gray-600 hover:text-gray-400 transition-colors"
            aria-label="Clear"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        {/if}
        <kbd class="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">ESC</kbd>
      </div>

      <!-- Results list -->
      <div bind:this={listEl} class="overflow-y-auto flex-1">
        {#if filtered.length === 0}
          <div class="px-4 py-8 text-center text-sm text-gray-600">No buffers match "{query}"</div>
        {:else}
          {#each filtered as entry, i (entry.buffer.id)}
            <button
              class="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
                {i === selectedIndex ? 'bg-blue-600/20 text-gray-100' : 'text-gray-300 hover:bg-gray-800'}"
              onclick={() => selectEntry(entry)}
              onmouseenter={() => (selectedIndex = i)}
            >
              <!-- Type icon -->
              <span class="text-gray-600 text-xs flex-shrink-0 w-4 text-center">
                {#if bufferType(entry) === 'channel'}#
                {:else if bufferType(entry) === 'private'}@
                {:else}~{/if}
              </span>

              <!-- Name with fuzzy highlight -->
              <span class="flex-1 text-sm font-medium truncate">
                {@html highlightMatch(displayName(entry), query)}
              </span>

              <!-- Buffer number -->
              <span class="text-xs text-gray-600 flex-shrink-0">{entry.buffer.number}</span>

              <!-- Unread badges -->
              {#if entry.highlighted > 0}
                <span class="text-[10px] bg-red-500 text-white rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold flex-shrink-0">{entry.highlighted > 99 ? '99+' : entry.highlighted}</span>
              {:else if entry.unread > 0}
                <span class="text-[10px] bg-gray-600 text-gray-300 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center flex-shrink-0">{entry.unread > 99 ? '99+' : entry.unread}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <!-- Footer hint -->
      <div class="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600">
        <span><kbd class="bg-gray-800 border border-gray-700 rounded px-1">↑↓</kbd> navigate</span>
        <span><kbd class="bg-gray-800 border border-gray-700 rounded px-1">Enter</kbd> switch</span>
        <span class="ml-auto">{filtered.length} buffer{filtered.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  </div>

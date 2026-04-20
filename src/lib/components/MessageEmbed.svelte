<script lang="ts">
  import type { MediaEmbed } from '$lib/irc/formatter.js';

  interface Props { embed: MediaEmbed; }
  const { embed }: Props = $props();

  const isNsfw = $derived(
    ('url' in embed && /nsfw/i.test(embed.url)) ||
    ('videoId' in embed && /nsfw/i.test(embed.videoId)) ||
    ('clipId' in embed && /nsfw/i.test(embed.clipId))
  );
  let expanded = $state(false);
  let audioEl = $state<HTMLAudioElement | null>(null);
</script>

<div class="mt-1.5 ml-[56px] sm:ml-[64px] mr-3 max-w-lg">
  {#if isNsfw && !expanded}
    <button onclick={() => (expanded = true)} class="flex items-center gap-2 text-xs text-gray-600 hover:text-amber-400 transition-colors">
      <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11v.5"/></svg>
      NSFW — click to reveal
    </button>
  {:else if embed.type === 'youtube'}
    {#if !expanded}
      <button
        onclick={() => (expanded = true)}
        class="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors group"
      >
        <svg class="w-4 h-4 flex-shrink-0 group-hover:text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2-.9C17.2 5 12 5 12 5s-5.2 0-7 .1c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S2 9.5 2 11v1.5c0 1.5.2 3 .2 3s.2 1.4.8 2c.8.8 1.8.8 2.2.9C6.8 18.5 12 18.5 12 18.5s5.2 0 7-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.5.2-3V11c0-1.5-.2-3-.2-3zM10 14.5v-5l5.5 2.5-5.5 2.5z"/>
        </svg>
        <span class="truncate">YouTube — click to load</span>
      </button>
    {:else}
      <div class="relative w-full rounded-lg overflow-hidden bg-black" style="padding-bottom: 56.25%;">
        <iframe
          class="absolute inset-0 w-full h-full"
          src="https://www.youtube.com/embed/{embed.videoId}?start={embed.start}&rel=0&modestbranding=1"
          title="YouTube video"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
      <button onclick={() => (expanded = false)} class="text-xs text-gray-600 hover:text-gray-400 mt-1">hide</button>
    {/if}

  {:else if embed.type === 'twitch_clip'}
    {#if !expanded}
      <button onclick={() => (expanded = true)} class="flex items-center gap-2 text-xs text-gray-500 hover:text-purple-400 transition-colors group">
        <svg class="w-4 h-4 flex-shrink-0 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.3 3H21v13.7l-4.3 4.3H13l-2 2H8v-2H3V6.3L4.3 3zm1.7 13h3v2h1l2-2h3.3l3.7-3.7V5H5v11zm7-9h2v5h-2V7zm-5 0h2v5H8V7z"/>
        </svg>
        <span>Twitch clip — click to load</span>
      </button>
    {:else}
      <div class="relative w-full rounded-lg overflow-hidden bg-black" style="padding-bottom: 56.25%;">
        <iframe
          class="absolute inset-0 w-full h-full"
          src="https://clips.twitch.tv/embed?clip={embed.clipId}&parent={typeof window !== 'undefined' ? window.location.hostname : 'localhost'}&autoplay=false"
          title="Twitch clip"
          frameborder="0"
          allowfullscreen
        ></iframe>
      </div>
      <button onclick={() => (expanded = false)} class="text-xs text-gray-600 hover:text-gray-400 mt-1">hide</button>
    {/if}

  {:else if embed.type === 'twitch_stream'}
    {#if !expanded}
      <button onclick={() => (expanded = true)} class="flex items-center gap-2 text-xs text-gray-500 hover:text-purple-400 transition-colors group">
        <svg class="w-4 h-4 flex-shrink-0 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.3 3H21v13.7l-4.3 4.3H13l-2 2H8v-2H3V6.3L4.3 3zm1.7 13h3v2h1l2-2h3.3l3.7-3.7V5H5v11zm7-9h2v5h-2V7zm-5 0h2v5H8V7z"/>
        </svg>
        <span>Twitch — click to load</span>
      </button>
    {:else}
      <div class="relative w-full rounded-lg overflow-hidden bg-black" style="padding-bottom: 56.25%;">
        <iframe
          class="absolute inset-0 w-full h-full"
          src="https://player.twitch.tv/?{embed.videoId ? `video=${embed.videoId}` : `channel=${embed.channelId}`}&parent={typeof window !== 'undefined' ? window.location.hostname : 'localhost'}&autoplay=false&muted=true"
          title="Twitch stream"
          frameborder="0"
          allowfullscreen
        ></iframe>
      </div>
      <button onclick={() => (expanded = false)} class="text-xs text-gray-600 hover:text-gray-400 mt-1">hide</button>
    {/if}

  {:else if embed.type === 'video'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      src={embed.url}
      controls
      loop
      muted
      class="rounded-lg max-w-full max-h-64 bg-black"
      style="display:block"
    ></video>

  {:else if embed.type === 'audio'}
    <audio
      bind:this={audioEl}
      src={embed.url}
      controls
      class="w-full max-w-xs h-8 rounded-lg"
      style="accent-color: var(--custom-accent, #3b82f6);"
    ></audio>
  {/if}
</div>

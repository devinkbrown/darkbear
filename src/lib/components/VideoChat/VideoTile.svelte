<script lang="ts">
  interface Props {
    stream: MediaStream | null;
    nick: string;
    isLocal?: boolean;
  }
  const { stream, nick, isLocal = false }: Props = $props();

  let videoEl = $state<HTMLVideoElement | undefined>();

  $effect(() => {
    if (videoEl && stream) {
      videoEl.srcObject = stream;
    }
  });
</script>

<div class="tile">
  {#if stream}
    <video bind:this={videoEl} autoplay playsinline muted={isLocal}></video>
  {:else}
    <div class="placeholder">👤</div>
  {/if}
  <div class="label" class:local={isLocal}>{isLocal ? `${nick} (you)` : nick}</div>
</div>

<style>
  .tile {
    position: relative; background: rgba(255,255,255,0.03);
    border-radius: 6px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.07);
    aspect-ratio: 16/9; min-width: 120px;
    display: flex; align-items: center; justify-content: center;
  }
  video { width: 100%; height: 100%; object-fit: cover; }
  .placeholder { font-size: 24px; color: #4b5563; }
  .label {
    position: absolute; bottom: 6px; left: 8px;
    background: rgba(0,0,0,0.65); color: #f3f4f6;
    font-family: monospace; font-size: 11px;
    padding: 2px 6px; border-radius: 3px; font-weight: 600;
  }
  .label.local { color: #60a5fa; }
</style>

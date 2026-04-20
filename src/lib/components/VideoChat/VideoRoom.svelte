<script lang="ts">
  import { video } from '$lib/stores/video.svelte.js';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import VideoTile from './VideoTile.svelte';

  const myNick = $derived.by(() => {
    const entry = buffers.active ? buffers.buffers.get(buffers.active) : null;
    return entry?.buffer.localVars['nick'] ?? '';
  });

  const title = $derived(
    video.callChannel ? `Video: ${video.callChannel}` : `Call with ${video.callWith}`
  );
</script>

{#if video.minimized}
  <button class="room-pill" onclick={() => { video.minimized = false; }} aria-label="Expand video call">
    <svg class="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
    <span class="pill-title">{title}</span>
    <span class="pill-expand">▲</span>
  </button>

{:else}
  <div class="room-container" style="width: {video.activePeers.length > 1 ? '600px' : '340px'}; max-width: calc(100vw - 40px);">
    <!-- Header -->
    <div class="room-header">
      <span class="room-title">
        <svg class="icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
        {title}
      </span>
      <button class="btn-icon" title="Minimise" onclick={() => { video.minimized = true; }}>▼</button>
    </div>

    <!-- Peer video grid -->
    <div class="video-grid" style="grid-template-columns: {video.activePeers.length > 1 ? 'repeat(2,1fr)' : '1fr'};">
      {#each video.activePeers as peer (peer.nick)}
        <VideoTile stream={peer.stream} nick={peer.nick} />
      {/each}
    </div>

    <!-- Local PiP -->
    <div style="padding: 0 10px 10px;">
      <div style="width: 120px;">
        <VideoTile stream={video.localStream} nick={myNick} isLocal />
      </div>
    </div>

    <!-- Controls -->
    <div class="room-controls">
      <button
        class="ctrl-btn" class:on={!video.audioMuted}
        title={video.audioMuted ? 'Unmute' : 'Mute'}
        onclick={() => video.toggleMute()}
      >{video.audioMuted ? '🔇' : '🎙️'}</button>
      <button
        class="ctrl-btn" class:on={!video.videoOff}
        title={video.videoOff ? 'Enable video' : 'Disable video'}
        onclick={() => video.toggleVideo()}
      >{video.videoOff ? '📵' : '📹'}</button>
      <button class="btn-hangup" onclick={() => video.hangup()}>End Call</button>
    </div>
  </div>
{/if}

<style>
  .room-container {
    position: fixed; bottom: 70px; right: 20px; z-index: 9000;
    background: rgba(15, 18, 30, 0.97);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden;
    box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(59,130,246,0.08);
    animation: slideIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes slideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

  .room-header {
    background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.07);
    padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;
  }
  .room-title { color: #f3f4f6; font-size: 12px; font-weight: 700; font-family: monospace; display: flex; align-items: center; gap: 6px; }
  .icon-inline { width: 14px; height: 14px; color: #4ade80; }
  .btn-icon { background: none; border: none; color: #6b7280; cursor: pointer; font-size: 14px; padding: 0 4px; transition: color 0.15s; }
  .btn-icon:hover { color: #9ca3af; }

  .video-grid { padding: 10px; display: grid; gap: 8px; }

  .room-controls {
    background: rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.07);
    padding: 10px 14px; display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .ctrl-btn {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
    color: #6b7280; font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: all 0.15s;
  }
  .ctrl-btn.on { background: rgba(74,222,128,0.1); border-color: rgba(74,222,128,0.35); color: #f3f4f6; }
  .btn-hangup {
    padding: 8px 20px; background: rgba(239,68,68,0.12);
    border: 1px solid rgba(239,68,68,0.4); border-radius: 20px;
    color: #fca5a5; font-size: 12px; font-weight: 700; cursor: pointer;
    transition: background 0.15s; font-family: monospace;
  }
  .btn-hangup:hover { background: rgba(239,68,68,0.25); }

  .room-pill {
    position: fixed; bottom: 70px; right: 20px; z-index: 9000;
    background: rgba(15,18,30,0.97); border: 1px solid rgba(74,222,128,0.35);
    border-radius: 8px; padding: 8px 12px;
    display: flex; align-items: center; gap: 10px;
    cursor: pointer; box-shadow: 0 0 16px rgba(74,222,128,0.1);
  }
  .pill-title { color: #f3f4f6; font-family: monospace; font-size: 12px; }
  .pill-expand { color: #6b7280; font-size: 10px; }
</style>

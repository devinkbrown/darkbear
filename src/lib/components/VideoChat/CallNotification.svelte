<script lang="ts">
  import { video } from '$lib/stores/video.svelte.js';

  let pulse = $state(true);
  $effect(() => {
    const t = setInterval(() => { pulse = !pulse; }, 700);
    return () => clearInterval(t);
  });
</script>

<div class="call-notification">
  <div class="call-header">
    <span class="call-icon" class:dim={!pulse}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94"/>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 2.15 10.94 19.79 19.79 0 0 1-.01 2.32 2 2 0 0 1 1.97.14h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.91 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4"/>
      </svg>
    </span>
    <div>
      <div class="call-title">Incoming Call</div>
      <div class="call-nick">{video.callWith}</div>
    </div>
  </div>

  <!-- Pulse bar -->
  <div class="pulse-track">
    <div class="pulse-bar" class:full={pulse}></div>
  </div>

  <div class="call-actions">
    <button class="btn-accept" onclick={() => video.acceptCall()}>Accept</button>
    <button class="btn-reject" onclick={() => video.rejectCall()}>Reject</button>
  </div>
</div>

<style>
  .call-notification {
    position: fixed;
    top: 60px;
    right: 20px;
    z-index: 10000;
    background: rgba(15, 18, 30, 0.96);
    border: 1px solid rgba(74, 222, 128, 0.4);
    border-radius: 12px;
    padding: 16px 20px;
    width: 260px;
    box-shadow: 0 0 24px rgba(74, 222, 128, 0.15), 0 8px 32px rgba(0,0,0,0.8);
    animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .call-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .call-icon {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    color: #4ade80;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }
  .call-icon svg { width: 20px; height: 20px; }
  .call-icon.dim { opacity: 0.25; }

  .call-title { color: #f3f4f6; font-size: 13px; font-weight: 700; }
  .call-nick  { color: #9ca3af; font-size: 11px; margin-top: 1px; font-family: monospace; }

  .pulse-track {
    height: 2px; background: rgba(255,255,255,0.08);
    border-radius: 2px; margin-bottom: 14px; overflow: hidden;
  }
  .pulse-bar {
    height: 100%; width: 0; background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
    transition: width 0.65s ease;
  }
  .pulse-bar.full { width: 100%; }

  .call-actions { display: flex; gap: 8px; }
  .btn-accept, .btn-reject {
    flex: 1; padding: 8px 0;
    border-radius: 8px; font-size: 12px; font-weight: 700;
    cursor: pointer; border: 1px solid; transition: background 0.15s;
  }
  .btn-accept {
    background: rgba(74,222,128,0.1); border-color: rgba(74,222,128,0.4); color: #f3f4f6;
  }
  .btn-accept:hover { background: rgba(74,222,128,0.2); }
  .btn-reject {
    background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #fca5a5;
  }
  .btn-reject:hover { background: rgba(239,68,68,0.2); }
</style>

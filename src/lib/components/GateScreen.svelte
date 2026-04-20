<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import BearLogo from './BearLogo.svelte';
  import { base } from '$app/paths';

  interface Props {
    onaccess: () => void;
  }
  const { onaccess }: Props = $props();

  let code       = $state('');
  let error      = $state('');
  let loading    = $state(false);
  let success    = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Check localStorage first — already have a valid token?
  onMount(() => {
    const stored = localStorage.getItem('db-access');
    if (stored) { onaccess(); return; }

    // Auto-submit if invite code is in the URL: ?invite=xxx
    const param = new URLSearchParams(window.location.search).get('invite');
    if (param) {
      code = param;
      // Clean the URL without reloading
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
      submit();
      return;
    }

    setTimeout(() => inputEl?.focus(), 80);
  });

  async function submit() {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) { error = 'Enter an invite code.'; return; }
    loading = true;
    error = '';
    try {
      const res = await fetch(`${base}/invite.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load invite list.');
      const data: { codes: string[] } = await res.json();
      const valid = (data.codes ?? []).map((c: string) => c.toLowerCase());
      if (valid.includes(trimmed)) {
        success = true;
        localStorage.setItem('db-access', '1');
        setTimeout(() => onaccess(), 900);
      } else {
        error = 'Invalid invite code.';
        code = '';
        setTimeout(() => inputEl?.focus(), 50);
      }
    } catch (e) {
      error = (e as Error).message || 'Network error — try again.';
    } finally {
      loading = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
    if (error) error = '';
  }
</script>

<div class="gate-root" transition:fade={{ duration: 400, easing: cubicOut }}>
  <div class="page">

    <!-- Bear brand -->
    <div class="brand" class:success>
      <div class="bear-wrap">
        <div class="bear-glow" class:bear-glow-success={success}></div>
        <BearLogo size={88} variant="full" />
      </div>
      <h1 class="wordmark">DarkBear</h1>
      <p class="tagline">WeeChat Relay Client</p>
    </div>

    <!-- Gate card -->
    <div class="card" class:card-success={success}>
      {#if success}
        <div class="success-msg" transition:fade={{ duration: 300 }}>
          <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
          Access granted
        </div>
      {:else}
        <p class="label">Enter your invite code</p>

        <div class="field-wrap" class:field-error={!!error}>
          <input
            bind:this={inputEl}
            bind:value={code}
            onkeydown={onKey}
            type="text"
            placeholder="xxxx-xxxx"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="none"
            spellcheck={false}
            disabled={loading}
            class="field"
          />
        </div>

        {#if error}
          <p class="err-msg" transition:fade={{ duration: 150 }}>{error}</p>
        {/if}

        <button onclick={submit} disabled={loading || !code.trim()} class="btn">
          {#if loading}
            <span class="spinner"></span>
          {:else}
            Continue
          {/if}
        </button>
      {/if}
    </div>

    <p class="footer-note">Need an invite? Ask in the chat.</p>
  </div>
</div>

<style>
  .gate-root {
    position: fixed;
    inset: 0;
    z-index: 100;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background:
      radial-gradient(ellipse 650px 520px at -8% -12%, rgba(29,78,216,0.20) 0%, transparent 60%),
      radial-gradient(ellipse 440px 380px at 108% 112%, rgba(109,40,217,0.14) 0%, transparent 60%),
      #0b0d13;
  }

  .page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 48px 20px;
    padding-bottom: max(48px, env(safe-area-inset-bottom, 0px));
  }

  /* ── Brand ── */
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .brand.success { transform: scale(1.06); }

  .bear-wrap {
    position: relative;
    width: 88px;
    height: 88px;
  }
  .bear-glow {
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    background: radial-gradient(ellipse 80px 80px at 50% 50%,
      rgba(59,130,246,0.22) 0%, transparent 70%);
    pointer-events: none;
    transition: background 0.6s ease;
  }
  .bear-glow-success {
    background: radial-gradient(ellipse 100px 100px at 50% 50%,
      rgba(59,130,246,0.45) 0%, transparent 70%);
  }

  .wordmark {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: #e8ecf8;
    margin: 0;
    line-height: 1;
  }
  .tagline {
    font-size: 12px;
    color: #484b62;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0;
  }

  /* ── Card ── */
  .card {
    width: 100%;
    max-width: 340px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    backdrop-filter: blur(12px);
    transition: border-color 0.5s ease, box-shadow 0.5s ease;
  }
  .card-success {
    border-color: rgba(59,130,246,0.30);
    box-shadow: 0 0 40px rgba(59,130,246,0.12);
  }

  .label {
    font-size: 13px;
    color: #9ca3b8;
    margin: 0;
    text-align: center;
  }

  /* ── Input ── */
  .field-wrap {
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.05);
    transition: border-color 0.15s;
    overflow: hidden;
  }
  .field-wrap:focus-within {
    border-color: rgba(59,130,246,0.45);
    background: rgba(255,255,255,0.07);
  }
  .field-wrap.field-error { border-color: rgba(239,68,68,0.45); }

  .field {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #e4e8f5;
    font-size: 15px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    letter-spacing: 0.08em;
    padding: 11px 16px;
    text-align: center;
  }
  .field::placeholder { color: #3a3d52; letter-spacing: 0.04em; font-family: inherit; }
  .field:disabled { opacity: 0.5; }

  .err-msg {
    font-size: 12px;
    color: #f87171;
    text-align: center;
    margin: -6px 0 0;
  }

  /* ── Button ── */
  .btn {
    width: 100%;
    padding: 12px;
    border-radius: 12px;
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
  }
  .btn:hover:not(:disabled) { opacity: 0.9; }
  .btn:active:not(:disabled) { transform: scale(0.98); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ── Success state ── */
  .success-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    color: #93c5fd;
    font-size: 15px;
    font-weight: 600;
  }
  .check {
    width: 36px;
    height: 36px;
    color: #60a5fa;
  }

  /* ── Spinner ── */
  .spinner {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.25);
    border-top-color: #fff;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .footer-note {
    font-size: 11px;
    color: #2e3148;
    margin: 0;
  }
</style>

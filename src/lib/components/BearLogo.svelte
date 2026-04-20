<script lang="ts">
  // Generate a unique prefix per instance so multiple bears on-screen
  // don't share gradient/filter IDs (SVG spec requires IDs be page-unique).
  const uid = Math.random().toString(36).slice(2, 7);

  interface Props {
    size?: number;
    // 'full'  = coloured bear (login screen, sidebar)
    // 'mono'  = single-colour ghost (watermark, icons)
    variant?: 'full' | 'mono';
    // for mono variant: colour value passed as fill/stroke colour
    color?: string;
    class?: string;
  }

  let {
    size = 96,
    variant = 'full',
    color = 'currentColor',
    class: cls = '',
  }: Props = $props();
</script>

{#if variant === 'full'}
<!-- ───────────────────────────────────────────────────────────────
     Full-colour bear — ConnectModal, sidebar, etc.
──────────────────────────────────────────────────────────────── -->
<svg
  width={size}
  height={size}
  viewBox="0 0 96 96"
  fill="none"
  aria-hidden="true"
  class={cls}
>
  <defs>
    <!-- Head gradient: cool blue highlight top-left, dark bottom-right -->
    <radialGradient id="{uid}hg" cx="38%" cy="30%" r="65%">
      <stop offset="0%"   stop-color="#2a3554"/>
      <stop offset="55%"  stop-color="#1a2238"/>
      <stop offset="100%" stop-color="#0f1520"/>
    </radialGradient>

    <!-- Ear gradient: slightly warmer/higher than head -->
    <radialGradient id="{uid}eg" cx="50%" cy="30%" r="60%">
      <stop offset="0%"   stop-color="#252d47"/>
      <stop offset="100%" stop-color="#0f1520"/>
    </radialGradient>

    <!-- Inner-ear: warm purplish tint -->
    <radialGradient id="{uid}ie" cx="50%" cy="40%" r="55%">
      <stop offset="0%"   stop-color="#2e1f3a"/>
      <stop offset="100%" stop-color="#1c1428"/>
    </radialGradient>

    <!-- Eye iris: bright blue core -->
    <radialGradient id="{uid}ey" cx="40%" cy="38%" r="55%">
      <stop offset="0%"   stop-color="#bfdbfe"/>
      <stop offset="40%"  stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </radialGradient>

    <!-- Muzzle gradient: slightly lighter than head -->
    <radialGradient id="{uid}mg" cx="50%" cy="40%" r="55%">
      <stop offset="0%"   stop-color="#1f2840"/>
      <stop offset="100%" stop-color="#131825"/>
    </radialGradient>

    <!-- Eye bloom glow -->
    <filter id="{uid}eb" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Outer ambient glow around eyes -->
    <filter id="{uid}ao" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="glow"/>
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Subtle rim-light on head edge -->
    <filter id="{uid}rl" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.8"/>
    </filter>

    <clipPath id="{uid}hc">
      <circle cx="48" cy="56" r="34"/>
    </clipPath>
  </defs>

  <!-- ── Outer ears ── -->
  <circle cx="25" cy="24" r="15"
    fill="url(#{uid}eg)"
    stroke="rgba(160,180,255,0.10)" stroke-width="1"/>
  <circle cx="71" cy="24" r="15"
    fill="url(#{uid}eg)"
    stroke="rgba(160,180,255,0.10)" stroke-width="1"/>

  <!-- Inner ears (warm hollow) -->
  <circle cx="25" cy="24" r="8.5" fill="url(#{uid}ie)"/>
  <circle cx="71" cy="24" r="8.5" fill="url(#{uid}ie)"/>

  <!-- Inner ear highlights (tiny rim) -->
  <circle cx="25" cy="22" r="4.5" fill="rgba(180,140,220,0.10)"/>
  <circle cx="71" cy="22" r="4.5" fill="rgba(180,140,220,0.10)"/>

  <!-- ── Head ── -->
  <circle cx="48" cy="56" r="34"
    fill="url(#{uid}hg)"
    stroke="rgba(140,170,255,0.10)" stroke-width="1"/>

  <!-- Fur sheen — subtle lighter arc top of head -->
  <path d="M 22 48 Q 48 22 74 48" stroke="rgba(160,190,255,0.07)" stroke-width="8" fill="none" stroke-linecap="round"/>

  <!-- Brow ridges — subtle arcs above each eye -->
  <path d="M 31 41 Q 37 37 43 41" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M 53 41 Q 59 37 65 41" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" fill="none" stroke-linecap="round"/>

  <!-- ── Eye sockets (deep dark cavities) ── -->
  <circle cx="37" cy="49" r="8" fill="#080b12"/>
  <circle cx="59" cy="49" r="8" fill="#080b12"/>

  <!-- Eye ambient glow (faint blue halo behind iris) -->
  <circle cx="37" cy="49" r="5.5" fill="rgba(59,130,246,0.25)" filter="url(#{uid}ao)"/>
  <circle cx="59" cy="49" r="5.5" fill="rgba(59,130,246,0.25)" filter="url(#{uid}ao)"/>

  <!-- Eye irises -->
  <circle cx="37" cy="49" r="5" fill="url(#{uid}ey)" filter="url(#{uid}eb)"/>
  <circle cx="59" cy="49" r="5" fill="url(#{uid}ey)" filter="url(#{uid}eb)"/>

  <!-- Pupils -->
  <circle cx="37" cy="49" r="2.2" fill="#050810"/>
  <circle cx="59" cy="49" r="2.2" fill="#050810"/>

  <!-- Specular highlights (catchlights) -->
  <circle cx="38.2" cy="47.4" r="1.6" fill="white" opacity="0.92"/>
  <circle cx="60.2" cy="47.4" r="1.6" fill="white" opacity="0.92"/>
  <circle cx="36.2" cy="50.2" r="0.7" fill="white" opacity="0.4"/>
  <circle cx="58.2" cy="50.2" r="0.7" fill="white" opacity="0.4"/>

  <!-- ── Muzzle area ── -->
  <ellipse cx="48" cy="64" rx="13" ry="9.5" fill="url(#{uid}mg)" stroke="rgba(140,170,255,0.08)" stroke-width="0.75"/>

  <!-- Nose (dark teardrop-ish ellipse) -->
  <ellipse cx="48" cy="60.5" rx="4.5" ry="3" fill="#0a0e1a" stroke="rgba(100,140,255,0.3)" stroke-width="0.75"/>
  <!-- Nose highlight -->
  <ellipse cx="47.2" cy="59.6" rx="1.5" ry="0.9" fill="rgba(160,200,255,0.25)"/>

  <!-- Subtle smile line -->
  <path d="M 44 65.5 Q 48 68 52 65.5" stroke="rgba(255,255,255,0.08)" stroke-width="1" fill="none" stroke-linecap="round"/>
</svg>

{:else}
<!-- ───────────────────────────────────────────────────────────────
     Mono bear — watermark / icon use; uses `color` prop
──────────────────────────────────────────────────────────────── -->
<svg
  width={size}
  height={size}
  viewBox="0 0 96 96"
  fill="none"
  aria-hidden="true"
  class={cls}
  style="color: {color};"
>
  <!-- Outer ears -->
  <circle cx="25" cy="24" r="15" fill="currentColor" opacity="0.22"/>
  <circle cx="71" cy="24" r="15" fill="currentColor" opacity="0.22"/>
  <!-- Inner ears -->
  <circle cx="25" cy="24" r="8.5" fill="currentColor" opacity="0.10"/>
  <circle cx="71" cy="24" r="8.5" fill="currentColor" opacity="0.10"/>

  <!-- Head -->
  <circle cx="48" cy="56" r="34" fill="currentColor" opacity="0.18"/>

  <!-- Brow ridges -->
  <path d="M 31 41 Q 37 37 43 41" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.35"/>
  <path d="M 53 41 Q 59 37 65 41" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.35"/>

  <!-- Eye sockets -->
  <circle cx="37" cy="49" r="8" fill="currentColor" opacity="0.35"/>
  <circle cx="59" cy="49" r="8" fill="currentColor" opacity="0.35"/>
  <!-- Irises -->
  <circle cx="37" cy="49" r="5" fill="currentColor" opacity="0.75"/>
  <circle cx="59" cy="49" r="5" fill="currentColor" opacity="0.75"/>
  <!-- Pupils -->
  <circle cx="37" cy="49" r="2.2" fill="currentColor" opacity="0.95"/>
  <circle cx="59" cy="49" r="2.2" fill="currentColor" opacity="0.95"/>
  <!-- Catchlights -->
  <circle cx="38.2" cy="47.4" r="1.6" fill="white" opacity="0.55"/>
  <circle cx="60.2" cy="47.4" r="1.6" fill="white" opacity="0.55"/>

  <!-- Muzzle -->
  <ellipse cx="48" cy="64" rx="13" ry="9.5" fill="currentColor" opacity="0.14"/>
  <!-- Nose -->
  <ellipse cx="48" cy="60.5" rx="4.5" ry="3" fill="currentColor" opacity="0.55"/>
</svg>
{/if}

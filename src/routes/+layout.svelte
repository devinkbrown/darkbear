<script lang="ts">
  import '../app.css';
  import { settings } from '$lib/stores/settings.svelte.js';
  let { children } = $props();

  // Derive lighter/darker variants from a hex accent color
  function lighten(hex: string, amount: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const m = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  function darken(hex: string, amount: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const m = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }

  // Apply data-theme attribute and custom color vars
  $effect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);

    const cc = settings.customColors;
    if (settings.theme === 'custom') {
      document.documentElement.style.setProperty('--color-gray-50',  cc.gray50);
      document.documentElement.style.setProperty('--color-gray-100', cc.gray100);
      document.documentElement.style.setProperty('--color-gray-200', cc.gray200);
      document.documentElement.style.setProperty('--color-gray-300', cc.gray300);
      document.documentElement.style.setProperty('--color-gray-400', cc.gray400);
      document.documentElement.style.setProperty('--color-gray-500', cc.gray500);
      document.documentElement.style.setProperty('--color-gray-600', cc.gray600);
      document.documentElement.style.setProperty('--color-gray-700', cc.gray700);
      document.documentElement.style.setProperty('--color-gray-800', cc.gray800);
      document.documentElement.style.setProperty('--color-gray-900', cc.gray900);
      document.documentElement.style.setProperty('--color-gray-950', cc.gray950);
      // Override accent (blue) palette derived from the accent color
      document.documentElement.style.setProperty('--color-blue-300', lighten(cc.accent, 0.4));
      document.documentElement.style.setProperty('--color-blue-400', lighten(cc.accent, 0.2));
      document.documentElement.style.setProperty('--color-blue-500', cc.accent);
      document.documentElement.style.setProperty('--color-blue-600', darken(cc.accent, 0.2));
      document.documentElement.style.setProperty('--color-blue-700', darken(cc.accent, 0.4));
      document.documentElement.style.setProperty('--custom-accent', cc.accent);
    } else {
      // Remove any inline custom vars set by custom theme
      for (const n of ['50','100','200','300','400','500','600','700','800','900','950']) {
        document.documentElement.style.removeProperty(`--color-gray-${n}`);
      }
      for (const n of ['300','400','500','600','700']) {
        document.documentElement.style.removeProperty(`--color-blue-${n}`);
      }
      document.documentElement.style.removeProperty('--custom-accent');
    }
  });

  // Apply font family — preset shorthand or any custom font name
  $effect(() => {
    const presets: Record<string, string> = {
      system:  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      mono:    "ui-monospace, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      serif:   "ui-serif, Georgia, 'Times New Roman', serif",
    };
    const ff = settings.fontFamily;
    const stack = presets[ff] ?? `'${ff}', ui-sans-serif, system-ui, sans-serif`;
    document.documentElement.style.setProperty('--app-font', stack);
  });

  // Apply sidebar width
  $effect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${settings.sidebarWidth}px`);
  });
</script>

<svelte:head>
  <link rel="icon" href="/favicon.svg" />
  <title>DarkBear</title>
</svelte:head>

{@render children()}

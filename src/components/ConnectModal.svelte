<script lang="ts">
	import { settings } from '$lib/stores/settings.svelte.js';
	import { chat } from '$lib/stores/chat.svelte.js';
	import { ConnectionState } from '$lib/weechat/types.js';

	interface Props {
		open: boolean;
	}

	let { open = $bindable() }: Props = $props();

	function connect() {
		settings.save();
		chat.connect();
		open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
		if (e.key === 'Enter' && e.ctrlKey) connect();
	}
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="modal-backdrop"
	onkeydown={handleKeydown}
	onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
	role="dialog"
	aria-modal="true"
	aria-label="Connect to WeeChat Relay"
>
	<div class="modal-box">
		<div class="modal-header">
			<span class="modal-title">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
				</svg>
				Connect to WeeChat Relay
			</span>
			<button class="modal-close" onclick={() => (open = false)} aria-label="Close">×</button>
		</div>

		<div class="modal-body">
			<div class="form-section">
				<label class="form-label">
					Host
					<input
						class="form-input"
						type="text"
						bind:value={settings.relay.host}
						placeholder="eshmaki.me"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
				<div class="form-row">
					<label class="form-label form-label-grow">
						Port
						<input
							class="form-input"
							type="number"
							bind:value={settings.relay.port}
							min="1"
							max="65535"
							placeholder="9001"
						/>
					</label>
					<label class="form-label form-label-tls">
						<span>TLS</span>
						<div class="toggle-wrap">
							<input
								class="toggle-input"
								type="checkbox"
								id="tls-toggle"
								bind:checked={settings.relay.tls}
							/>
							<label class="toggle-label" for="tls-toggle"></label>
						</div>
					</label>
				</div>
				<label class="form-label">
					Relay Password
					<input
						class="form-input"
						type="password"
						bind:value={settings.relay.password}
						placeholder="relay password"
						autocomplete="new-password"
					/>
				</label>
				<label class="form-label form-row-inline">
					<input type="checkbox" bind:checked={settings.relay.compression} />
					Use zlib compression
				</label>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn-secondary" onclick={() => (open = false)}>Cancel</button>
			<button
				class="btn-primary"
				onclick={connect}
				disabled={chat.connectionState === ConnectionState.CONNECTING ||
					chat.connectionState === ConnectionState.AUTHENTICATING}
			>
				{#if chat.connectionState === ConnectionState.CONNECTING || chat.connectionState === ConnectionState.AUTHENTICATING}
					Connecting…
				{:else}
					Connect
				{/if}
			</button>
		</div>
	</div>
</div>
{/if}

<style>
.modal-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.7);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.modal-box {
	background: var(--bg-2);
	border: 1px solid var(--border);
	border-radius: 8px;
	width: 400px;
	max-width: 95vw;
	max-height: 90vh;
	display: flex;
	flex-direction: column;
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px 12px;
	border-bottom: 1px solid var(--border);
}

.modal-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
	font-size: 15px;
	color: var(--fg);
}

.modal-close {
	background: none;
	border: none;
	color: var(--fg-muted);
	font-size: 22px;
	line-height: 1;
	cursor: pointer;
	padding: 0 4px;
	border-radius: 4px;
	transition: color 0.15s, background 0.15s;
}
.modal-close:hover {
	color: var(--fg);
	background: var(--bg-3);
}

.modal-body {
	padding: 16px 20px;
	overflow-y: auto;
	flex: 1;
}

.form-section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.form-label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 12px;
	color: var(--fg-muted);
	font-weight: 500;
}

.form-label-grow { flex: 1; }

.form-label-tls {
	align-items: center;
	gap: 8px;
}

.form-row {
	display: flex;
	gap: 12px;
	align-items: flex-end;
}

.form-row-inline {
	flex-direction: row;
	align-items: center;
	color: var(--fg);
	gap: 8px;
	cursor: pointer;
}

.form-input {
	background: var(--bg-1);
	border: 1px solid var(--border);
	color: var(--fg);
	padding: 7px 10px;
	border-radius: 5px;
	font-size: 14px;
	outline: none;
	transition: border-color 0.15s;
	font-family: inherit;
}
.form-input:focus { border-color: var(--accent); }

.toggle-wrap { position: relative; display: inline-block; }
.toggle-input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-label {
	display: block;
	width: 36px;
	height: 20px;
	background: var(--bg-3);
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.2s;
	border: 1px solid var(--border);
}
.toggle-input:checked + .toggle-label { background: var(--accent); }
.toggle-label::after {
	content: '';
	display: block;
	width: 14px;
	height: 14px;
	background: white;
	border-radius: 50%;
	margin: 2px;
	transition: transform 0.2s;
}
.toggle-input:checked + .toggle-label::after { transform: translateX(16px); }

.modal-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 20px 16px;
	border-top: 1px solid var(--border);
}

.btn-primary {
	background: var(--accent);
	color: white;
	border: none;
	padding: 8px 20px;
	border-radius: 5px;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: opacity 0.15s;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
	background: var(--bg-3);
	color: var(--fg);
	border: 1px solid var(--border);
	padding: 8px 16px;
	border-radius: 5px;
	font-size: 14px;
	cursor: pointer;
	transition: background 0.15s;
}
.btn-secondary:hover { background: var(--bg-4); }
</style>

import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: '0.0.0.0',
		https: {
			key: fs.readFileSync('/etc/letsencrypt/live/eshmaki.me/privkey.pem'),
			cert: fs.readFileSync('/etc/letsencrypt/live/eshmaki.me/fullchain.pem'),
		}
	}
});

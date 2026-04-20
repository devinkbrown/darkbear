import adapter from '@sveltejs/adapter-static';

// Suppress a11y warnings that are intentional design patterns
// (backdrop divs, aside containers with event delegation, role="log" message views)
const SUPPRESSED_A11Y = new Set([
	'a11y_no_noninteractive_element_interactions',
]);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	onwarn(warning, handler) {
		if (SUPPRESSED_A11Y.has(warning.code)) return;
		handler(warning);
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			strict: false,
		}),
		paths: {
			base: '/darkbear',
		},
	}
};

export default config;

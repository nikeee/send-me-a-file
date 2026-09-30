import { defineConfig } from "vite-plus";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		entry: "src/index.ts",
		format: "esm",
		platform: "node",
		target: "es2024",
		outDir: "lib",
		dts: false,
		sourcemap: false,
		clean: true,
	},
	fmt: {},
	lint: {
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: { "vite-plus/prefer-vite-plus-imports": "error" },
		options: { typeAware: true, typeCheck: true },
	},
});

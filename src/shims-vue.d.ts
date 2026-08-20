/// <reference types="vite/client" />

// Lets `tsc --noEmit` (and editor tooling that walks TS imports without a
// Vue-aware type checker) resolve `.vue` files. The runtime type of the
// default export is provided by `@vue/compiler-sfc` when the file is actually
// loaded; this shim only tells the type system that the import is a component.
declare module '*.vue' {
	import type { DefineComponent } from 'vue'
	const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
	export default component
}

// Mirror of the PostToolUse `pnpm build` hook in `.claude/settings.json` so
// OpenCode behaves the same way as Claude Code: whenever a file under `src/`
// with a frontend extension is edited or written, run a production build so
// regressions surface immediately instead of at release time.
//
// Kept narrow on purpose:
//   - Only `edit` / `write` / `multiedit` tool calls.
//   - Only paths matching `**/src/**/*.{vue,ts,tsx,js,jsx,mjs,cjs,css,scss}`.
//   - `.nothrow()` so a failed build does not abort the agent loop; the build
//     output (success or failure) is surfaced through stdout/stderr.

import type { Plugin } from "@opencode-ai/plugin"

const FRONTEND_PATH = /\/src\/.*\.(vue|ts|tsx|js|jsx|mjs|cjs|css|scss)$/
const EDIT_TOOLS = new Set(["edit", "write", "multiedit"])

export const FrontendBuild: Plugin = async ({ $ }) => ({
	"tool.execute.after": async (input) => {
		if (!EDIT_TOOLS.has(input.tool)) return
		const args = (input.args ?? {}) as {
			filePath?: string
			file_path?: string
		}
		const path = args.filePath ?? args.file_path ?? ""
		if (!FRONTEND_PATH.test(path)) return

		await $`pnpm build`.nothrow()
	},
})

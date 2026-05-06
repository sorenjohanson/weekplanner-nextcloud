// Mirror of the agent-tool guardrails in .claude/settings.json so OpenCode
// behaves the same way as Claude Code.
//
//   - Block npm / yarn (use pnpm).
//   - Block `git push --force` / `git push -f`.
//
// Static gates (commit message format, debug statements, version sync,
// version bump) are NOT enforced here — they live in `.pre-commit-config.yaml`
// and `.github/workflows/check-version-*.yml` so every code path
// (the user, any agent, CI) gets the same enforcement.
//
// The plugin API for OpenCode has shifted across versions. If a future
// release renames `tool.execute.before` or changes the refusal shape,
// adjust here; the regexes are the load-bearing part.

import type { Plugin } from "@opencode-ai/plugin"

const NPM_YARN = /^\s*(npm|yarn)\s/
const FORCE_PUSH = /git\s+push\b.*?(--force\b|-f\b)/

export const Guardrails: Plugin = async () => ({
	"tool.execute.before": async (input, output) => {
		if (input.tool !== "bash") return
		const cmd: string = (output.args as { command?: string })?.command ?? ""
		if (!cmd) return

		if (NPM_YARN.test(cmd)) {
			throw new Error("Use pnpm instead of npm/yarn.")
		}
		if (FORCE_PUSH.test(cmd)) {
			throw new Error(
				"Force pushing is not allowed. This is a public repository — " +
					"rewriting shared history breaks contributors who have already pulled.",
			)
		}
	},
})

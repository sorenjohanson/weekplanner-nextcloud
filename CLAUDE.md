# Development Guidelines

## Commit Messages

All commit messages **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

Format: `<type>(<optional scope>): <description>`

Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`

Examples:
- `feat: add custom columns below week grid`
- `fix: resolve drag-and-drop between columns`
- `chore: bump version to 1.1.0`
- `style: align custom columns with weekday grid`

This is enforced by CI via the `block-unconventional-commits` workflow.

## CI Checks

- **pnpm lint** (`pnpm run lint`): ESLint for TypeScript/Vue sources
- **psalm** (`vendor/bin/psalm`): Static analysis for PHP code

Always use pnpm!
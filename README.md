# Week Planner

<img src="img/app-dark.svg" width="100" alt="Week Planner icon">

A Nextcloud app that gives you a weekly overview of your tasks. Plan your week by organising todos across each day, similar to standalone tools like [Tweek](https://tweek.so) or [TeuxDeux](https://teuxdeux.com), but integrated directly into your Nextcloud instance.

## Features

- View your tasks in a clean, week-based layout
- Create and edit tasks for any day of the week
- Drag and drop tasks between days to reschedule them
- Tick off tasks as you complete them
- Delete tasks you no longer need

### Planned

- Recurring tasks

## Development

### Running locally across devices

`docker-compose.yml` brings up Nextcloud, Redis and the `notify_push` sidecar.
The `notify_push` WebSocket is reverse-proxied at `/push` on the same Apache
that serves Nextcloud, so it works from any hostname you reach the container
under without rebuilding.

To access the dev instance from another device (Tailscale, LAN, mDNS) copy
`.env.example` to `.env` and list every hostname clients will use:

```bash
cp .env.example .env
# edit NEXTCLOUD_TRUSTED_DOMAINS, e.g.
# NEXTCLOUD_TRUSTED_DOMAINS="localhost 192.168.1.42 macbook.tail-scale.ts.net"
docker compose up -d
```

Pages load over plain HTTP by default (`OVERWRITEPROTOCOL=http`), which is
what you want for Tailscale/LAN access without TLS. Build the JS in
development mode (`pnpm run dev` or `pnpm run watch` for live rebuilds) —
the production build assumes a secure context (HTTPS or localhost) and will
throw if it doesn't get one.

### Pre-push hooks

Local pre-push hooks run the test suite, linters, psalm and a debug-statement
check before a push reaches the remote. They are managed via
[`pre-commit`](https://pre-commit.com/):

```bash
pipx install pre-commit            # or: pip install --user pre-commit
pnpm install                       # `prepare` script wires up the pre-push hook
```

If `pre-commit` isn't on `PATH` when `pnpm install` runs, the `prepare` script
silently no-ops; install pre-commit and re-run `pnpm install` (or run
`pre-commit install --hook-type pre-push` directly) to activate the hook.

The configuration lives in `.pre-commit-config.yaml`. CI enforces the same
checks (plus version-sync and version-bump rules) on pull requests, so the
local hook is fast feedback rather than a hard gate — a contributor who
never installs it will still be blocked at the PR.

## Licence

This project is licenced under the [GNU AGPL v3 or later](LICENSE).

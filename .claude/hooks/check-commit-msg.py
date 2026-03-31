#!/usr/bin/env python3
"""
Pre-commit hook: enforce Conventional Commits format.
Reads Claude Code hook JSON from stdin.
"""

import sys
import json
import re

d = json.load(sys.stdin)
cmd = d.get('tool_input', {}).get('command', '')

if 'git commit' not in cmd:
    sys.exit(0)

msg = None

# Heredoc style: git commit -m "$(cat <<'EOF'\n   message\nEOF\n)"
hm = re.search(r'(?:-m|--message)\s+["\']?\$\(cat\s+<<["\']?EOF["\']?\s*\n(.*?)EOF', cmd, re.DOTALL)
if hm:
    msg = hm.group(1).strip().split('\n')[0].strip()

# Direct style: git commit -m "message" or git commit -m 'message'
if not msg:
    dm = re.search(r'(?:-m|--message)\s+["\']([^"\']+)', cmd)
    if dm:
        msg = dm.group(1).strip().split('\n')[0].strip()

if not msg:
    # Can't parse the message format — let it through
    sys.exit(0)

pattern = r'^(feat|fix|chore|docs|style|refactor|perf|test|ci|build)(\([^)]+\))?: .+'
if not re.match(pattern, msg):
    print(json.dumps({
        'continue': False,
        'stopReason': (
            'Commit message does not follow Conventional Commits.\n\n'
            'Format: <type>(<scope>): <description>\n'
            'Types:  feat|fix|chore|docs|style|refactor|perf|test|ci|build\n\n'
            f'Got: {msg}'
        )
    }))

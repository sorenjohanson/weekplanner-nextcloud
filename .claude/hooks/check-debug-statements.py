#!/usr/bin/env python3
"""
Pre-commit hook: block commits that add debug statements to source files.
Checks JS/TS/Vue for console.log/debug/warn/error and PHP for var_dump/die/dd.
"""

import sys
import json
import re
import subprocess

d = json.load(sys.stdin)
cmd = d.get('tool_input', {}).get('command', '')

if 'git commit' not in cmd:
    sys.exit(0)

result = subprocess.run(['git', 'diff', '--cached'], capture_output=True, text=True)
diff = result.stdout

# Only match added lines (+ but not +++ header lines)
ts_pattern = re.compile(r'^\+(?!\+\+).*console\.(log|debug|warn|error)\s*\(', re.MULTILINE)
php_pattern = re.compile(r'^\+(?!\+\+).*(var_dump\s*\(|(?<!\w)die\s*\(|(?<!\w)dd\s*\()', re.MULTILINE)

ts_hits = ts_pattern.findall(diff)
php_hits = php_pattern.findall(diff)

if ts_hits or php_hits:
    parts = []
    if ts_hits:
        methods = sorted(set(ts_hits))
        parts.append('console.' + '/'.join(methods) + '() in JS/TS/Vue')
    if php_hits:
        fns = sorted(set(h.strip().rstrip('(').rstrip() for h in php_hits))
        parts.append(', '.join(fns) + '() in PHP')

    print(json.dumps({
        'continue': False,
        'stopReason': 'Staged files contain debug statements: ' + '; '.join(parts),
    }))

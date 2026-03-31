#!/usr/bin/env python3
"""
PostToolUse hook: when a version file is edited, verify the semver bump
matches the conventional commits since the last git tag.

  feat:          → minor bump  (1.2.3 → 1.3.0)
  feat! / BREAKING CHANGE → major bump  (1.2.3 → 2.0.0)
  fix: / others  → patch bump  (1.2.3 → 1.2.4)
"""

import sys
import json
import re
import subprocess


def parse_version(v):
    m = re.match(r'(\d+)\.(\d+)\.(\d+)', v.lstrip('v'))
    return tuple(int(x) for x in m.groups()) if m else None


d = json.load(sys.stdin)
file_path = (
    d.get('tool_input', {}).get('file_path', '')
    or d.get('tool_response', {}).get('filePath', '')
)

if 'package.json' not in file_path and 'info.xml' not in file_path:
    sys.exit(0)

# Current version from package.json
try:
    current_version = json.load(open('package.json')).get('version', '')
except Exception:
    sys.exit(0)

# Last tagged version
tag_result = subprocess.run(
    ['git', 'describe', '--tags', '--abbrev=0'],
    capture_output=True, text=True,
)
if tag_result.returncode != 0:
    sys.exit(0)  # no tags yet — nothing to compare against

last_tag = tag_result.stdout.strip()
current = parse_version(current_version)
last = parse_version(last_tag)

if not current or not last or current == last:
    sys.exit(0)  # no change or unparseable

# Classify the actual bump
if current[0] > last[0]:
    actual_bump = 'major'
elif current[1] > last[1]:
    actual_bump = 'minor'
elif current[2] > last[2]:
    actual_bump = 'patch'
else:
    # Downgrade or lateral move
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PostToolUse',
            'additionalContext': (
                f'Version downgrade detected: {last_tag} → {current_version}. '
                'Versions must only increment.'
            ),
        }
    }))
    sys.exit(0)

# Analyse commits since last tag
log_result = subprocess.run(
    ['git', 'log', f'{last_tag}..HEAD', '--format=%s%n%b'],
    capture_output=True, text=True,
)
log = log_result.stdout

has_breaking = bool(re.search(r'(BREAKING[- ]CHANGE|!:)', log))
has_feat = bool(re.search(r'^feat(\([^)]+\))?[!:]', log, re.MULTILINE))
has_fix = bool(re.search(r'^fix(\([^)]+\))?:', log, re.MULTILINE))

if has_breaking:
    expected_bump = 'major'
    expected_version = f'{last[0] + 1}.0.0'
elif has_feat:
    expected_bump = 'minor'
    expected_version = f'{last[0]}.{last[1] + 1}.0'
else:
    expected_bump = 'patch'
    expected_version = f'{last[0]}.{last[1]}.{last[2] + 1}'

if actual_bump != expected_bump:
    reasons = []
    if has_breaking:
        reasons.append('breaking change')
    if has_feat:
        reasons.append('feat commit')
    if has_fix:
        reasons.append('fix commit')

    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PostToolUse',
            'additionalContext': (
                f'Version bump mismatch: {last_tag} → {current_version} is a {actual_bump} bump, '
                f'but commits since {last_tag} include a {", ".join(reasons)}, '
                f'which requires a {expected_bump} bump. '
                f'Expected version: {expected_version}.'
            ),
        }
    }))

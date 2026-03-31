#!/usr/bin/env python3
"""
PostToolUse hook: warn when package.json and appinfo/info.xml versions diverge.
"""

import sys
import json
import re

d = json.load(sys.stdin)
file_path = (
    d.get('tool_input', {}).get('file_path', '')
    or d.get('tool_response', {}).get('filePath', '')
)

if 'package.json' not in file_path and 'info.xml' not in file_path:
    sys.exit(0)

try:
    pkg_version = json.load(open('package.json')).get('version', '')
except Exception:
    sys.exit(0)

try:
    xml = open('appinfo/info.xml').read()
    m = re.search(r'<version>(.+?)</version>', xml)
    xml_version = m.group(1) if m else ''
except Exception:
    sys.exit(0)

if pkg_version and xml_version and pkg_version != xml_version:
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PostToolUse',
            'additionalContext': (
                f'Version mismatch: package.json={pkg_version}, '
                f'appinfo/info.xml={xml_version}. '
                'Both files must have the same version number.'
            ),
        }
    }))

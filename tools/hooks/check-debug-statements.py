#!/usr/bin/env python3
"""
Block introducing debug statements.

Detects:
  - console.log/debug/warn/error in JS/TS/Vue
  - var_dump / die / dd in PHP

Usage:
  - Standalone:                 scans `git diff --cached` (good for ad-hoc /
                                manual / classic git pre-commit).
  - pre-commit framework (pre-push stage): uses PRE_COMMIT_FROM_REF /
                                PRE_COMMIT_TO_REF set by pre-commit.

Exits non-zero with a human-readable message when a hit is found.
"""

import os
import re
import subprocess
import sys


def get_diff() -> str:
    from_ref = os.environ.get("PRE_COMMIT_FROM_REF")
    to_ref = os.environ.get("PRE_COMMIT_TO_REF")

    if from_ref and to_ref:
        cmd = ["git", "diff", f"{from_ref}..{to_ref}"]
    else:
        cmd = ["git", "diff", "--cached"]

    return subprocess.run(cmd, capture_output=True, text=True, check=False).stdout


def main() -> int:
    diff = get_diff()
    if not diff:
        return 0

    ts_pattern = re.compile(
        r"^\+(?!\+\+).*console\.(log|debug|warn|error)\s*\(", re.MULTILINE
    )
    php_pattern = re.compile(
        r"^\+(?!\+\+).*(var_dump\s*\(|(?<!\w)die\s*\(|(?<!\w)dd\s*\()",
        re.MULTILINE,
    )

    ts_hits = ts_pattern.findall(diff)
    php_hits = php_pattern.findall(diff)

    if not (ts_hits or php_hits):
        return 0

    parts = []
    if ts_hits:
        methods = sorted(set(ts_hits))
        parts.append("console." + "/".join(methods) + "() in JS/TS/Vue")
    if php_hits:
        fns = sorted(set(h.strip().rstrip("(").rstrip() for h in php_hits))
        parts.append(", ".join(fns) + "() in PHP")

    print("Debug statements detected: " + "; ".join(parts), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

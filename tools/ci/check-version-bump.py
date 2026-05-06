#!/usr/bin/env python3
"""
Verify the semver bump in package.json matches the conventional commits
since the last git tag.

  feat:                                   → minor bump
  feat! / fix! / BREAKING CHANGE          → major bump
  fix: / chore: / docs: / refactor: / ... → patch bump

If the version on disk equals the last tag, nothing to check (this PR is
not a release PR). If it differs, the bump must match what the commits
imply.

Requires `fetch-depth: 0` in the GitHub Actions checkout step so that
tags are available.
"""

import json
import re
import subprocess
import sys
from pathlib import Path


def parse_version(v: str):
    m = re.match(r"(\d+)\.(\d+)\.(\d+)", v.lstrip("v"))
    return tuple(int(x) for x in m.groups()) if m else None


def main() -> int:
    try:
        current_version = json.loads(Path("package.json").read_text()).get(
            "version", ""
        )
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Could not read package.json: {e}", file=sys.stderr)
        return 1

    tag_result = subprocess.run(
        ["git", "describe", "--tags", "--abbrev=0"],
        capture_output=True,
        text=True,
        check=False,
    )
    if tag_result.returncode != 0:
        print("No git tags found — skipping version bump check.")
        return 0

    last_tag = tag_result.stdout.strip()
    current = parse_version(current_version)
    last = parse_version(last_tag)

    if not current or not last:
        print(
            f"Could not parse versions: tag={last_tag!r}, "
            f"package.json={current_version!r}",
            file=sys.stderr,
        )
        return 1

    if current == last:
        print(f"Version unchanged ({current_version}); nothing to verify.")
        return 0

    if current[0] > last[0]:
        actual_bump = "major"
    elif current[0] == last[0] and current[1] > last[1]:
        actual_bump = "minor"
    elif current[0] == last[0] and current[1] == last[1] and current[2] > last[2]:
        actual_bump = "patch"
    else:
        print(
            f"Version downgrade or non-monotonic change: {last_tag} → "
            f"{current_version}. Versions must only increment.",
            file=sys.stderr,
        )
        return 1

    log = subprocess.run(
        ["git", "log", f"{last_tag}..HEAD", "--format=%s%n%b"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout

    has_breaking = bool(re.search(r"(BREAKING[- ]CHANGE|!:)", log))
    has_feat = bool(re.search(r"^feat(\([^)]+\))?[!:]", log, re.MULTILINE))
    has_fix = bool(re.search(r"^fix(\([^)]+\))?:", log, re.MULTILINE))

    if has_breaking:
        expected_bump = "major"
        expected_version = f"{last[0] + 1}.0.0"
    elif has_feat:
        expected_bump = "minor"
        expected_version = f"{last[0]}.{last[1] + 1}.0"
    else:
        expected_bump = "patch"
        expected_version = f"{last[0]}.{last[1]}.{last[2] + 1}"

    if actual_bump != expected_bump:
        reasons = []
        if has_breaking:
            reasons.append("breaking change")
        if has_feat:
            reasons.append("feat commit")
        if has_fix:
            reasons.append("fix commit")
        reason_str = ", ".join(reasons) if reasons else "no feat/fix/breaking commits"
        print(
            f"Version bump mismatch: {last_tag} → {current_version} is a "
            f"{actual_bump} bump, but commits since {last_tag} include "
            f"{reason_str}, which requires a {expected_bump} bump. "
            f"Expected version: {expected_version}.",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: {last_tag} → {current_version} is a correct {actual_bump} bump."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

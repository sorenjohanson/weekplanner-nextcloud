#!/usr/bin/env python3
"""
Verify that package.json and appinfo/info.xml carry the same version.

Exits non-zero with an explanation on mismatch. Used by CI; safe to run
locally too.
"""

import json
import re
import sys
from pathlib import Path


def main() -> int:
    pkg_path = Path("package.json")
    xml_path = Path("appinfo/info.xml")

    try:
        pkg_version = json.loads(pkg_path.read_text()).get("version", "")
    except FileNotFoundError:
        print(f"{pkg_path} not found", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Could not parse {pkg_path}: {e}", file=sys.stderr)
        return 1

    try:
        xml = xml_path.read_text()
    except FileNotFoundError:
        print(f"{xml_path} not found", file=sys.stderr)
        return 1

    m = re.search(r"<version>(.+?)</version>", xml)
    xml_version = m.group(1).strip() if m else ""

    if not pkg_version:
        print("package.json has no version field", file=sys.stderr)
        return 1
    if not xml_version:
        print("appinfo/info.xml has no <version> element", file=sys.stderr)
        return 1

    if pkg_version != xml_version:
        print(
            f"Version mismatch: package.json={pkg_version}, "
            f"appinfo/info.xml={xml_version}. "
            "Both files must carry the same version.",
            file=sys.stderr,
        )
        return 1

    print(f"OK: package.json and appinfo/info.xml both at {pkg_version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

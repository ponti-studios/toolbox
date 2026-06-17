#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "usage: $0 <package-dir> <command> [args...]" >&2
    exit 1
fi

package_dir="$1"
shift

if [[ ! -d "$package_dir" ]]; then
    echo "error: package directory not found: $package_dir" >&2
    exit 1
fi

rm -rf "$package_dir/.build" "$package_dir/.swiftpm"

if [[ "$1" == "swift" ]]; then
    set -- xcrun swift "${@:2}"
fi

(
    cd "$package_dir"
    "$@"
)

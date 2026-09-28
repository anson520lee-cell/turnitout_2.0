#!/bin/sh
# macOS: double-click to start the worker in Terminal.
cd "$(dirname "$0")" && node worker.mjs "$@"

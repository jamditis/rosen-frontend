#!/bin/sh
# Wrapper for rosen-submission.service ExecStart.
#
# Resolves the Poetry virtualenv path at start time instead of baking it into
# the systemd unit. `poetry env info -p` always returns the venv this project
# is currently configured to use, so the unit keeps working after
# `poetry env remove` / `poetry install` / a Python upgrade — all of which
# change the venv's hash-based directory name.
#
# Install: copy to /usr/local/sbin/rosen-submission-exec, chmod 755.
# Codex P1 finding on PR #212: hardcoded venv hash made the unit brittle.

set -eu

BACKEND_DIR=${ROSEN_BACKEND_DIR:-/home/jamditis/projects/rosen-frontend/backend}
BIND_HOST=${SUBMISSION_HOST:-127.0.0.1}
BIND_PORT=${SUBMISSION_PORT:-8084}

cd "$BACKEND_DIR"

# Poetry isn't always on root's PATH under systemd; ~/.local/bin and /usr/bin
# both cover common installs. Fall back to `python -m poetry` if the binary
# isn't visible but the package is.
if command -v poetry >/dev/null 2>&1; then
    POETRY=poetry
elif [ -x /home/jamditis/.local/bin/poetry ]; then
    POETRY=/home/jamditis/.local/bin/poetry
else
    echo "rosen-submission-exec: poetry not found on PATH" >&2
    exit 127
fi

VENV=$("$POETRY" env info -p 2>/dev/null) || {
    echo "rosen-submission-exec: 'poetry env info -p' failed in $BACKEND_DIR" >&2
    exit 1
}

if [ ! -x "$VENV/bin/gunicorn" ]; then
    echo "rosen-submission-exec: gunicorn missing at $VENV/bin/gunicorn — run 'poetry install'" >&2
    exit 1
fi

exec "$VENV/bin/gunicorn" \
    submission_server.app:app \
    --bind "$BIND_HOST:$BIND_PORT" \
    --workers 2 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile -

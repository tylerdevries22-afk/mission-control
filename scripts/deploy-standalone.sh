#!/usr/bin/env bash
# Update this checkout and redeploy its standalone server. Where a launchd plist
# for MC_LAUNCHD_LABEL exists, launchd supervises the server, so the release is
# moved aside, rebuilt and restarted through launchctl (deploy-launchd.sh).
# Other hosts keep the nohup flow below, which stops the old server itself.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=scripts/load-env.sh
. "$PROJECT_ROOT/scripts/load-env.sh"
# shellcheck source=scripts/deploy-helpers.sh
. "$PROJECT_ROOT/scripts/deploy-helpers.sh"
# shellcheck source=scripts/deploy-launchd.sh
. "$PROJECT_ROOT/scripts/deploy-launchd.sh"

BRANCH="${BRANCH:-$(git -C "$PROJECT_ROOT" branch --show-current)}"
REQUESTED_PORT="${PORT:-}"
PORT="${PORT:-3000}"
LISTEN_HOST="${MC_HOSTNAME:-0.0.0.0}"
LOG_PATH="${LOG_PATH:-/tmp/mc.log}"
VERIFY_HOST="${VERIFY_HOST:-127.0.0.1}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-180}"
PID_FILE="${PID_FILE:-$PROJECT_ROOT/.next/standalone/server.pid}"
SOURCE_DATA_DIR="$PROJECT_ROOT/.data"
BUILD_DATA_DIR="$PROJECT_ROOT/.next/build-runtime"
NODE_VERSION_FILE="$PROJECT_ROOT/.nvmrc"
LAUNCHD_LABEL="${MC_LAUNCHD_LABEL:-com.tylerdevries.mission-control}"
# Setting MC_LAUNCHD_PLIST to an empty value forces the nohup flow.
LAUNCHD_PLIST="${MC_LAUNCHD_PLIST-$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist}"
SERVICE_PORT=""
SNAPSHOT_DIR=""
RELEASE_PID=""
CSS_PATH=""

stop_pid() {
  local pid="$1"
  local label="$2"

  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    return
  fi

  echo "==> stopping $label (pid=$pid)"
  kill "$pid" 2>/dev/null || true

  for _ in $(seq 1 10); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return
    fi
    sleep 1
  done

  echo "==> force stopping $label (pid=$pid)"
  kill -9 "$pid" 2>/dev/null || true
}

stop_existing_server() {
  local -a candidate_pids=()
  local pid

  if [[ -f "$PID_FILE" ]]; then
    candidate_pids+=("$(cat "$PID_FILE" 2>/dev/null || true)")
  fi

  while IFS= read -r pid; do
    candidate_pids+=("$pid")
  done < <(list_listener_pids "$PORT")

  if command -v pgrep >/dev/null 2>&1; then
    while IFS= read -r pid; do
      candidate_pids+=("$pid")
    done < <(pgrep -f "$PROJECT_ROOT/.next/standalone/server.js" || true)
  fi

  if [[ ${#candidate_pids[@]} -eq 0 ]]; then
    return
  fi

  # macOS still ships bash 3.2, which has no associative arrays to de-duplicate with.
  while IFS= read -r pid; do
    if [[ -n "$pid" ]]; then
      stop_pid "$pid" "standalone server"
    fi
  done < <(printf '%s\n' "${candidate_pids[@]}" | sort -u)

  for _ in $(seq 1 10); do
    if [[ -z "$(list_listener_pids "$PORT" | head -n1)" ]]; then
      rm -f "$PID_FILE"
      return
    fi
    sleep 1
  done

  echo "error: port $PORT is still in use after stopping existing server" >&2
  exit 1
}

deploy_with_nohup() {
  local new_pid listener_pid

  echo "==> fetching branch $BRANCH"
  git fetch origin "$BRANCH"
  git merge --ff-only FETCH_HEAD

  load_env
  migrate_runtime_data_dir

  echo "==> stopping existing standalone server before rebuild"
  stop_existing_server

  echo "==> installing dependencies"
  pnpm install --frozen-lockfile

  echo "==> rebuilding standalone bundle"
  rm -rf .next
  build_release

  echo "==> starting standalone server"
  load_env

  PORT="$PORT" HOSTNAME="$LISTEN_HOST" nohup bash "$PROJECT_ROOT/scripts/start-standalone.sh" >"$LOG_PATH" 2>&1 &
  new_pid=$!
  echo "$new_pid" > "$PID_FILE"

  echo "==> verifying process and static assets"
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 5 "http://$VERIFY_HOST:$PORT/login" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  listener_pid="$(list_listener_pids "$PORT" | head -n1)"
  if [[ -z "${listener_pid:-}" ]]; then
    die "no listener detected on port $PORT after startup"
  fi
  if [[ "$listener_pid" != "$new_pid" ]]; then
    die "port $PORT is owned by pid=$listener_pid, expected new pid=$new_pid"
  fi
  verify_login_assets "$PORT"

  echo "==> deployed commit $(git rev-parse --short HEAD)"
  echo "    pid=$new_pid port=$PORT css=$CSS_PATH"
}

cd "$PROJECT_ROOT"
use_project_node

if [[ -n "$LAUNCHD_PLIST" && -f "$LAUNCHD_PLIST" ]]; then
  deploy_with_launchd
else
  deploy_with_nohup
fi

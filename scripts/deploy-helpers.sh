#!/usr/bin/env bash
# shellcheck shell=bash
# Helpers shared by both flows in deploy-standalone.sh. Sourced, not executed.
# Expects PROJECT_ROOT, SOURCE_DATA_DIR, BUILD_DATA_DIR, NODE_VERSION_FILE and
# VERIFY_HOST from the caller, and sets CSS_PATH for its summary line.

die() {
  echo "error: $*" >&2
  exit 1
}

use_project_node() {
  if [[ ! -f "$NODE_VERSION_FILE" ]]; then
    return
  fi

  if [[ -z "${NVM_DIR:-}" ]]; then
    export NVM_DIR="$HOME/.nvm"
  fi

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090,SC1091
    source "$NVM_DIR/nvm.sh"
    nvm use >/dev/null
  fi
}

list_listener_pids() {
  local port="$1"
  local combined=""

  if command -v lsof >/dev/null 2>&1; then
    combined+="$(
      lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    )"$'\n'
  fi

  if command -v ss >/dev/null 2>&1; then
    combined+="$(
      ss -ltnp 2>/dev/null | awk -v port=":$port" '
        index($4, port) || index($5, port) {
          if (match($0, /pid=[0-9]+/)) {
            print substr($0, RSTART + 4, RLENGTH - 4)
          }
        }
      '
    )"$'\n'
  fi

  printf '%s\n' "$combined" | awk '
    /^[0-9]+$/ {
      seen[$0] = 1
    }
    END {
      for (pid in seen) {
        print pid
      }
    }
  ' | sort -u
}

# Print a process's working directory, or nothing once it has gone.
process_cwd() {
  if [[ -L "/proc/$1/cwd" ]]; then
    readlink "/proc/$1/cwd" 2>/dev/null || true
  else
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | sed -n '1p' || true
  fi
}

# Resolve symlinks such as macOS's /var -> /private/var so paths compare equal.
real_path() {
  (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"
}

load_env() {
  if [[ -f .env ]]; then
    load_env_file .env
  fi
  if [[ -f .env.local ]]; then
    load_env_file .env.local
  fi
}

migrate_runtime_data_dir() {
  local target_data_dir="${MISSION_CONTROL_DATA_DIR:-$SOURCE_DATA_DIR}"

  if [[ "$target_data_dir" == "$SOURCE_DATA_DIR" ]]; then
    return
  fi

  mkdir -p "$target_data_dir"

  local source_db="$SOURCE_DATA_DIR/mission-control.db"
  local target_db="$target_data_dir/mission-control.db"

  if [[ -s "$target_db" || ! -s "$source_db" ]]; then
    return
  fi

  echo "==> migrating runtime data to $target_data_dir"
  if command -v sqlite3 >/dev/null 2>&1; then
    local target_db_tmp="$target_db.tmp"
    rm -f "$target_db_tmp"
    sqlite3 "$source_db" ".backup '$target_db_tmp'"
    mv "$target_db_tmp" "$target_db"

    if [[ -f "$SOURCE_DATA_DIR/mission-control-tokens.json" ]]; then
      cp "$SOURCE_DATA_DIR/mission-control-tokens.json" "$target_data_dir/mission-control-tokens.json"
    fi
    if [[ -d "$SOURCE_DATA_DIR/backups" ]]; then
      rsync -a "$SOURCE_DATA_DIR/backups"/ "$target_data_dir/backups"/
    fi
  else
    rsync -a \
      --exclude 'mission-control.db-shm' \
      --exclude 'mission-control.db-wal' \
      --exclude '*.db-shm' \
      --exclude '*.db-wal' \
      "$SOURCE_DATA_DIR"/ "$target_data_dir"/
  fi
}

# Point the build at a throwaway data dir so nothing it executes opens the live database.
build_release() {
  mkdir -p "$BUILD_DATA_DIR"
  MISSION_CONTROL_DATA_DIR="$BUILD_DATA_DIR" \
  MISSION_CONTROL_DB_PATH="$BUILD_DATA_DIR/mission-control.db" \
  MISSION_CONTROL_TOKENS_PATH="$BUILD_DATA_DIR/mission-control-tokens.json" \
  pnpm build
}

# The login page must link a stylesheet that the release has on disk and serves
# as text/css. Webpack builds emit /_next/static/css/, Turbopack /_next/static/chunks/.
verify_login_assets() {
  local port="$1" login_html css_disk_path content_type
  login_html="$(curl -fsS --max-time 10 --retry 2 "http://$VERIFY_HOST:$port/login")"
  CSS_PATH="$(printf '%s\n' "$login_html" | sed -nE 's#.*(/_next/static/(css|chunks)/[^"]*\.css).*#\1#p' | sed -n '1p')"
  if [[ -z "$CSS_PATH" ]]; then
    die "no css asset found in rendered login HTML"
  fi

  css_disk_path="$PROJECT_ROOT/.next/standalone/.next${CSS_PATH#/_next}"
  if [[ ! -f "$css_disk_path" ]]; then
    die "rendered css asset missing on disk: $css_disk_path"
  fi

  # Node sends "Content-Type", and IGNORECASE only works in gawk, not in the
  # awk that macOS or Ubuntu ship, so lowercase the header name instead.
  content_type="$(curl -fsSI --max-time 10 --retry 2 "http://$VERIFY_HOST:$port$CSS_PATH" \
    | awk 'tolower($1) == "content-type:" {print $2}' | tr -d '\r')"
  if [[ "$content_type" != text/css* ]]; then
    die "css asset served with unexpected content-type: ${content_type:-missing}"
  fi
}

#!/usr/bin/env bash
# shellcheck shell=bash
# launchd steps for deploy-standalone.sh. Sourced, not executed. Expects
# PROJECT_ROOT, BRANCH, REQUESTED_PORT, VERIFY_HOST, VERIFY_TIMEOUT,
# LAUNCHD_LABEL and LAUNCHD_PLIST, uses the helpers in deploy-helpers.sh, and
# sets SERVICE_PORT, SNAPSHOT_DIR and RELEASE_PID.

launchd_target() {
  printf 'gui/%s/%s\n' "$(id -u)" "$LAUNCHD_LABEL"
}

# Print one value from the job's plist, such as EnvironmentVariables.PORT.
launchd_plist_value() {
  plutil -extract "$1" raw -o - "$LAUNCHD_PLIST" 2>/dev/null || true
}

# The plist marks this host as launchd-managed, where the nohup flow would
# delete .next under the supervised server, so a mismatch stops the deploy
# instead of falling back to that flow.
launchd_preflight() {
  local root port
  if [[ ! "$VERIFY_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
    die "VERIFY_TIMEOUT must be a whole number of seconds, got '$VERIFY_TIMEOUT'"
  fi
  if ! launchctl print "$(launchd_target)" >/dev/null 2>&1; then
    die "launchd job $LAUNCHD_LABEL is not loaded; load it with 'launchctl bootstrap gui/$(id -u) $LAUNCHD_PLIST', or set MC_LAUNCHD_PLIST= to use the nohup flow"
  fi

  root="$(launchd_plist_value WorkingDirectory)"
  if [[ -z "$root" ]]; then
    root="$(launchd_plist_value EnvironmentVariables.MISSION_CONTROL_ROOT)"
  fi
  if [[ -z "$root" ]]; then
    die "$LAUNCHD_PLIST sets neither WorkingDirectory nor MISSION_CONTROL_ROOT, so the checkout it serves is unknown"
  fi
  if [[ "$(real_path "$root")" != "$(real_path "$PROJECT_ROOT")" ]]; then
    die "launchd job $LAUNCHD_LABEL serves $root, not $PROJECT_ROOT; run the deploy from $root"
  fi

  port="$(launchd_plist_value EnvironmentVariables.PORT)"
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    die "$LAUNCHD_PLIST has no numeric EnvironmentVariables.PORT"
  fi
  if [[ -n "$REQUESTED_PORT" && "$REQUESTED_PORT" != "$port" ]]; then
    echo "==> ignoring PORT=$REQUESTED_PORT: $LAUNCHD_LABEL listens on $port"
  fi
  SERVICE_PORT="$port"
}

# The deployed line can live on a fork while `origin` points upstream, and
# pulling upstream once shipped an old UI, so follow the branch's own upstream.
fetch_tracked_branch() {
  local current upstream remote merge_ref
  current="$(git branch --show-current)"
  if [[ -z "$current" ]]; then
    die "HEAD is detached; check out the branch to deploy"
  fi
  if [[ "$BRANCH" != "$current" ]]; then
    die "launchd serves the checked-out branch $current; check out $BRANCH before deploying it"
  fi
  if ! upstream="$(git rev-parse --abbrev-ref --symbolic-full-name "$current@{upstream}" 2>/dev/null)"; then
    die "branch $current has no upstream; set one with 'git branch --set-upstream-to=<remote>/<branch>'"
  fi
  remote="$(git config --get "branch.$current.remote")"
  merge_ref="$(git config --get "branch.$current.merge")"

  echo "==> fetching $upstream"
  git fetch "$remote" "$merge_ref"
  git merge --ff-only FETCH_HEAD
}

# Move the live release aside instead of deleting it under the running server.
# Its controller keeps its cwd inside the moved tree, which is where the launchd
# wrapper and start-standalone.sh look for a previous controller to reap:
# .data/releases/.next-rollback-*/standalone.
snapshot_release() {
  local releases="$PROJECT_ROOT/.data/releases" target
  if [[ ! -d "$PROJECT_ROOT/.next" ]]; then
    echo "==> no existing .next to snapshot"
    return
  fi
  target="$releases/.next-rollback-$(date -u +%Y%m%dT%H%M%SZ)-$1"
  if [[ -e "$target" ]]; then
    die "rollback snapshot already exists: $target"
  fi
  mkdir -p "$releases"
  echo "==> moving .next to $target"
  mv "$PROJECT_ROOT/.next" "$target"
  SNAPSHOT_DIR="$target"
}

# After the kickstart the previous controller can keep answering /login from
# the snapshot for several seconds, so a 200 alone proves nothing. Only a
# listener whose cwd is the new .next/standalone counts.
wait_for_release_listener() {
  local port="$1" deadline=$((SECONDS + $2)) want pid cwd
  want="$(real_path "$PROJECT_ROOT/.next/standalone")"
  while ((SECONDS < deadline)); do
    for pid in $(list_listener_pids "$port"); do
      cwd="$(process_cwd "$pid")"
      if [[ -n "$cwd" && "$(real_path "$cwd")" == "$want" ]] \
        && curl -fsS --max-time 5 -o /dev/null "http://$VERIFY_HOST:$port/login" 2>/dev/null; then
        RELEASE_PID="$pid"
        return 0
      fi
    done
    sleep 2
  done
  return 1
}

# Once .next has moved, the running server's release paths are gone, so a
# failure has to say exactly how to put the previous release back.
print_rollback_hint() {
  local failed
  failed="$PROJECT_ROOT/.data/releases/.next-failed-$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  {
    echo "error: deploy failed; the previous release is in $SNAPSHOT_DIR"
    echo "to roll back:"
    if [[ -e "$PROJECT_ROOT/.next" ]]; then
      echo "  mv '$PROJECT_ROOT/.next' '$failed'"
    fi
    echo "  mv '$SNAPSHOT_DIR' '$PROJECT_ROOT/.next'"
    echo "  launchctl kickstart -k $(launchd_target)"
  } >&2
}

on_launchd_exit() {
  local status=$?
  if [[ "$status" != 0 && -n "$SNAPSHOT_DIR" ]]; then
    print_rollback_hint
  fi
  exit "$status"
}

deploy_with_launchd() {
  local previous_sha
  trap on_launchd_exit EXIT
  launchd_preflight
  previous_sha="$(git rev-parse --short HEAD)"
  fetch_tracked_branch

  load_env
  migrate_runtime_data_dir

  echo "==> installing dependencies"
  pnpm install --frozen-lockfile

  snapshot_release "$previous_sha"
  echo "==> rebuilding standalone bundle"
  build_release

  echo "==> restarting $(launchd_target)"
  launchctl kickstart -k "$(launchd_target)"

  echo "==> waiting up to ${VERIFY_TIMEOUT}s for port $SERVICE_PORT to serve .next/standalone"
  if ! wait_for_release_listener "$SERVICE_PORT" "$VERIFY_TIMEOUT"; then
    die "no listener on port $SERVICE_PORT is serving $PROJECT_ROOT/.next/standalone after ${VERIFY_TIMEOUT}s"
  fi
  verify_login_assets "$SERVICE_PORT"

  echo "==> deployed commit $(git rev-parse --short HEAD) through launchd"
  echo "    pid=$RELEASE_PID port=$SERVICE_PORT css=$CSS_PATH"
  echo "    previous release: ${SNAPSHOT_DIR:-none}"
}

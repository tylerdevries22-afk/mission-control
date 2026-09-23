#!/usr/bin/env bash
# `pnpm deploy:standalone` has to work with the launchd job that supervises the
# production server instead of fighting it: follow the branch's own upstream
# (the deployed line is a fork, and `origin` is upstream), take the port from
# the plist, move the live release aside rather than delete it under the
# running server, restart through launchctl, and accept only a listener that
# runs from the new .next/standalone. Hosts without the plist keep the nohup
# flow. The real script runs against throwaway checkouts and stand-ins, so
# nothing here can reach the real service.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mc-deploy.XXXXXX")"
# macOS's TMPDIR ends in a slash; drop the resulting // the way the scripts' own
# `pwd` does, but keep the /var -> /private/var symlink that lsof resolves.
TMP_DIR="$(cd "$TMP_DIR" && pwd)"

cleanup() {
  # Capture and re-assert the status first: bash lets the trap's own last command
  # become the script's exit status, which would turn an aborted run into a pass.
  local status=$? pidfile
  for pidfile in "$TMP_DIR"/*.pid "$TMP_DIR"/legacy/.next/standalone/server.pid; do
    if [[ -f "$pidfile" ]]; then kill -KILL "$(cat "$pidfile")" 2>/dev/null || true; fi
  done
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT

fail() { echo "deploy-standalone: $1" >&2; exit 1; }

# shellcheck source=scripts/deploy-standalone.fixture.sh
. "$ROOT_DIR/scripts/deploy-standalone.fixture.sh"

LIVE="$TMP_DIR/live"
checkout "$LIVE" -o fork "$TMP_DIR/fork.git"
git -C "$LIVE" remote add origin "$TMP_DIR/upstream.git"
PORT_A="$(free_port)"
write_plist "$TMP_DIR/live.plist" "$LIVE" "$PORT_A"
touch "$FAKE_STATE/loaded"
export FAKE_ROOT="$LIVE" FAKE_PORT="$PORT_A"
LAUNCHD=(MC_LAUNCHD_LABEL="$LABEL" MC_LAUNCHD_PLIST="$TMP_DIR/live.plist" VERIFY_TIMEOUT=30)

# A launchd host never falls back to the nohup flow, and nothing is fetched or
# moved until the job, the checkout it serves and the branch all check out.
refused() {  # <case> <expected message> [VAR=value...]
  local name="$1" message="$2"
  shift 2
  if deploy "$LIVE" "$TMP_DIR/refused.out" "${LAUNCHD[@]}" "$@"; then fail "$name: the deploy went ahead"; fi
  grep -qF -- "$message" "$TMP_DIR/refused.out" || fail "$name: expected '$message' in: $(cat "$TMP_DIR/refused.out")"
  [[ -f "$LIVE/.next/standalone/server.js" && ! -e "$LIVE/.data/releases" ]] || fail "$name: the release moved anyway"
  [[ "$(git -C "$LIVE" rev-parse HEAD)" == "$BASE" ]] || fail "$name: the branch moved anyway"
}
rm "$FAKE_STATE/loaded"
refused "unloaded job" "launchd job $LABEL is not loaded"
touch "$FAKE_STATE/loaded"
write_plist "$TMP_DIR/elsewhere.plist" "$TMP_DIR/elsewhere" "$PORT_A"
refused "another checkout" "serves $TMP_DIR/elsewhere," MC_LAUNCHD_PLIST="$TMP_DIR/elsewhere.plist"
refused "another branch" "check out feature before deploying it" BRANCH=feature
git -C "$LIVE" branch -q --unset-upstream
refused "untracked branch" "branch main has no upstream"
git -C "$LIVE" branch -q --set-upstream-to=fork/main

# The real deploy, with the previous release serving the plist's port.
start_release "$LIVE" "$PORT_A" "$FAKE_STATE/old.pid"
: > "$STUB_LOG"
deploy "$LIVE" "$TMP_DIR/launchd.out" "${LAUNCHD[@]}" PORT=1 BUILD_MARK=new \
  || fail "the launchd deploy failed: $(cat "$TMP_DIR/launchd.out")"
out="$(cat "$TMP_DIR/launchd.out")"
[[ "$(git -C "$LIVE" rev-parse HEAD)" == "$FORK_TIP" ]] \
  || fail "deployed '$(git -C "$LIVE" log -1 --format=%s)' instead of the tracked fork's tip"
[[ "$out" == *"ignoring PORT=1"* && "$out" == *" port=$PORT_A "* ]] || fail "PORT won over the plist's port: $out"
snapshot=("$LIVE"/.data/releases/.next-rollback-*-"$(git -C "$LIVE" rev-parse --short "$BASE")")
[[ -f "${snapshot[0]}/static/css/app-old.css" ]] || fail "the previous release was not kept under .data/releases"
grep -qxF "pnpm build data=$LIVE/.next/build-runtime" "$STUB_LOG" || fail "the build was not isolated from the live data dir"
grep -qxF "launchctl kickstart -k gui/$(id -u)/$LABEL" "$STUB_LOG" || fail "the job was not restarted with launchctl kickstart"
[[ ! -e "$LIVE/.next/standalone/server.pid" ]] || fail "launchd mode started its own nohup server"
# The previous controller kept answering /login after the kickstart, so the
# deploy must have waited for, and then verified, the restarted job's listener.
[[ "$out" == *"pid=$(cat "$FAKE_STATE/new.pid") port=$PORT_A css=/_next/static/css/app-new.css"* ]] \
  || fail "the deploy did not verify the restarted job's listener: $out"
if kill -0 "$(cat "$FAKE_STATE/old.pid")" 2>/dev/null; then fail "the previous controller survived the restart"; fi

# A build that fails after the release moved must say how to put it back, and
# must not restart the job onto a broken tree.
if deploy "$LIVE" "$TMP_DIR/failed.out" "${LAUNCHD[@]}" BUILD_MARK=broken FAIL_BUILD=1; then
  fail "a failed build was reported as a deploy"
fi
grep -qF "  mv '$LIVE/.data/releases/.next-rollback-" "$TMP_DIR/failed.out" \
  || fail "a failed build did not print how to roll back: $(cat "$TMP_DIR/failed.out")"
[[ "$(grep -c '^launchctl kickstart' "$STUB_LOG")" == 1 ]] || fail "a failed build still restarted the job"

# Without the plist the nohup flow is unchanged: it fast-forwards from origin,
# stops whatever holds PORT, rebuilds in place and verifies its own server.
LEGACY="$TMP_DIR/legacy"
checkout "$LEGACY" "$TMP_DIR/upstream.git"
PORT_B="$(free_port)"
start_release "$LEGACY" "$PORT_B" "$TMP_DIR/legacy-old.pid"
: > "$STUB_LOG"
deploy "$LEGACY" "$TMP_DIR/legacy.out" MC_LAUNCHD_PLIST= PORT="$PORT_B" MC_HOSTNAME=127.0.0.1 \
  LOG_PATH="$TMP_DIR/legacy.log" BUILD_MARK=new || fail "the nohup deploy failed: $(cat "$TMP_DIR/legacy.out")"
[[ "$(git -C "$LEGACY" rev-parse HEAD)" == "$UPSTREAM_TIP" ]] || fail "the nohup flow no longer fast-forwards from origin"
if kill -0 "$(cat "$TMP_DIR/legacy-old.pid")" 2>/dev/null; then fail "the nohup flow left the old server running"; fi
[[ ! -e "$LEGACY/.data/releases" ]] || fail "the nohup flow snapshotted instead of rebuilding in place"
if grep -q '^launchctl' "$STUB_LOG"; then fail "the nohup flow called launchctl"; fi
grep -qF "pid=$(cat "$LEGACY/.next/standalone/server.pid") port=$PORT_B css=/_next/static/css/app-new.css" \
  "$TMP_DIR/legacy.out" || fail "the nohup flow did not verify its own server: $(cat "$TMP_DIR/legacy.out")"

echo "deploy-standalone: launchd deploys follow the tracked remote, keep the previous release and wait for the restarted job; the nohup flow is unchanged"

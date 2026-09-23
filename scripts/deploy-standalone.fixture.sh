#!/usr/bin/env bash
# shellcheck shell=bash
# Throwaway checkouts and stand-ins for deploy-standalone.test.sh. Sourced, not
# executed; expects ROOT_DIR and TMP_DIR. Everything the deploy could reach on a
# real machine is replaced: git runs without global config or hooks, HOME has no
# LaunchAgents, and launchctl, pnpm and (where missing) plutil are stubs.

LABEL="com.example.mission-control-deploy-test"
STUBS="$TMP_DIR/bin"
export HOME="$TMP_DIR/home" NVM_DIR="$TMP_DIR/home/.nvm"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export STUB_LOG="$TMP_DIR/calls.log" FAKE_STATE="$TMP_DIR" FAKE_LABEL="$LABEL"
export FAKE_SERVER="$TMP_DIR/server.js"
unset PORT BRANCH LOG_PATH PID_FILE VERIFY_HOST VERIFY_TIMEOUT MC_HOSTNAME \
  MC_LAUNCHD_LABEL MC_LAUNCHD_PLIST MC_USE_DOPPLER MISSION_CONTROL_DATA_DIR
mkdir -p "$HOME" "$STUBS"

# The stand-in release links a stylesheet named after its build, the way the
# real login page links /_next/static/css/<hash>.css, and serves it the way Node
# does, with a capitalised Content-Type header.
cat > "$FAKE_SERVER" <<'EOF'
const fs = require('fs')
const http = require('http')
const path = require('path')
const dir = path.join(__dirname, '.next', 'static', 'css')
const css = fs.readdirSync(dir).find((name) => name.endsWith('.css'))
http.createServer((req, res) => {
  const file = path.join(dir, css)
  if (req.url === '/login') {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<link rel="stylesheet" href="/_next/static/css/${css}">`)
  } else if (req.url === `/_next/static/css/${css}` && fs.existsSync(file)) {
    res.setHeader('Content-Type', 'text/css; charset=UTF-8')
    res.end(fs.readFileSync(file))
  } else {
    res.statusCode = 404
    res.end()
  }
}).listen(Number(process.env.PORT), process.env.HOSTNAME)
EOF

cat > "$STUBS/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $* data=${MISSION_CONTROL_DATA_DIR:-}" >> "$STUB_LOG"
[[ "$1" == build ]] || exit 0
if [[ -n "${FAIL_BUILD:-}" ]]; then mkdir -p .next; exit 1; fi
mkdir -p .next/standalone .next/static/css
cp "$FAKE_SERVER" .next/standalone/server.js
printf 'body{}\n' > ".next/static/css/app-$BUILD_MARK.css"
EOF

# `launchctl kickstart -k` stops the job, but the node controller it forked
# lingers on the port until the next start-standalone.sh reaps it by its cwd.
# The stub only kills it itself where lsof, which that reaper needs, is missing.
cat > "$STUBS/launchctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "launchctl $*" >> "$STUB_LOG"
target="gui/$(id -u)/$FAKE_LABEL"
case "${1:-}" in
  print) [[ "${2:-}" == "$target" && -f "$FAKE_STATE/loaded" ]] ;;
  kickstart)
    [[ "${2:-}" == -k && "${3:-}" == "$target" ]] || exit 64
    nohup bash -c 'sleep 2
      command -v lsof >/dev/null || kill "$(cat "$FAKE_STATE/old.pid")"
      cd "$FAKE_ROOT"
      PORT="$FAKE_PORT" HOSTNAME=127.0.0.1 bash scripts/start-standalone.sh >"$FAKE_STATE/new.log" 2>&1 &
      echo $! > "$FAKE_STATE/new.pid"' >/dev/null 2>&1 &
    ;;
  *) exit 64 ;;
esac
EOF

if ! command -v plutil >/dev/null 2>&1; then
  # Linux has no plutil: print the <string> after the keypath's last <key>.
  cat > "$STUBS/plutil" <<'EOF'
#!/usr/bin/env bash
[[ "$1 $3 $4 $5" == "-extract raw -o -" ]] || exit 64
awk -v key="<key>${2##*.}</key>" '
  found { if (match($0, /<string>[^<]*</)) { print substr($0, RSTART + 8, RLENGTH - 9); ok = 1 }; exit }
  index($0, key) { found = 1 }
  END { exit !ok }' "$6"
EOF
fi
chmod +x "$STUBS"/*
export PATH="$STUBS:$PATH"

# One base commit carries the scripts under test; a bare "fork" and a bare
# "upstream" then each gain a different commit on top of it.
SEED="$TMP_DIR/seed"
mkdir -p "$SEED/scripts" "$SEED/public/brand"
for name in deploy-standalone deploy-helpers deploy-launchd load-env start-standalone; do
  cp "$ROOT_DIR/scripts/$name.sh" "$SEED/scripts/"
done
printf 'png' > "$SEED/public/brand/mc-logo-128.png"
printf '.next/\n.data/\n' > "$SEED/.gitignore"
git init -q -b main "$SEED"
git -C "$SEED" add -A
git -C "$SEED" commit -qm base
BASE="$(git -C "$SEED" rev-parse HEAD)"
for remote in fork upstream; do
  git clone -q --bare "$SEED" "$TMP_DIR/$remote.git"
  git clone -q "$TMP_DIR/$remote.git" "$TMP_DIR/$remote-work"
  echo "$remote" > "$TMP_DIR/$remote-work/tip.txt"
  git -C "$TMP_DIR/$remote-work" add -A
  git -C "$TMP_DIR/$remote-work" commit -qm "$remote tip"
  git -C "$TMP_DIR/$remote-work" push -q origin main
done
# shellcheck disable=SC2034 # read by deploy-standalone.test.sh
FORK_TIP="$(git -C "$TMP_DIR/fork-work" rev-parse HEAD)"
# shellcheck disable=SC2034 # read by deploy-standalone.test.sh
UPSTREAM_TIP="$(git -C "$TMP_DIR/upstream-work" rev-parse HEAD)"

# checkout <dir> <git clone args...>: a clone reset to the base commit, so it is
# one commit behind its remote, with an "old" release already built.
checkout() {
  local dir="$1"
  shift
  git clone -q "$@" "$dir"
  git -C "$dir" reset -q --hard "$BASE"
  (cd "$dir" && BUILD_MARK=old STUB_LOG=/dev/null pnpm build)
}

free_port() {
  node -e 'const s = require("net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close() })'
}

# start_release <checkout> <port> <pidfile>: run the release the way the service
# does, detached so it is reparented like a real controller, and wait for it.
start_release() {
  (cd "$1" && PORT="$2" HOSTNAME=127.0.0.1 bash -c 'bash scripts/start-standalone.sh >/dev/null 2>&1 & echo $!') > "$3"
  for _ in $(seq 1 50); do
    if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:$2/login" 2>/dev/null; then return 0; fi
    sleep 0.2
  done
  fail "the release in $1 never answered on port $2"
}

# deploy <checkout> <output file> [VAR=value...]: run the script under test there.
deploy() {
  local dir="$1" out="$2"
  shift 2
  (cd "$dir" && env "$@" bash scripts/deploy-standalone.sh) > "$out" 2>&1
}

write_plist() {  # <file> <working directory> <port>
  cat > "$1" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PORT</key>
		<string>$3</string>
	</dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>WorkingDirectory</key>
	<string>$2</string>
</dict>
</plist>
EOF
}

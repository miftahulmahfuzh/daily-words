#!/usr/bin/env bash
# verify.sh: launch, drive and tear down a throwaway Daily Words for verification.
#
# Every run gets its own Postgres database (one shared Docker container with pgvector), a snapshot
# of the checkout served by its own `next dev` on a free loopback port (never 3200, which is the
# owner's), three seeded users with database sessions, a loopback stand-in holding the paid-call
# budget and a fake push service, and an egress guard in every Node process it starts. z.ai is
# real under a budget; embeddings only behind --embed. Nothing touches the production Neon
# database, real push endpoints, Google, Vercel or GitHub. Evidence lives under
# $VERIFY_HOME/<run>/evidence and survives `down`.
#
#   verify.sh up [--llm=N | --offline] [--embed[=N]]
#                                        start a run from the current checkout; prints RUN= URL= EVIDENCE= MODE=
#   verify.sh doctor RUN                 is this run worth driving? (read-only)
#   verify.sh api RUN [--as USER|--anon] METHOD PATH [JSON]
#                                        HTTP as a seeded user (demo, stranger, newcomer) or signed out;
#                                        request + response saved as evidence, pages as visible text
#   verify.sh ui RUN STEPS.mjs [--as USER|--anon] [--width N] [--height N] [--theme light|dark]
#                              [--tz ZONE] [-- ARG...]
#                                        drive the app with Playwright (video + screenshots), fenced
#   verify.sh layout RUN [SPEC...]       the repo's own Playwright suite (tests/e2e) against this run
#   verify.sh push RUN subscribe [--gone] [--as USER]
#                                        register a device on the run's fake push service through
#                                        POST /api/push/subscription (--gone: it answers 410)
#   verify.sh push RUN inbox             what the fake push service received, decrypted
#   verify.sh tick RUN [--secret=WRONG]  POST /api/push/tick with the run's own CRON_SECRET
#   verify.sh sql RUN [--value] "SELECT ..."
#                                        read the run's Postgres (read-only transaction); --value: one bare cell
#   verify.sh logs RUN [REGEX] [N]       the server log's matching lines (default: errors, blocks)
#   verify.sh budget RUN                 paid calls spent / left / refused
#   verify.sh note RUN "TEXT"            append a line to evidence/LOG.md (what you proved)
#   verify.sh down RUN|--all             stop what `up` started, drop its DB; evidence stays
#   verify.sh ls                         runs with state, mode and evidence count
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_HOME="${VERIFY_HOME:-$HOME/.local/state/daily-words-verify}"
PG_CONTAINER=daily-words-pg-verify
PG_IMAGE=pgvector/pgvector:pg16
PG_PORT=55439
# 3200 belongs to the owner's `npm run dev` (CLAUDE.md). A run never binds it and never touches
# whatever listens there.
OWNER_PORT=3200
# next/font/google downloads Source Serif 4 and IBM Plex Mono while compiling: a public font CDN.
FONT_HOSTS=fonts.googleapis.com,fonts.gstatic.com
DEFAULT_LLM=20
USERS=(demo stranger newcomer)

die() { echo "verify: $*" >&2; exit 1; }
repo_root() { git rev-parse --show-toplevel 2>/dev/null || die "run from inside a daily-words checkout"; }
# The main checkout: where .env.local lives (a worktree may not have one).
main_root() { (cd "$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)/.." && pwd); }

run_dir() {
  local run=${1:-}
  [ -n "$run" ] || die "missing RUN id (see: verify.sh ls)"
  [ -d "$VERIFY_HOME/$run" ] || die "no run $run under $VERIFY_HOME"
  echo "$VERIFY_HOME/$run"
}
live_dir() { local d; d="$(run_dir "${1:-}")"; [ ! -f "$d/state" ] || die "run $1 is stopped"; echo "$d"; }
meta() { sed -n "s/^$2=//p" "$1/meta" | sed -n 1p; }
free_port() {
  local p
  while :; do
    p="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
    [ "$p" != "$OWNER_PORT" ] && { echo "$p"; return; }
  done
}
slug() { printf %s "$1" | tr -c 'a-zA-Z0-9_.-' '_' | cut -c1-40; }

# Numbered evidence: evidence/NN-<kind>-<slug>.<ext>, counting only the primary .txt files.
next_evidence() {
  local dir=$1/evidence n
  n=$(find "$dir" -maxdepth 1 -type f -name '[0-9][0-9]-*.txt' ! -name '00-*' | wc -l)   # 00-*: up's own
  printf '%s/%02d-%s-%s.%s' "$dir" $((n + 1)) "$2" "$(slug "$3")" "$4"
}

# What the code under test is: HEAD plus a digest of uncommitted changes to the app's own paths.
APP_PATHS=(src public drizzle scripts tests package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs playwright.config.ts)
tree_digest() {
  { git -C "$1" diff HEAD -- "${APP_PATHS[@]}"
    git -C "$1" ls-files --others --exclude-standard -- "${APP_PATHS[@]}" | sort | while read -r f; do sha1sum "$1/$f"; done
  } 2>/dev/null | sha1sum | cut -c1-12
}

ensure_pg() {
  command -v docker >/dev/null || die "docker is not on PATH"
  local state
  state="$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" || state=missing
  case "$state" in
    true) ;;
    false) docker start "$PG_CONTAINER" >/dev/null ;;
    # trust auth: bound to 127.0.0.1 only, holds nothing but throwaway v_* databases.
    *) docker run -d --name "$PG_CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust \
         -p "127.0.0.1:$PG_PORT:5432" "$PG_IMAGE" >/dev/null ;;
  esac
  for _ in $(seq 1 60); do
    docker exec "$PG_CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  die "$PG_CONTAINER did not become ready in 60s"
}
psql_run() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -X -q -U postgres "$@"; }

# One value from the main checkout's .env.local, parsed (never sourced).
env_value() {
  sed -n "s/^$2=//p" "$1/.env.local" 2>/dev/null | sed -n 1p | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
host_of() { printf %s "$1" | sed -E 's#^[a-z]+://([^/:]+).*#\1#'; }

# The environment of every process the run owns: nothing inherited but PATH/HOME/locale, so no
# secret in the caller's shell (the production DATABASE_URL, VERCEL_*, a real CRON_SECRET) leaks in.
# The snapshot has no .env.local, so Next and dotenv find nothing to load either.
write_env() {
  local dir=$1 sp
  sp="http://127.0.0.1:$(cat "$dir/standin_port")"
  {
    printf '%s\n' "PATH=$PATH" "HOME=$dir/home" "LANG=${LANG:-C.UTF-8}" "TERM=dumb" "NEXT_TELEMETRY_DISABLED=1"
    echo "DATABASE_URL=postgresql://postgres@127.0.0.1:$PG_PORT/$(meta "$dir" db)"
    echo "DATABASE_URL_UNPOOLED=postgresql://postgres@127.0.0.1:$PG_PORT/$(meta "$dir" db)"
    echo "AUTH_SECRET=$(cat "$dir/secrets/auth")"
    echo "AUTH_GOOGLE_ID=dw-verify-unused"
    echo "AUTH_GOOGLE_SECRET=dw-verify-unused"
    echo "AUTH_TRUST_HOST=true"
    cat "$dir/secrets/llm.env"
    cat "$dir/secrets/embed.env"
    echo "APP_URL=$(base_of "$dir")"
    cat "$dir/secrets/vapid.env"
    echo "VAPID_SUBJECT=mailto:verify@daily-words-verify.invalid"
    echo "CRON_SECRET=$(cat "$dir/secrets/cron")"
    echo "NODE_EXTRA_CA_CERTS=$dir/secrets/push-cert.pem"
    echo "NODE_OPTIONS=--import=file://$HERE/preload.mjs"
    echo "DW_VERIFY_STANDIN=$sp"
    echo "DW_VERIFY_ALLOW_HOSTS=$FONT_HOSTS"
    echo "DW_VERIFY_PAID_HOSTS=$(meta "$dir" paid_hosts)"
  } >"$dir/web.env"
  chmod 600 "$dir/web.env"
}

# Run a command under an env file (one VAR=value per line), with nothing else inherited.
with_env() { local file=$1; shift; local -a e=(); mapfile -t e <"$file"; env -i "${e[@]}" "$@"; }

# The run is addressed as localhost (bound to 127.0.0.1 only): `next dev` reports every request's
# req.url as http://localhost:PORT whatever the Host header said, so a route that redirects with
# new URL(path, req.url) (/s/<slug>/claim) would otherwise move the browser to another cookie origin.
base_of() { echo "http://localhost:$(cat "$1/port")"; }
token_of() {
  [ -f "$1/sessions/$2" ] || die "no seeded user '$2' (users: ${USERS[*]})"
  cat "$1/sessions/$2"
}

cmd_up() {
  local llm=$DEFAULT_LLM embed=0
  for a in "$@"; do
    case "$a" in
      --llm=*) llm=${a#--llm=}; [[ $llm =~ ^[0-9]+$ ]] || die "--llm=N takes a number" ;;
      --offline) llm=0; embed=0 ;;
      --embed) embed=5 ;;
      --embed=*) embed=${a#--embed=}; [[ $embed =~ ^[0-9]+$ ]] || die "--embed=N takes a number" ;;
      *) die "up: unknown flag $a (see verify.sh with no arguments)" ;;
    esac
  done
  local root main run dir db
  root="$(repo_root)"
  [ -f "$root/src/lib/env.ts" ] && [ -f "$root/scripts/seed-demo.ts" ] || die "$root is not a daily-words checkout"
  [ -d "$root/node_modules/next" ] || die "no node_modules in $root (npm ci)"
  main="$(main_root "$root")"
  if [ "$llm" != 0 ]; then [ -n "$(env_value "$main" LLM_API_KEY)" ] || die "LLM_API_KEY is not in $main/.env.local (or run --offline)"; fi
  if [ "$embed" != 0 ]; then [ -n "$(env_value "$main" EMBEDDING_API_KEY)" ] || die "--embed: EMBEDDING_API_KEY is not in $main/.env.local"; fi

  run="$(date +%m%d-%H%M%S)-$$"
  dir="$VERIFY_HOME/$run"
  db="v_$(echo "$run" | tr -- '-' '_')"
  mkdir -p "$dir/evidence" "$dir/secrets" "$dir/home" "$dir/sessions" "$dir/push"
  chmod 700 "$dir/secrets" "$dir/sessions"
  : >"$dir/pgids"

  # Paid hosts: the LLM endpoint the checkout is configured for, and the embeddings provider.
  local llm_url embed_url
  llm_url="$(env_value "$main" LLM_BASE_URL)"; llm_url=${llm_url:-https://api.z.ai/api/anthropic}
  embed_url="$(env_value "$main" EMBEDDING_BASE_URL)"; embed_url=${embed_url:-https://api.openai.com/v1}
  {
    echo "repo=$root"; echo "main=$main"
    echo "head=$(git -C "$root" rev-parse --short HEAD)"; echo "tree=$(tree_digest "$root")"
    echo "db=$db"; echo "llm=$llm"; echo "embed=$embed"
    echo "mode=$([ "$llm$embed" = 00 ] && echo offline || echo "real(llm=$llm embed=$embed)")"
    echo "paid_hosts=$(host_of "$llm_url")=llm,$(host_of "$embed_url")=embed"
    echo "started=$(date -Iseconds)"
  } >"$dir/meta"

  # Secrets of the run's own: random, or the real provider key only when its budget allows calls.
  head -c 32 /dev/urandom | base64 >"$dir/secrets/auth"
  head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' >"$dir/secrets/cron"
  {
    # LLM_* are required by lib/env.ts: the app does not boot without them. Offline they hold a
    # placeholder key and the budget refuses every call before it leaves.
    if [ "$llm" != 0 ]; then echo "LLM_API_KEY=$(env_value "$main" LLM_API_KEY)"; else echo "LLM_API_KEY=dw-verify-offline-no-key"; fi
    echo "LLM_BASE_URL=$llm_url"
    echo "LLM_MODEL=$(env_value "$main" LLM_MODEL | sed 's/^$/glm-4.6/')"
  } >"$dir/secrets/llm.env"
  {
    echo "EMBEDDING_BASE_URL=$embed_url"
    if [ "$embed" != 0 ]; then
      echo "EMBEDDING_API_KEY=$(env_value "$main" EMBEDDING_API_KEY)"
      echo "EMBEDDING_MODEL=$(env_value "$main" EMBEDDING_MODEL | sed 's/^$/text-embedding-3-small/')"
    else echo "EMBEDDING_API_KEY="; fi
  } >"$dir/secrets/embed.env"
  # The fake push service's certificate, trusted by the app's Node through NODE_EXTRA_CA_CERTS.
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3 -subj /CN=127.0.0.1 \
    -addext subjectAltName=IP:127.0.0.1 -keyout "$dir/secrets/push-key.pem" -out "$dir/secrets/push-cert.pem" >/dev/null 2>&1 \
    || die "openssl could not mint the push sink's certificate"

  # The app is served from a snapshot: two `next dev`s in one directory share .next, and the
  # owner's server on 3200 lives in the checkout. The snapshot has no .env.local, no .vercel link,
  # no git. node_modules is hard-linked (a symlink breaks Turbopack). Edits after `up` are not
  # picked up: doctor warns, down + up again.
  rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude '/.env*' \
    --exclude /.vercel --exclude /.workflows --exclude /.claude --exclude /.github --exclude /docs --exclude /design \
    --exclude /plans --exclude /assets --exclude /tools --exclude /test-results --exclude /playwright-report \
    --exclude /.media-tmp --exclude '/*.tsbuildinfo' "$root/" "$dir/app/"
  cp -al "$root/node_modules" "$dir/app/node_modules"
  # Throwaway VAPID pair: nothing it signs is accepted by any real push service's subscription.
  (cd "$dir/app" && node -e 'const k=require("web-push").generateVAPIDKeys(); console.log("VAPID_PUBLIC_KEY="+k.publicKey); console.log("VAPID_PRIVATE_KEY="+k.privateKey)') >"$dir/secrets/vapid.env"

  ensure_pg
  psql_run -c "create database $db" >/dev/null

  free_port >"$dir/standin_port"; free_port >"$dir/push_port"; free_port >"$dir/port"
  setsid node "$HERE/standin.mjs" "$dir" "$(cat "$dir/standin_port")" "$(cat "$dir/push_port")" "$llm" "$embed" \
    </dev/null >"$dir/standin.log" 2>&1 &
  echo "standin $!" >>"$dir/pgids"
  local sp="http://127.0.0.1:$(cat "$dir/standin_port")"
  for _ in $(seq 1 40); do curl -fsS -m 2 "$sp/health" >/dev/null 2>&1 && break; sleep 0.25; done
  curl -fsS -m 2 "$sp/health" >/dev/null || { cat "$dir/standin.log" >&2; die "stand-in did not start (verify.sh down $run)"; }
  write_env "$dir"

  # The repo's own migrator: drizzle-kit reaches a local Postgres over TCP (postgres-js), and
  # drizzle.config.ts's dotenv finds no .env.local in the snapshot, so DATABASE_URL_UNPOOLED is ours.
  (cd "$dir/app" && with_env "$dir/web.env" node node_modules/drizzle-kit/bin.cjs migrate) >"$dir/migrate.log" 2>&1 \
    || { tail -20 "$dir/migrate.log" >&2; die "migrations failed (verify.sh down $run)"; }
  echo "migrations=$(psql_run -d "$db" -tAc 'select count(*) from drizzle.__drizzle_migrations')" >>"$dir/meta"

  # demo: the README's own seeder (scripts/seed-demo.ts), run with the run's env: Barnaby, 29
  # words, 39 cards through createCard, gamification recomputed, three shares, today deliberately
  # empty. Its fixed session token is replaced by a random one below.
  (cd "$dir/app" && with_env "$dir/web.env" node node_modules/tsx/dist/cli.mjs --conditions=react-server scripts/seed-demo.ts) \
    >"$dir/seed.log" 2>&1 || { tail -20 "$dir/seed.log" >&2; die "seed failed (verify.sh down $run)"; }
  # What recipes need from the seed, in one place: ids, the three share slugs, today's date.
  python3 -c 'import json,sys
d=json.loads([l for l in open(sys.argv[1]) if l.startswith("{")][-1])
print("demo user     barnaby@demo.invalid  %s  (Asia/Jakarta, today %s, no card yet)" % (d["userId"], d["today"]))
print("words         %d   first word genteel = %s" % (d["words"], d["firstWordId"]))
print("cards         %d   last %s; streak current %d, longest %d; badges %d" % (d["cards"], d["lastCardDate"], d["stats"]["after"]["currentStreak"], d["stats"]["after"]["longestStreak"], len(d["stats"]["badgesInserted"])))
print("journal       first entry %s (has an insight)" % d["journalEntryId"])
print("shares        word /s/%s   card /s/%s   journal /s/%s" % (d["slugs"]["word"], d["slugs"]["card"], d["slugs"]["journal"]))' "$dir/seed.log" >"$dir/evidence/00-seed.txt" \
    || die "could not read the seeder's summary (verify.sh down $run)"
  local tok
  tok="dwv-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
  psql_run -d "$db" -c "update sessions set session_token = '$tok' where session_token = 'dw-demo-session-0000000000000000'" >/dev/null
  echo "$tok" >"$dir/sessions/demo"
  # stranger: onboarded, birthday asked, an empty collection (a share's reader and claimer).
  # newcomer: what Auth.js's createUser leaves behind (a user and a bare profile), not onboarded.
  local who email name onboarded
  for who in stranger newcomer; do
    email="$who@daily-words-verify.invalid"; name="$(tr a-z A-Z <<<"${who:0:1}")${who:1}"
    [ "$who" = stranger ] && onboarded="now()" || onboarded="null"
    tok="dwv-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
    psql_run -d "$db" -c "with u as (insert into users (name, email, email_verified) values ('$name', '$email', now()) returning id),
      p as (insert into profiles (user_id, timezone, onboarded_at, birthday_asked_at) select id, 'Asia/Jakarta', $onboarded, $onboarded from u)
      insert into sessions (session_token, user_id, expires) select '$tok', id, now() + interval '30 days' from u" >/dev/null
    echo "$tok" >"$dir/sessions/$who"
  done

  local port; port="$(cat "$dir/port")"
  # setsid: own process group (down kills exactly this tree); every fd redirected so no caller's
  # pipe stays open behind the server. Not `(cd ... && setsid ... &)`: that records a wrapper's pid.
  local -a webenv=()
  mapfile -t webenv <"$dir/web.env"
  cd "$dir/app"
  setsid env -i "${webenv[@]}" node node_modules/next/dist/bin/next dev --turbopack -p "$port" -H 127.0.0.1 \
    </dev/null >"$dir/next.log" 2>&1 &
  echo "next $!" >>"$dir/pgids"
  local url; url="$(base_of "$dir")"; local code="" last="" same=0
  for _ in $(seq 1 240); do
    code="$(curl -s -o "$dir/ready.html" -m 90 -w '%{http_code}' -H "Cookie: authjs.session-token=$(cat "$dir/sessions/demo")" "$url/today" || true)"
    [ "$code" = 200 ] && break
    # The same 5xx several times in a row is a broken page, not a slow compile.
    if [[ $code == 5* ]] && [ "$code" = "$last" ]; then same=$((same + 1)); else same=0; fi
    last=$code
    [ "$same" -ge 4 ] && break
    kill -0 "$(awk '$1=="next"{print $2}' "$dir/pgids")" 2>/dev/null || { tail -30 "$dir/next.log" >&2; die "next dev exited during startup (verify.sh down $run)"; }
    sleep 1
  done
  [ "$code" = 200 ] || { tail -30 "$dir/next.log" >&2; die "/today did not answer 200 signed in (last $code; log $dir/next.log; verify.sh down $run)"; }
  rm -f "$dir/ready.html"
  curl -fsS -m 5 -X POST "$sp/budget/arm" >/dev/null || die "could not arm the budget"
  echo "users: demo stranger newcomer" >>"$dir/evidence/00-seed.txt"
  cat "$dir/evidence/00-seed.txt"
  echo "RUN=$run"; echo "URL=$url"; echo "EVIDENCE=$dir/evidence"; echo "MODE=$(meta "$dir" mode)"
}

pgid_of() { awk -v k="$2" '$1==k{print $2}' "$1/pgids" 2>/dev/null; }

cmd_doctor() {
  local dir ok=1 root
  dir="$(live_dir "${1:-}")"
  root="$(meta "$dir" repo)"
  local si next sp port db
  si="$(pgid_of "$dir" standin)"; next="$(pgid_of "$dir" next)"; db="$(meta "$dir" db)"
  sp="http://127.0.0.1:$(cat "$dir/standin_port")"; port="$(cat "$dir/port")"
  if curl -fsS -m 3 "$sp/health" | grep -q daily-words-verify-standin; then echo "standin  ok   $sp, push sink https://127.0.0.1:$(cat "$dir/push_port") (pgid $si)"; else echo "standin  FAIL $sp not answering"; ok=0; fi
  if [ -n "$next" ] && kill -0 "$next" 2>/dev/null; then echo "next     ok   pgid $next"; else echo "next     FAIL not running"; ok=0; fi
  local owner
  owner="$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed -n 1p | cut -d= -f2 || true)"
  if [ -n "$owner" ] && [ "$(ps -o pgid= -p "$owner" | tr -d ' ')" = "$next" ]; then
    echo "port     ok   :$port owned by this run (pid $owner)"
  else
    echo "port     FAIL :$port is ${owner:+owned by pid $owner, }not this run's next"; ok=0
  fi
  local o3200
  o3200="$(ss -ltnpH "sport = :$OWNER_PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed -n 1p | cut -d= -f2 || true)"
  echo "3200     --   ${o3200:+the owner's server (pid $o3200), not this run's: never driven}${o3200:-nothing listening (not ours either way)}"
  local who code
  for who in "${USERS[@]}"; do
    code="$(curl -s -o /dev/null -m 60 -w '%{http_code}|%{redirect_url}' -H "Cookie: authjs.session-token=$(cat "$dir/sessions/$who")" "$(base_of "$dir")/today" || true)"
    case "$who:$code" in
      demo:200*|stranger:200*|newcomer:30*/onboarding) echo "session  ok   $who: /today -> ${code%%|*} ${code#*|}" ;;
      *) echo "session  FAIL $who: /today -> $code"; ok=0 ;;
    esac
  done
  local counts
  if counts="$(psql_run -d "$db" -tAc "select (select count(*) from drizzle.__drizzle_migrations)||' migrations, users '||(select count(*) from users)||', vocab '||(select count(*) from vocab_entries)||', cards '||(select count(*) from daily_cards)||', journal '||(select count(*) from journal_entries)||', shares '||(select count(*) from shares)||', push_subscriptions '||(select count(*) from push_subscriptions)" 2>/dev/null)"; then
    echo "database ok   $db ($counts)"
  else echo "database FAIL $db"; ok=0; fi
  local subs
  subs="$(psql_run -d "$db" -tAc "select count(*) from push_subscriptions where endpoint not like 'https://127.0.0.1:$(cat "$dir/push_port")/push/%'" 2>/dev/null || echo '?')"
  if [ "$subs" = 0 ]; then echo "push     ok   every subscription points at this run's sink"; else echo "push     FAIL $subs subscription(s) point somewhere else"; ok=0; fi
  echo "mode     $(meta "$dir" mode)"
  echo "budget   $(curl -fsS -m 3 "$sp/budget" | python3 -c 'import json,sys; s=json.load(sys.stdin); print("armed" if s["armed"] else "SEEDING", "; ".join("%s: %d spent, %d left, %d refused" % (k, v["spent"], v["left"], v["refused"]) for k,v in s["pools"].items()))')"
  printf 'meta     repo=%s head=%s\n' "$root" "$(meta "$dir" head)"
  if [ "$(git -C "$root" rev-parse --short HEAD)" != "$(meta "$dir" head)" ]; then
    echo "code     WARN HEAD moved since up: the snapshot is stale (down + up)"
  fi
  if [ "$(tree_digest "$root")" != "$(meta "$dir" tree)" ]; then
    echo "code     WARN working tree changed since up: the snapshot is stale (down + up)"
  fi
  # Egress, from a process with the server's exact env and preload. Nothing leaves either way: the
  # guard refuses before connecting. The push sink must answer over https (its CA is trusted).
  local probe
  probe="$(cd "$dir/app" && with_env "$dir/web.env" node --input-type=module -e "
    import https from 'node:https';
    const out = [];
    for (const u of ['https://api.github.com/', 'https://web.push.apple.com/x', 'https://accounts.google.com/', 'https://console.neon.tech/']) {
      try { await fetch(u); out.push('REACHED ' + u) } catch (e) { out.push((/blocked/.test(e.message) ? 'blocked ' : 'error ') + new URL(u).host) }
    }
    try { https.request('https://fcm.googleapis.com/fcm/send/x'); out.push('REACHED https.request fcm') } catch (e) { out.push((/blocked/.test(e.message) ? 'blocked ' : 'error ') + 'https.request fcm.googleapis.com') }
    const r = await fetch('https://127.0.0.1:$(cat "$dir/push_port")/push/none', { method: 'POST' }).catch((e) => ({ status: 'ERROR ' + e.message }));
    out.push('sink ' + r.status);
    console.log(out.join('; '));
  " 2>/dev/null)"
  if [[ $probe == *REACHED* ]] || [[ $probe != *"sink 404"* ]]; then echo "egress   FAIL $probe"; ok=0
  else echo "egress   ok   $probe"; fi
  local blocked
  blocked="$(cat "$dir"/next.log "$dir"/seed.log 2>/dev/null | grep -oE '(egress BLOCKED|paid call REFUSED) [A-Za-z.]+ (https?://)?[^/ ]+' | sort | uniq -c || true)"
  [ -n "$blocked" ] && echo "$blocked" | sed 's/^/egress   /'
  grep -E "⨯|Error:" "$dir/next.log" 2>/dev/null | grep -v "dw-verify" | tail -3 | sed 's/^/log      /' || true
  [ "$ok" = 1 ] || exit 1
}

save_response() {
  # save_response OUT BODYFILE CODE CTYPE [REDIRECT]: prints the response as text, binary to a file.
  local out=$1 bodyf=$2 code=$3 ctype=$4 redir=${5:-}
  echo "< HTTP $code ${ctype:-} ${redir:+-> $redir}"
  if [[ ${ctype:-} =~ json|text|javascript|xml ]] || [ ! -s "$bodyf" ]; then
    if [[ ${ctype:-} =~ html ]]; then
      echo "[html $(wc -c <"$bodyf") bytes; visible text:]"
      python3 "$HERE/htmltext.py" "$bodyf" 150
      mv "$bodyf" "${out%.txt}.html"; echo "[full html: ${out%.txt}.html]"
    elif [[ ${ctype:-} =~ json ]]; then
      python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=1, ensure_ascii=False)[:20000])' "$bodyf" 2>/dev/null || cat "$bodyf"
      echo; rm -f "$bodyf"
    else cat "$bodyf"; echo; rm -f "$bodyf"; fi
  else
    mv "$bodyf" "${out%.txt}.bin"
    echo "[binary $(wc -c <"${out%.txt}.bin") bytes, sha256 $(sha256sum "${out%.txt}.bin" | cut -c1-16): ${out%.txt}.bin]"
  fi
}

# Parse a leading --as USER / --anon; sets AS (a user name or "-").
parse_as() {
  AS=demo; NARGS=0
  case "${1:-}" in
    --anon) AS=-; NARGS=1 ;;
    --as) AS=${2:?--as USER}; NARGS=2 ;;
    --as=*) AS=${1#--as=}; NARGS=1 ;;
  esac
}

cmd_api() {
  local dir; dir="$(live_dir "${1:-}")"; shift
  parse_as "$@"; shift "$NARGS"
  local method=${1:?METHOD} path=${2:?PATH} body=${3:-} out
  out="$(next_evidence "$dir" api "$method$path" txt)"
  local -a args=(-sS -m 180 -o "$out.body" -w '%{http_code}|%{content_type}|%{redirect_url}|%header{set-cookie}|%header{cache-control}'
    -H "Origin: $(base_of "$dir")" -X "$method" "$(base_of "$dir")$path")
  [ "$AS" != - ] && args+=(-H "Cookie: authjs.session-token=$(token_of "$dir" "$AS")")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  local m code ctype redir setc cache
  m="$(curl "${args[@]}")"
  IFS='|' read -r code ctype redir setc cache <<<"$m"
  { echo "> $method $path  (as ${AS/-/signed-out})"; [ -n "$body" ] && echo "> $(printf %s "$body" | cut -c1-400)"
    [ -n "$setc" ] && echo "< set-cookie: $(printf %s "$setc" | cut -c1-200)"
    [ -n "$cache" ] && echo "< cache-control: $cache"
    save_response "$out" "$out.body" "$code" "$ctype" "$redir"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_ui() {
  local dir steps width=375 height=667 theme=light tz=Asia/Jakarta
  dir="$(live_dir "${1:-}")"; steps=${2:?STEPS.mjs}; shift 2
  local as=demo
  local -a args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --as) as=$2; shift 2 ;;
      --anon) as=-; shift ;;
      --width) width=$2; shift 2 ;;
      --height) height=$2; shift 2 ;;
      --theme) theme=$2; shift 2 ;;
      --tz) tz=$2; shift 2 ;;
      --) shift; args=("$@"); break ;;
      *) die "ui: unknown flag $1 (step arguments go after --)" ;;
    esac
  done
  [ -f "$steps" ] || die "no such steps file: $steps"
  steps="$(realpath "$steps")"   # before the cd into the snapshot, so relative paths work
  local cookie=-; [ "$as" != - ] && cookie="$(token_of "$dir" "$as")"
  local argv
  argv="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "${args[@]}")"
  (cd "$dir/app" && DW_VERIFY_ARGS="$argv" node "$HERE/ui.mjs" "$(base_of "$dir")" "$steps" "$dir/evidence" "$cookie" \
    "$width" "$height" "$theme" "$tz")
}

# The repo's tests/e2e against this run: a config that keeps playwright.config.ts's projects and
# drops its webServer (which would reuse whatever listens on 3200). DW_TEST_SESSION is the demo
# user's token, so the two signed-in specs run instead of skipping; onboarding.spec needs a user
# who has not onboarded, so it runs on its own as `newcomer`.
cmd_layout() {
  local dir; dir="$(live_dir "${1:-}")"; shift
  local out cfg="$dir/app/playwright.verify.config.ts"
  cat >"$cfg" <<EOF
import base from './playwright.config'
export default { ...base, outputDir: '$dir/pw-results', use: { ...base.use, baseURL: '$(base_of "$dir")' }, webServer: undefined }
EOF
  out="$(next_evidence "$dir" layout "${1:-suite}" txt)"
  local -a specs=("$@")
  local rc=0
  {
    if [ ${#specs[@]} -eq 0 ]; then
      echo "> playwright test (all but onboarding.spec) as demo"
      (cd "$dir/app" && env -i PATH="$PATH" HOME="$dir/home" PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" DW_TEST_SESSION="$(cat "$dir/sessions/demo")" \
        node node_modules/@playwright/test/cli.js test -c "$cfg" --reporter=list \
        tests/e2e/no-scroll.spec.ts tests/e2e/chat-frame.spec.ts tests/e2e/share-frame.spec.ts tests/e2e/journal-duplicate.spec.ts) 2>&1 || rc=1
      echo "> playwright test onboarding.spec as newcomer"
      (cd "$dir/app" && env -i PATH="$PATH" HOME="$dir/home" PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" DW_TEST_SESSION="$(cat "$dir/sessions/newcomer")" \
        node node_modules/@playwright/test/cli.js test -c "$cfg" --reporter=list tests/e2e/onboarding.spec.ts) 2>&1 || rc=1
    else
      echo "> playwright test ${specs[*]} as demo"
      (cd "$dir/app" && env -i PATH="$PATH" HOME="$dir/home" PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" DW_TEST_SESSION="$(cat "$dir/sessions/demo")" \
        node node_modules/@playwright/test/cli.js test -c "$cfg" --reporter=list "${specs[@]}") 2>&1 || rc=1
    fi
    echo "result: $([ $rc = 0 ] && echo PASS || echo FAIL)"
  } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
  return $rc
}

cmd_push() {
  local dir; dir="$(live_dir "${1:-}")"; local what=${2:?subscribe|inbox}; shift 2
  local sp="http://127.0.0.1:$(cat "$dir/standin_port")" out
  case "$what" in
    subscribe)
      local gone=0 as=demo
      while [ $# -gt 0 ]; do
        case "$1" in --gone) gone=1; shift ;; --as) as=$2; shift 2 ;; *) die "push subscribe: unknown flag $1" ;; esac
      done
      local sub
      sub="$(curl -fsS -m 5 -X POST "$sp/push/new?gone=$gone")" || die "the stand-in could not mint a device"
      # The body PushSync / ReminderToggle send: the PushSubscription's JSON, endpoint + keys.
      cmd_api "$(basename "$dir")" --as "$as" POST /api/push/subscription "$sub"
      ;;
    inbox)
      out="$(next_evidence "$dir" push inbox txt)"
      { echo "> GET the fake push service's inbox (decrypted with each device's own key)"
        curl -fsS -m 5 "$sp/push/inbox" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d, indent=1, ensure_ascii=False)); print("%d delivery(ies)" % len(d))'; } >"$out"
      cat "$out"; echo "[evidence: $out]" >&2 ;;
    *) die "push: subscribe or inbox" ;;
  esac
}

cmd_tick() {
  local dir; dir="$(live_dir "${1:-}")"
  local secret; secret="$(cat "$dir/secrets/cron")"
  case "${2:-}" in --secret=*) secret=${2#--secret=} ;; "") ;; *) die "tick: only --secret=VALUE" ;; esac
  local out m code ctype
  out="$(next_evidence "$dir" tick push txt)"
  m="$(curl -sS -m 120 -o "$out.body" -w '%{http_code}|%{content_type}' -X POST -H "Authorization: Bearer $secret" "$(base_of "$dir")/api/push/tick")"
  IFS='|' read -r code ctype <<<"$m"
  { echo "> POST /api/push/tick  (Bearer: $([ "$secret" = "$(cat "$dir/secrets/cron")" ] && echo "the run's own CRON_SECRET" || echo "a WRONG secret"))"
    save_response "$out" "$out.body" "$code" "$ctype"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_sql() {
  local dir out
  dir="$(live_dir "${1:-}")"; shift
  if [ "${1:-}" = --value ]; then
    # One cell, bare, for recipes: ID=$($V sql RUN --value "select id from ...").
    out="$(next_evidence "$dir" sql value txt)"
    local v
    v="$(printf 'begin read only;\n%s;\nrollback;\n' "${2:?SQL}" | psql_run -d "$(meta "$dir" db)" -tA 2>&1 | grep -vE '^(BEGIN|ROLLBACK)$' | sed -n 1p || true)"
    { echo "> $2"; echo "$v"; } >"$out"
    echo "$v"
    echo "[evidence: $out]" >&2
    return
  fi
  out="$(next_evidence "$dir" sql query txt)"
  { echo "> ${1:?SQL}"; printf 'begin read only;\n%s;\nrollback;\n' "$1" | psql_run -d "$(meta "$dir" db)" 2>&1; } >"$out" || true
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_logs() {
  local dir re=${2:-'⨯|Error|error|REFUSED|BLOCKED'} n=${3:-40} out
  dir="$(run_dir "${1:-}")"
  local log="$dir/next.log"; [ -f "$log" ] || log="$dir/evidence/zz-next.log"
  out="$(next_evidence "$dir" logs "$re" txt)"
  { echo "> grep -E '$re' next.log (last $n)"; grep -E -- "$re" "$log" | tail -n "$n" || echo "(no match)"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_budget() {
  local dir; dir="$(run_dir "${1:-}")"
  if [ -f "$dir/state" ]; then cat "$dir/evidence/zz-budget.json"; else curl -fsS -m 3 "http://127.0.0.1:$(cat "$dir/standin_port")/budget"; fi
  echo
  grep -E '^paid ' "$dir/standin.log" "$dir/evidence/zz-standin.log" 2>/dev/null | tail -20 || true
}

cmd_note() {
  local dir; dir="$(run_dir "${1:-}")"
  echo "$(date -Iseconds) ${2:?TEXT}" >>"$dir/evidence/LOG.md"
}

stop_run() {
  local dir=$1 kind pgid
  while read -r kind pgid; do
    [ -n "${pgid:-}" ] || continue
    # The whole group, not the leader: next dev's workers outlive it by a moment and keep writing
    # into the snapshot (node_modules/next/next-swc-fallback), which made a plain rm -rf fail.
    if pgrep -g "$pgid" >/dev/null 2>&1; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
      for _ in $(seq 1 20); do pgrep -g "$pgid" >/dev/null 2>&1 || break; sleep 0.25; done
      kill -KILL -- "-$pgid" 2>/dev/null || true
      for _ in $(seq 1 20); do pgrep -g "$pgid" >/dev/null 2>&1 || break; sleep 0.25; done
    fi
  done <"$dir/pgids"
  for f in next.log standin.log seed.log migrate.log meta; do [ -f "$dir/$f" ] && cp "$dir/$f" "$dir/evidence/zz-$f"; done
  [ -f "$dir/budget.json" ] && cp "$dir/budget.json" "$dir/evidence/zz-budget.json"
  [ -f "$dir/push/inbox.jsonl" ] && cp "$dir/push/inbox.jsonl" "$dir/evidence/zz-push-inbox.jsonl"
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1 && [ -n "$(meta "$dir" db)" ]; then
    psql_run -c "drop database if exists $(meta "$dir" db) with (force)" >/dev/null 2>&1 || true
  fi
  local tries
  for tries in 1 2 3; do
    rm -rf "$dir/app" "$dir/home" "$dir/secrets" "$dir/sessions" "$dir/push" "$dir/pw-results" "$dir/web.env" 2>/dev/null && break
    sleep 1
  done
  [ ! -e "$dir/app" ] || echo "verify: WARN could not remove $dir/app; delete it by hand" >&2
  : >"$dir/pgids"; echo stopped >"$dir/state"
  echo "verify: stopped $(basename "$dir"); evidence kept in $dir/evidence ($(find "$dir/evidence" -type f | wc -l) files)"
}

cmd_down() {
  if [ "${1:-}" = --all ]; then
    for d in "$VERIFY_HOME"/*/; do [ -f "$d/meta" ] && [ ! -f "$d/state" ] && stop_run "${d%/}"; done
    return 0
  fi
  stop_run "$(run_dir "${1:-}")"
}

cmd_ls() {
  [ -d "$VERIFY_HOME" ] || return 0
  for d in "$VERIFY_HOME"/*/; do
    d=${d%/}
    local state=stopped
    [ -f "$d/state" ] || state="up:$(cat "$d/port" 2>/dev/null || echo '?')"
    printf '%-20s %-10s %-24s %3s evidence  %s\n' "$(basename "$d")" "$state" "$(meta "$d" mode 2>/dev/null)" \
      "$(find "$d/evidence" -type f 2>/dev/null | wc -l)" "$(meta "$d" repo 2>/dev/null)"
  done
}

sub=${1:-}; shift || true
case "$sub" in
  up) cmd_up "$@" ;;
  doctor) cmd_doctor "$@" ;;
  api) cmd_api "$@" ;;
  ui) cmd_ui "$@" ;;
  layout) cmd_layout "$@" ;;
  push) cmd_push "$@" ;;
  tick) cmd_tick "$@" ;;
  sql) cmd_sql "$@" ;;
  logs) cmd_logs "$@" ;;
  budget) cmd_budget "$@" ;;
  note) cmd_note "$@" ;;
  down) cmd_down "$@" ;;
  ls) cmd_ls ;;
  *) sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

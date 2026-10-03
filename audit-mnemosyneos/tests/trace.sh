#!/usr/bin/env bash
# trace.sh <nom_trace> <cwd> <commande...>
# Exécute la commande dans <cwd>, consigne commande, cwd, date UTC, durée,
# stdout, stderr et code de retour dans traces/<nom_trace>.{cmd,out,err,rc}.
# Le code de retour de la commande est propagé.
set -u
AUD="$(cd "$(dirname "$0")/.." && pwd)"
name="$1"; cwd="$2"; shift 2
mkdir -p "$AUD/traces"
base="$AUD/traces/$name"
start=$(date -u +%Y-%m-%dT%H:%M:%SZ); t0=$(date +%s.%N)
( cd "$cwd" && "$@" ) >"$base.out" 2>"$base.err"
rc=$?
t1=$(date +%s.%N)
{
  echo "cmd: $*"
  echo "cwd: $cwd"
  echo "start_utc: $start"
  echo "duration_s: $(echo "$t1 - $t0" | bc)"
  echo "node: $(node --version 2>/dev/null)"
  echo "exit_code: $rc"
} >"$base.cmd"
echo "$rc" >"$base.rc"
cat "$base.out"; cat "$base.err" >&2
echo "[trace $name] exit_code=$rc" >&2
exit $rc

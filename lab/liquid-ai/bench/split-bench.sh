#!/bin/sh
# Loads one GGUF in llama-server once per placement, reads the GPU memory with
# nvidia-smi before and after the load, then asks two timed questions.
#
# usage:
#   SERVER=/path/to/llama-server MODEL=/path/to/model.gguf CTX=/path/to/document.txt \
#     sh split-bench.sh <label> <placement> [<placement> ...]
#
# A placement is one of:
#   cpu        everything on the CPU          (-ngl 0 -dev none)
#   gpu        everything on the GPU          ($DEVICES -ngl 99)
#   igpu       everything on device Vulkan0   (-dev Vulkan0 -ngl 99)
#   fit        llama.cpp picks the split      ($DEVICES --fit on)
#   fitapp     same, 768 MiB left free        (--fit on -fitt 768)
#   <number>   all layers on the GPU, the experts of that many layers on the CPU
#              ($DEVICES -ngl 99 --n-cpu-moe <number>)
#
# Optional: DEVICES (default "-dev Vulkan1", use "-dev CUDA0" on a CUDA build),
# CTXSIZE (default 32768), PORT (default 8094).
# Needs: nvidia-smi on the PATH, python 3, curl.
set -u
: "${SERVER:?set SERVER to a llama-server binary}"
: "${MODEL:?set MODEL to a GGUF file}"
: "${CTX:?set CTX to a text file of about 6 000 characters}"
DEVICES="${DEVICES:--dev Vulkan1}"
CTXSIZE="${CTXSIZE:-32768}"
PORT="${PORT:-8094}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"
LABEL="$1"; shift
vram() { nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | tr -d ' '; }
for SPLIT in "$@"; do
  case "$SPLIT" in
    cpu) PLACE="-ngl 0 -dev none" ;;
    gpu) PLACE="$DEVICES -ngl 99" ;;
    igpu) PLACE="-dev Vulkan0 -ngl 99" ;;
    fit) PLACE="$DEVICES --fit on" ;;
    fitapp) PLACE="--fit on -fitt 768" ;;
    *) PLACE="$DEVICES -ngl 99 --n-cpu-moe $SPLIT" ;;
  esac
  BEFORE=$(vram)
  "$SERVER" -m "$MODEL" --host 127.0.0.1 --port "$PORT" --jinja -c "$CTXSIZE" -np 1 -fa on -ctk q8_0 -ctv q8_0 \
    -b 2048 -ub 2048 $PLACE --reasoning-format deepseek --reasoning-budget 0 --no-webui > "$OUT/split-$SPLIT.log" 2>&1 &
  PID=$!
  T0=$(date +%s)
  OK=0
  for i in $(seq 1 150); do
    if curl -s "http://127.0.0.1:$PORT/health" | grep -q ok; then OK=1; break; fi
    if ! kill -0 $PID 2>/dev/null; then break; fi
    sleep 2
  done
  LOAD=$(( $(date +%s) - T0 ))
  if [ $OK = 1 ]; then
    AFTER=$(vram)
    R1=$(python "$HERE/split-ask.py" "$PORT" "$CTX")
    R2=$(python "$HERE/split-ask.py" "$PORT" "$CTX")
    echo "$LABEL | $SPLIT | gpu MiB before=$BEFORE after=$AFTER | load ${LOAD}s | $R1 | $R2"
  else
    echo "$LABEL | $SPLIT | gpu MiB before=$BEFORE | FAILED after ${LOAD}s: $(grep -aiE 'error|out of memory|failed' "$OUT/split-$SPLIT.log" | head -2 | tr '\n' ' ')"
  fi
  kill $PID 2>/dev/null
  sleep 4
done

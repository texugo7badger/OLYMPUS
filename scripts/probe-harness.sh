#!/usr/bin/env bash
# probe-harness.sh — robust dev server lifecycle for SSE probe runs
# Usage: probe-harness.sh [start|stop|soak|health|run <seconds> <cmd...>]
# Env: PROBE_PORT (default 3737), PROBE_HOST (default 127.0.0.1)

set -euo pipefail

PROBE_PORT="${PROBE_PORT:-3737}"
PROBE_HOST="${PROBE_HOST:-127.0.0.1}"
PROBE_URL="http://${PROBE_HOST}:${PROBE_PORT}/api/olympus/health"
PID_FILE="/tmp/olympus-probe-server.pid"
LOG_FILE="/tmp/olympus-probe-server.log"

# Portable project root
cd "$(git rev-parse --show-toplevel)"

start_server() {
  # Clean up any existing
  stop_server >/dev/null 2>&1 || true
  
  # Start server in background with nohup
  nohup npx next dev -p "${PROBE_PORT}" -H "${PROBE_HOST}" > "${LOG_FILE}" 2>&1 &
  local pid=$!
  echo "${pid}" > "${PID_FILE}"
  echo "Started server PID ${pid}"
  
  # Readiness loop: 20 attempts × 1s (B3 measured 14s cold start)
  for i in {1..20}; do
    if curl -s --max-time 3 "${PROBE_URL}" >/dev/null 2>&1; then
      echo "Server ready at ${PROBE_URL} (PID ${pid})"
      return 0
    fi
    sleep 1
  done
  
  echo "ERROR: Server failed to become ready" >&2
  stop_server
  return 1
}

stop_server() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid=$(cat "${PID_FILE}" 2>/dev/null || echo "")
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Stopping server PID ${pid}..."
      kill -TERM "${pid}" 2>/dev/null || true
      # Wait up to 5s for graceful shutdown
      for i in {1..5}; do
        if ! kill -0 "${pid}" 2>/dev/null; then
          echo "Server stopped gracefully (PID ${pid}, exit code 0)"
          rm -f "${PID_FILE}"
          return 0
        fi
        sleep 1
      done
      # Force kill
      kill -KILL "${pid}" 2>/dev/null || true
      sleep 1
      echo "Server force-killed (PID ${pid}, exit code 137)"
    fi
  fi
  rm -f "${PID_FILE}"
}

soak() {
  local duration="${1:-150}"
  local start_ts
  start_ts=$(date +%s)
  local end_ts=$((start_ts + duration))
  
  echo "Starting soak test for ${duration}s (until $(date -d "@${end_ts}" '+%H:%M:%S'))"
  
  while [[ $(date +%s) -lt ${end_ts} ]]; do
    if ! curl -s --max-time 3 "${PROBE_URL}" >/dev/null 2>&1; then
      local now
      now=$(date +%s)
      echo "SOAK FAILED at $(date '+%H:%M:%S') — health check failed after $((now - start_ts))s" >&2
      # Capture last log lines
      echo "=== Last 50 log lines ===" >&2
      tail -50 "${LOG_FILE}" >&2 || true
      return 1
    fi
    sleep 1
  done
  
  echo "Soak completed successfully (${duration}s)"
  return 0
}

# run_with_deadline <seconds> <cmd...>
# Executes cmd with deadline; on deadline sends TERM then KILL.
# Prints explicit verdict:
#   - "HARNESS KILL (deadline)" if deadline fired (exit 124)
#   - "EXIT <code>" if command exited before deadline
#   - "CRASH (unexpected exit)" if code != 0 and not deadline
run_with_deadline() {
  local deadline_seconds="${1:-60}"
  shift
  local cmd=("$@")
  local start_ts end_ts
  
  start_ts=$(date +%s)
  end_ts=$((start_ts + deadline_seconds))
  
  "${cmd[@]}" &
  local cmd_pid=$!
  
  while [[ $(date +%s) -lt ${end_ts} ]]; do
    if ! kill -0 "${cmd_pid}" 2>/dev/null; then
      # Command exited before deadline
      wait "${cmd_pid}"
      local exit_code=$?
      echo "EXIT ${exit_code}"
      if [[ ${exit_code} -ne 0 ]]; then
        echo "CRASH (unexpected exit)" >&2
      fi
      return ${exit_code}
    fi
    sleep 1
  done
  
  # Deadline reached - kill the process
  echo "HARNESS KILL (deadline)" >&2
  kill -TERM "${cmd_pid}" 2>/dev/null || true
  sleep 2
  if kill -0 "${cmd_pid}" 2>/dev/null; then
    kill -KILL "${cmd_pid}" 2>/dev/null || true
  fi
  wait "${cmd_pid}" 2>/dev/null
  return 124
}

health() {
  curl -s --max-time 3 "${PROBE_URL}" >/dev/null 2>&1
}

case "${1:-}" in
  start) start_server ;;
  stop) stop_server ;;
  soak) soak "${2:-150}" ;;
  health) health ;;
  run) run_with_deadline "${2:-60}" "${@:3}" ;;
  *) echo "Usage: $0 {start|stop|soak [seconds]|health|run <seconds> <cmd...>}" >&2; exit 1 ;;
esac

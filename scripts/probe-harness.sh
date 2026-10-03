#!/usr/bin/env bash
# probe-harness.sh — robust dev server lifecycle for SSE probe runs
# Usage: probe-harness.sh [start|stop|soak|health|logs [-f]|run <seconds> <cmd...>]
# Env: PROBE_PORT (default 3737), PROBE_HOST (default 127.0.0.1)
#
# logs — issue #23: first-class server-stdout access for agents. Prints the
#   harness log path, then tails it (last 200 lines by default). With -f,
#   follows the log live (tail -F). The dev server's stdout/stderr lands in
#   this file (spawn line, provider banners, request lines, warnings) — this
#   is how 12b/12c/12d diagnosed server-side behavior without app UI tools.

set -euo pipefail

PROBE_PORT="${PROBE_PORT:-3737}"
PROBE_HOST="${PROBE_HOST:-127.0.0.1}"
PROBE_URL="http://${PROBE_HOST}:${PROBE_PORT}/api/olympus/health"
PID_FILE="/tmp/olympus-probe-server.pid"
LOG_FILE="/tmp/olympus-probe-server.log"

# Portable project root
cd "$(git rev-parse --show-toplevel)"

# Resolve the REAL listener PID on PROBE_PORT (issue #59: the pidfile
# records the npm/npx wrapper; the actual `next-server` child is a
# different process that survives the wrapper's death — and while it
# lives, Next 16 auto-shifts any subsequent start to 3738 while the
# health check passes against the STALE server on this port).
port_listener_pid() {
  ss -tlnp 2>/dev/null | grep ":${PROBE_PORT}" | grep -oP 'pid=\K[0-9]+' | head -1
}

assert_port_free() {
  local waited=0
  while [[ -n "$(port_listener_pid)" ]] && [[ ${waited} -lt 5 ]]; do
    sleep 1
    waited=$((waited + 1))
  done
  if [[ -n "$(port_listener_pid)" ]]; then
    echo "ERROR: port ${PROBE_PORT} still has a listener after stop (issue #59 regression)" >&2
    return 1
  fi
  echo "Port ${PROBE_PORT} is free"
  return 0
}

# Issue #59 helper: is `child` a descendant of `ancestor` (up to 6 hops)?
is_descendant_of() {
  local child="$1" ancestor="$2" hops=0
  while [[ -n "${child}" && "${child}" != "1" && ${hops} -lt 6 ]]; do
    child=$(ps -o ppid= -p "${child}" 2>/dev/null | tr -d ' ')
    [[ "${child}" == "${ancestor}" ]] && return 0
    hops=$((hops + 1))
  done
  return 1
}

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
      # Issue #59: record the REAL next-server listener, not just the
      # wrapper. If the port is shadowed by a pre-existing server, say so
      # loudly — the health check passing against a stale server is the
      # exact failure mode this guards against.
      local real_pid
      real_pid=$(port_listener_pid)
      if [[ -n "${real_pid}" && "${real_pid}" != "${pid}" ]]; then
        echo "${real_pid}" > "${PID_FILE}.realpid"
        echo "Real next-server listener PID ${real_pid} recorded (${PID_FILE}.realpid)"
        if ! is_descendant_of "${real_pid}" "${pid}"; then
          echo "WARNING: listener ${real_pid} is NOT a descendant of wrapper ${pid} — a stale server may be shadowing the port" >&2
        fi
      fi
      echo "Server ready at ${PROBE_URL} (wrapper PID ${pid}, listener PID ${real_pid:-unknown})"
      return 0
    fi
    sleep 1
  done

  echo "ERROR: Server failed to become ready" >&2
  stop_server
  return 1
}

stop_server() {
  # 1. TERM the recorded wrapper PID (graceful, as before).
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid=$(cat "${PID_FILE}" 2>/dev/null || echo "")
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Stopping server wrapper PID ${pid}..."
      kill -TERM "${pid}" 2>/dev/null || true
      for i in {1..5}; do
        if ! kill -0 "${pid}" 2>/dev/null; then
          echo "Wrapper stopped gracefully (PID ${pid})"
          break
        fi
        sleep 1
      done
      kill -KILL "${pid}" 2>/dev/null || true
    fi
  fi
  rm -f "${PID_FILE}"

  # 2. Issue #59: kill whatever still LISTENS on the port — the real
  #    next-server child survives the wrapper. TERM, wait up to 5s, KILL.
  local listener
  listener=$(port_listener_pid)
  if [[ -n "${listener}" ]]; then
    echo "Killing real listener on port ${PROBE_PORT} (PID ${listener})..."
    kill -TERM "${listener}" 2>/dev/null || true
    for i in {1..5}; do
      [[ -z "$(port_listener_pid)" ]] && break
      sleep 1
    done
    if [[ -n "$(port_listener_pid)" ]]; then
      kill -KILL "$(port_listener_pid)" 2>/dev/null || true
      sleep 1
      echo "Real listener force-killed on port ${PROBE_PORT}"
    else
      echo "Real listener stopped gracefully on port ${PROBE_PORT}"
    fi
  fi
  rm -f "${PID_FILE}.realpid"

  # 3. Final assertion: the port must be free.
  assert_port_free
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

logs() {
  local lines="${PROBE_LOG_LINES:-200}"
  echo "Harness log: ${LOG_FILE}"
  if [[ "${1:-}" == "-f" ]]; then
    echo "Following (tail -F) — Ctrl-C to stop."
    tail -n "${lines}" -F "${LOG_FILE}"
  else
    tail -n "${lines}" "${LOG_FILE}"
  fi
}

case "${1:-}" in
  start) start_server ;;
  stop) stop_server ;;
  soak) soak "${2:-150}" ;;
  health) health ;;
  logs) logs "${2:-}" ;;
  run) run_with_deadline "${2:-60}" "${@:3}" ;;
  *) echo "Usage: $0 {start|stop|soak [seconds]|health|logs [-f]|run <seconds> <cmd...>}" >&2; exit 1 ;;
esac

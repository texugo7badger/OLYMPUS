/**
 * main.js — webview script for the OLYMPUS Bridge terminal panel.
 *
 *
 * Loaded inside the webview of a TerminalBridgePanel. Receives messages
 * from the extension host (output, history, exit) and writes them to the
 * xterm.js Terminal. Forwards user input + resize events back to the host
 * (which forwards them to the OLYMPUS Terminal Bridge WebSocket).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

(function () {
  const vscode = acquireVsCodeApi();
  const container = document.getElementById('terminal-container');
  const statusEl = document.getElementById('status');
  const focusBtn = document.getElementById('focus-olympus');

  if (!container || !window.Terminal) {
    console.error('OLYMPUS Bridge: terminal container or xterm.js not found');
    return;
  }

  // Determine theme from the OLYMPUS color palette.
  const term = new window.Terminal({
    fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
      background: '#0A0E16',
      foreground: '#B8B8B8',
      cursor: '#D4A574',
      cursorAccent: '#0A0E16',
      selection: 'rgba(212,165,116,0.25)',
      black: '#0A0E16',
      red: '#C4756A',
      green: '#7BAE8E',
      yellow: '#D4A574',
      blue: '#6B8FB5',
      magenta: '#9B7BAE',
      cyan: '#6BAEB5',
      white: '#B8B8B8',
      brightBlack: '#5A5A5A',
      brightRed: '#C4756A',
      brightGreen: '#7BAE8E',
      brightYellow: '#D4A574',
      brightBlue: '#6B8FB5',
      brightMagenta: '#9B7BAE',
      brightCyan: '#6BAEB5',
      brightWhite: '#FFFFFF',
    },
  });

  const fitAddon = window.FitAddon ? new window.FitAddon.FitAddon() : null;
  if (fitAddon) term.loadAddon(fitAddon);

  term.open(container);
  if (fitAddon) fitAddon.fit();
  term.writeln('\x1b[38;2;212;165;116mOLYMPUS Bridge terminal — connecting…\x1b[0m');

  // Forward user input → host → bridge.
  term.onData((data) => {
    vscode.postMessage({ type: 'input', data });
  });

  // Forward resize → host → bridge.
  const sendResize = () => {
    if (fitAddon) {
      fitAddon.fit();
      vscode.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
    }
  };
  window.addEventListener('resize', sendResize);
  setTimeout(sendResize, 100);

  // "Open in OLYMPUS" button.
  if (focusBtn) {
    focusBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'focus-olympus' });
    });
  }

  // Receive messages from the host.
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'output' && typeof msg.data === 'string') {
      term.write(msg.data);
    } else if (msg.type === 'history' && typeof msg.data === 'string') {
      term.reset();
      term.write(msg.data);
      if (statusEl) statusEl.textContent = 'OLYMPUS Terminal — live';
    } else if (msg.type === 'exit') {
      term.writeln('');
      term.writeln(`\x1b[38;2;139;139;139m[PTY exited: code=${msg.exitCode}${msg.signal ? ` signal=${msg.signal}` : ''}]\x1b[0m`);
      if (statusEl) statusEl.textContent = `OLYMPUS Terminal — exited (code ${msg.exitCode})`;
    }
  });

  // Initial size sync.
  sendResize();
})();

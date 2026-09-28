/**
 * OLYMPUS Bridge — VSCode-family extension.
 *
 * Embeds the live OLYMPUS terminal inside VSCode / VSCodium / Cursor.
 * Shares the same PTY session as the Electron app — type in either, see
 * it in both. Reads the per-install token from ~/.olympus/terminal-bridge-token
 * and connects to ws://127.0.0.1:3740.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WebSocket } from 'ws';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRIDGE_PORT = 3740;
const BRIDGE_HOST = '127.0.0.1';
const DEFAULT_TOKEN_FILE = path.join(os.homedir(), '.olympus', 'terminal-bridge-token');

// ─── Types ────────────────────────────────────────────────────────────────────

interface BridgePtyInfo {
  id: string;
  kind: string;
  cwd: string;
  command: string | null;
  label: string;
  killed: boolean;
  attached: boolean;
  isFallback: boolean;
  createdAt: string;
}

interface BridgeMessage {
  type: string;
  sessions?: BridgePtyInfo[];
  id?: string;
  history?: string;
  data?: string;
  exitCode?: number;
  signal?: number;
  info?: BridgePtyInfo;
  error?: string;
  ok?: boolean;
  version?: string;
  server?: string;
  pid?: number;
  ts?: number;
}

// ─── BridgeClient ─────────────────────────────────────────────────────────────

/**
 * Manages the WebSocket connection to the OLYMPUS Terminal Bridge.
 * Handles token discovery, auto-reconnect, and message routing.
 */
class BridgeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private token: string | null = null;
  private _connected = false;
  private listeners: ((connected: boolean) => void)[] = [];
  private messageHandlers: ((msg: BridgeMessage) => void)[] = [];

  constructor(private readonly tokenFile: string = DEFAULT_TOKEN_FILE) {}

  get connected(): boolean { return this._connected; }

  onConnectionChange(cb: (connected: boolean) => void): void {
    this.listeners.push(cb);
  }

  onMessage(cb: (msg: BridgeMessage) => void): void {
    this.messageHandlers.push(cb);
  }

  private setConnected(v: boolean) {
    if (this._connected === v) return;
    this._connected = v;
    for (const cb of this.listeners) {
      try { cb(v); } catch {}
    }
  }

  private readToken(): string | null {
    try {
      if (!fs.existsSync(this.tokenFile)) return null;
      return fs.readFileSync(this.tokenFile, 'utf-8').trim();
    } catch {
      return null;
    }
  }

  async connect(): Promise<boolean> {
    this.disconnect();
    this.token = this.readToken();
    if (!this.token) {
      this.setConnected(false);
      return false;
    }
    const url = `ws://${BRIDGE_HOST}:${BRIDGE_PORT}/?token=${encodeURIComponent(this.token)}`;
    try {
      this.ws = new WebSocket(url);
    } catch (err: any) {
      this.setConnected(false);
      this.scheduleReconnect();
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        if (!this._connected) {
          this.scheduleReconnect();
          resolve(false);
        }
      }, 3000);

      this.ws!.once('open', () => {
        clearTimeout(timeout);
        this.setConnected(true);
        resolve(true);
      });
      this.ws!.once('error', (err: Error) => {
        clearTimeout(timeout);
        this.setConnected(false);
        this.scheduleReconnect();
        resolve(false);
      });
      this.ws!.on('message', (raw: Buffer | string) => {
        try {
          const msg: BridgeMessage = JSON.parse(raw.toString());
          for (const cb of this.messageHandlers) {
            try { cb(msg); } catch {}
          }
        } catch {}
      });
      this.ws!.on('close', () => {
        this.setConnected(false);
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const cfg = vscode.workspace.getConfiguration('olympus.bridge');
    const interval = cfg.get<number>('reconnectIntervalMs', 2000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, interval);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.setConnected(false);
  }

  send(msg: any) {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async listSessions(): Promise<BridgePtyInfo[]> {
    if (!this._connected) return [];
    return new Promise((resolve) => {
      const handler = (msg: BridgeMessage) => {
        if (msg.type === 'sessions' && msg.sessions) {
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          resolve(msg.sessions);
        }
      };
      this.messageHandlers.push(handler);
      this.send({ type: 'list' });
      setTimeout(() => {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        resolve([]);
      }, 3000);
    });
  }

  async spawnSession(cwd?: string): Promise<{ id: string; history: string } | null> {
    if (!this._connected) return null;
    return new Promise((resolve) => {
      const handler = (msg: BridgeMessage) => {
        if (msg.type === 'spawned' && msg.id) {
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          resolve({ id: msg.id, history: msg.history || '' });
        } else if (msg.type === 'error') {
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          resolve(null);
        }
      };
      this.messageHandlers.push(handler);
      this.send({ type: 'spawn', kind: 'shell', cwd: cwd || process.cwd() });
      setTimeout(() => {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        resolve(null);
      }, 5000);
    });
  }
}

// ─── TerminalBridgePanel (webview-based xterm.js terminal) ────────────────────

class TerminalBridgePanel {
  private static instances = new Map<string, TerminalBridgePanel>();

  static createOrShow(
    extensionUri: vscode.Uri,
    client: BridgeClient,
    ptyId: string | null,
    label: string,
  ): TerminalBridgePanel {
    const key = ptyId || 'new';
    let inst = TerminalBridgePanel.instances.get(key);
    if (inst) {
      inst.panel.reveal(vscode.ViewColumn.Active);
      return inst;
    }
    inst = new TerminalBridgePanel(extensionUri, client, ptyId, label);
    TerminalBridgePanel.instances.set(key, inst);
    return inst;
  }

  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private currentPtyId: string | null = null;

  private constructor(
    extensionUri: vscode.Uri,
    private readonly client: BridgeClient,
    private readonly initialPtyId: string | null,
    label: string,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'olympusTerminal',
      `OLYMPUS: ${label}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    this.panel.iconPath = new vscode.ThemeIcon('terminal');
    this.panel.webview.html = this.getHtml(this.panel.webview, extensionUri);

    // Receive messages from the webview.
    this.panel.webview.onDidReceiveMessage(
      (msg: any) => this.handleWebviewMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => {
      this.dispose();
      TerminalBridgePanel.instances.delete(this.initialPtyId || 'new');
    }, null, this.disposables);

    // Auto-attach on connect.
    if (this.client.connected) {
      this.init();
    }
    this.client.onConnectionChange((connected) => {
      if (connected) this.init();
    });
  }

  private async init() {
    if (this.initialPtyId) {
      this.currentPtyId = this.initialPtyId;
      this.sendToBridge({ type: 'attach', id: this.currentPtyId });
    } else {
      const result = await this.client.spawnSession();
      if (result) {
        this.currentPtyId = result.id;
        this.postMessage({ type: 'history', data: result.history });
      }
    }
  }

  private handleWebviewMessage(msg: any) {
    if (!this.currentPtyId) return;
    switch (msg.type) {
      case 'input':
        this.sendToBridge({ type: 'input', id: this.currentPtyId, data: msg.data });
        break;
      case 'resize':
        this.sendToBridge({ type: 'resize', id: this.currentPtyId, cols: msg.cols, rows: msg.rows });
        break;
      case 'focus-olympus':
        this.sendToBridge({ type: 'focus-olympus' });
        break;
    }
  }

  private sendToBridge(msg: any) {
    this.client.send(msg);
  }

  private postMessage(msg: any) {
    this.panel.webview.postMessage(msg);
  }

  /**
   * Pump bridge messages into this panel's webview. Called by the global
   * message handler when the message's id matches our currentPtyId.
   */
  handleBridgeMessage(msg: BridgeMessage) {
    if (!this.currentPtyId) return;
    if (msg.id !== this.currentPtyId) return;
    if (msg.type === 'output' && msg.data) {
      this.postMessage({ type: 'output', data: msg.data });
    } else if (msg.type === 'attached' && msg.history) {
      this.postMessage({ type: 'history', data: msg.history });
    } else if (msg.type === 'exit') {
      this.postMessage({ type: 'exit', exitCode: msg.exitCode, signal: msg.signal });
    }
  }

  private getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const xtermCss = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'xterm.css'),
    );
    const xtermJs = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'xterm.js'),
    );
    const addonFitJs = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'xterm-addon-fit.js'),
    );
    const mainJs = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'main.js'),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}' ${webview.cspSource};
    img-src ${webview.cspSource} data:;
  ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OLYMPUS Terminal</title>
  <link rel="stylesheet" href="${xtermCss}">
  <style>
    body { margin: 0; padding: 0; background: #0A0E16; color: #B8B8B8; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; overflow: hidden; }
    #toolbar { height: 28px; background: #0E1320; border-bottom: 1px solid rgba(212,165,116,0.1); display: flex; align-items: center; padding: 0 10px; gap: 8px; font-size: 11px; color: #8B8B8B; }
    #toolbar button { background: rgba(212,165,116,0.15); color: #D4A574; border: 1px solid rgba(212,165,116,0.3); padding: 2px 8px; border-radius: 3px; font: inherit; cursor: pointer; }
    #toolbar button:hover { background: rgba(212,165,116,0.25); }
    #terminal-container { position: absolute; top: 28px; left: 0; right: 0; bottom: 0; padding: 4px; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span id="status">OLYMPUS Terminal</span>
    <span style="flex:1"></span>
    <button id="focus-olympus">Open in OLYMPUS</button>
  </div>
  <div id="terminal-container"></div>
  <script nonce="${nonce}" src="${xtermJs}"></script>
  <script nonce="${nonce}" src="${addonFitJs}"></script>
  <script nonce="${nonce}" src="${mainJs}"></script>
</body>
</html>`;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ─── Tree views (status + live terminals) ────────────────────────────────────

class StatusTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private client: BridgeClient) {
    client.onConnectionChange(() => this._onDidChange.fire(undefined));
  }

  refresh() { this._onDidChange.fire(undefined); }

  getTreeItem(elem: vscode.TreeItem): vscode.TreeItem { return elem; }
  getChildren(): vscode.TreeItem[] {
    const connected = this.client.connected;
    return [
      {
        label: connected ? 'OLYMPUS Bridge: Connected' : 'OLYMPUS Bridge: Disconnected',
        iconPath: new vscode.ThemeIcon(connected ? 'check' : 'circle-slash'),
        description: connected ? `ws://127.0.0.1:${BRIDGE_PORT}` : 'Reconnecting…',
        contextValue: 'status',
      } as vscode.TreeItem,
      {
        label: 'Open Terminal Panel',
        iconPath: new vscode.ThemeIcon('terminal'),
        command: { command: 'olympus.openTerminalPanel', title: 'Open' },
      } as vscode.TreeItem,
      {
        label: 'Open in OLYMPUS (focus Electron)',
        iconPath: new vscode.ThemeIcon('window'),
        command: { command: 'olympus.focusOlympusWindow', title: 'Focus' },
      } as vscode.TreeItem,
    ];
  }
}

class TerminalsTreeProvider implements vscode.TreeDataProvider<BridgePtyTreeItem> {
  private _onDidChange = new vscode.EventEmitter<BridgePtyTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private sessions: BridgePtyInfo[] = [];

  constructor(private client: BridgeClient) {}

  refresh() { this._onDidChange.fire(undefined); }

  setSessions(s: BridgePtyInfo[]) {
    this.sessions = s;
    this._onDidChange.fire(undefined);
  }

  getTreeItem(elem: BridgePtyTreeItem): BridgePtyTreeItem { return elem; }

  async getChildren(): Promise<BridgePtyTreeItem[]> {
    if (!this.client.connected) return [];
    const sessions = await this.client.listSessions();
    this.sessions = sessions;
    return sessions.map(s => {
      const item = new BridgePtyTreeItem(s);
      return item;
    });
  }
}

class BridgePtyTreeItem extends vscode.TreeItem {
  constructor(public readonly info: BridgePtyInfo) {
    super(info.label, vscode.TreeItemCollapsibleState.None);
    this.description = `${info.kind} · ${info.cwd}`;
    this.contextValue = 'pty';
    this.iconPath = new vscode.ThemeIcon('terminal');
    this.command = {
      command: 'olympus.attachTerminal',
      title: 'Attach',
      arguments: [info],
    };
  }
}

// ─── Extension lifecycle ─────────────────────────────────────────────────────

let client: BridgeClient;
let statusProvider: StatusTreeProvider;
let terminalsProvider: TerminalsTreeProvider;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('olympus.bridge');
  const tokenFile = cfg.get<string>('tokenFile') || DEFAULT_TOKEN_FILE;

  client = new BridgeClient(tokenFile);
  statusProvider = new StatusTreeProvider(client);
  terminalsProvider = new TerminalsTreeProvider(client);

  // Status bar item — always visible while the extension is active.
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBarItem.command = 'olympus.showBridgeStatus';
  statusBarItem.text = '$(terminal) OLYMPUS: …';
  statusBarItem.tooltip = 'OLYMPUS Bridge — click for status';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Tree views.
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('olympus.status', statusProvider),
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('olympus.terminals', terminalsProvider),
  );

  // Pump bridge messages into the active terminal panel (if any).
  client.onMessage((msg: BridgeMessage) => {
    if (msg.type === 'sessions') {
      terminalsProvider.setSessions(msg.sessions || []);
    }
    for (const panel of TerminalBridgePanel['instances'].values() as any) {
      panel.handleBridgeMessage(msg);
    }
  });

  // Update status bar on connection changes.
  client.onConnectionChange((connected) => {
    statusBarItem.text = `$(terminal) OLYMPUS: ${connected ? 'Connected' : 'Disconnected'}`;
    statusBarItem.tooltip = connected
      ? `OLYMPUS Bridge connected at ws://127.0.0.1:${BRIDGE_PORT}`
      : 'OLYMPUS Bridge disconnected — start OLYMPUS to reconnect';
    statusBarItem.backgroundColor = connected
      ? undefined
      : new vscode.ThemeColor('statusBarItem.warningBackground');
    statusProvider.refresh();
    terminalsProvider.refresh();
  });

  // Commands.
  context.subscriptions.push(
    vscode.commands.registerCommand('olympus.openTerminalPanel', async () => {
      if (!client.connected) {
        const choice = await vscode.window.showWarningMessage(
          'OLYMPUS Bridge is not connected. Make sure OLYMPUS is running.',
          'Retry',
          'Cancel',
        );
        if (choice === 'Retry') {
          await client.connect();
          if (!client.connected) return;
        } else {
          return;
        }
      }
      TerminalBridgePanel.createOrShow(context.extensionUri, client, null, 'New Terminal');
    }),

    vscode.commands.registerCommand('olympus.attachTerminal', async (item?: BridgePtyTreeItem) => {
      if (!item || !item.info) return;
      if (!client.connected) {
        vscode.window.showWarningMessage('OLYMPUS Bridge is not connected.');
        return;
      }
      TerminalBridgePanel.createOrShow(context.extensionUri, client, item.info.id, item.info.label);
    }),

    vscode.commands.registerCommand('olympus.spawnTerminal', async () => {
      if (!client.connected) {
        vscode.window.showWarningMessage('OLYMPUS Bridge is not connected.');
        return;
      }
      TerminalBridgePanel.createOrShow(context.extensionUri, client, null, 'New Terminal');
    }),

    vscode.commands.registerCommand('olympus.focusOlympusWindow', async () => {
      if (!client.connected) {
        vscode.window.showWarningMessage('OLYMPUS is not running.');
        return;
      }
      client.send({ type: 'focus-olympus' });
      vscode.window.showInformationMessage('Focused the OLYMPUS Electron window.');
    }),

    vscode.commands.registerCommand('olympus.refreshTerminals', () => {
      terminalsProvider.refresh();
    }),

    vscode.commands.registerCommand('olympus.showBridgeStatus', async () => {
      const sessions = client.connected ? await client.listSessions() : [];
      const status = client.connected
        ? `✓ Connected at ws://127.0.0.1:${BRIDGE_PORT}\nToken file: ${tokenFile}\nActive PTY sessions: ${sessions.length}`
        : `✗ Disconnected\n\nMake sure OLYMPUS is running:\n  olympus dev\n\nThe token file should appear at:\n  ${tokenFile}`;
      vscode.window.showInformationMessage(status, { modal: false });
    }),

    vscode.commands.registerCommand('olympus.openEditorOnWorkspace', async () => {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (!ws) {
        vscode.window.showWarningMessage('Open a workspace folder first.');
        return;
      }
      // Launch the user's configured editor on this workspace. Since we're
      // already inside VSCode, just open a new window — but the user might
      // prefer Zed. For now we just focus the OLYMPUS window and let them
      // click "Open in Editor" there.
      client.send({ type: 'focus-olympus' });
      vscode.window.showInformationMessage(
        `Focused OLYMPUS. Click "Open in Editor" in the Editor Bridge tab to launch your editor on:\n${ws}`,
      );
    }),
  );

  // Auto-connect on activation if configured.
  if (cfg.get<boolean>('autoConnect', true)) {
    client.connect().then((ok) => {
      if (!ok) {
        // Silent — the status bar shows the disconnected state. The user
        // will be prompted when they invoke a command.
      }
    });
  }
}

export function deactivate() {
  if (client) {
    client.disconnect();
  }
}

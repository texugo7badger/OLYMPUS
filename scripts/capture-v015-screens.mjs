import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CDP_PORT || 9273);
const OUT = path.join(ROOT, 'screenshots', 'screens');
const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${PORT}`,'--window-size=1600,1000','about:blank'], { stdio: 'ignore', detached: true });
let wsUrl = null;
for (let i=0;i<40;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/list`); const p=(await r.json()).find(x=>x.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} }catch{} await sleep(250); }
const ws = new WebSocket(wsUrl); let id=0; const pending=new Map();
ws.on('message', raw=>{ const m=JSON.parse(String(raw)); if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej);});
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const token=fs.readFileSync(path.join(os.homedir(),'.olympus/session-token'),'utf-8').trim();
await send('Network.setCookie',{name:'olympus_token',value:token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict'});
const ev=async(expr)=>(await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}))?.result?.value;
const shot=async(name)=>{ const s=await send('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(path.join(OUT,name), Buffer.from(s.data,'base64')); console.log('shot', name); };
const waitFor=async(expr,ms=20000)=>{ for(let i=0;i<Math.ceil(ms/500);i++){ if(await ev(`(()=>{try{return Boolean(${expr})}catch{return false}})()`)) return true; await sleep(500);} return false; };
const clickLabel=async(label)=>{ const ok=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)}); if(!b)return false; b.click(); return true;})()`); await sleep(1200); return ok; };

const APP_URL = process.env.OLYMPUS_URL || 'http://127.0.0.1:3737/';
await send('Page.navigate',{url:APP_URL});
await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`, 25000);
await waitFor(`document.querySelector('canvas.brain-atlas-canvas')`, 25000);
await sleep(3000);
// Force English for a consistent gallery; the language is persisted locally
// and on the server, so a previous pt-BR run cannot skew the labels.
await ev(`(async()=>{try{localStorage.setItem('olympus:language','en');localStorage.setItem('olympus:language-updated-at',new Date().toISOString());await fetch('/api/olympus/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'en'})});}catch{}return true;})()`);
await send('Page.reload');
await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`, 25000);
await waitFor(`document.querySelector('canvas.brain-atlas-canvas')`, 25000);
await sleep(5000);
await shot('01-pantheon-015.png');

await clickLabel('God intelligence');
await waitFor(`Boolean(document.querySelector('[data-testid="retrieval-status"]'))`, 20000);
await sleep(1500);
await shot('03-god-intelligence-015.png');

await clickLabel('Cost');
await waitFor(`document.querySelectorAll('[aria-label="Hourly token usage"] > div').length > 0`, 20000);
await sleep(1500);
await shot('06-cost-015.png');

await clickLabel('LLM strategy');
await waitFor(`/GO Balanced/.test(document.body.innerText) && /DeepSeek V4\\.1 Flash/.test(document.body.innerText)`, 20000);
await sleep(800);
await shot('10-llm-strategy-015.png');

await clickLabel('Logs');
await waitFor(`/flight recorder|gravador de voo/i.test(document.body.innerText)`, 25000);
await sleep(1500);
await shot('11-logs-015.png');

await clickLabel('apollo');
await waitFor(`/Dispatches|Despachos/i.test(document.body.innerText)`, 20000);
await sleep(1000);
await shot('12-god-detail-015.png');

// pt-BR proof: set the language, reload, and capture the shell/logs in Portuguese.
await ev(`(async()=>{try{localStorage.setItem('olympus:language','pt-BR');localStorage.setItem('olympus:language-updated-at',new Date().toISOString());await fetch('/api/olympus/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'pt-BR'})});}catch{}return true;})()`);
await send('Page.reload');
await waitFor(`!document.querySelector('[aria-label="OLYMPUS is loading"]')`, 25000);
await sleep(4000);
await clickLabel('Logs');
await waitFor(`/flight recorder|gravador de voo/i.test(document.body.innerText)`, 25000);
await sleep(1500);
await shot('13-logs-ptbr-015.png');

// Leave the app in English after the pt-BR proof.
await ev(`(async()=>{try{localStorage.setItem('olympus:language','en');localStorage.setItem('olympus:language-updated-at',new Date().toISOString());await fetch('/api/olympus/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'en'})});}catch{}return true;})()`);
try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
ws.close(); process.exit(0);

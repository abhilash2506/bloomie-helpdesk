const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} failed: ${res.status} ${text}`);
  return data;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return result.result ? result.result.value : undefined;
  }
  close() { if (this.ws) this.ws.close(); }
}

async function createTab(url) {
  return httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
}

async function main() {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.eval(`window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error||'error')));`);
  const login = await client.eval(`(async()=>{
    loginTenantCode.value='DEFAULT'; loginUser.value='master'; loginPass.value='Bloomie@9271#Master';
    loginBtn.click(); await new Promise(r=>setTimeout(r,1800));
    return { ok:getComputedStyle(appShell).display!=='none', user:profileName?.textContent||'' };
  })()`);

  const actions = [
    { name: 'Admin Panel', expr: `document.getElementById('snav-home')?.click()` },
    { name: 'Raise Ticket', expr: `document.getElementById('snav-raise')?.click()` },
    { name: 'Track Ticket', expr: `document.getElementById('snav-track')?.click()` },
    { name: 'Ask Bloomie', expr: `document.getElementById('snav-chat')?.click()` },
    { name: 'Knowledge Base', expr: `document.getElementById('snav-kb')?.click()` },
    { name: 'Forum', expr: `document.getElementById('snav-forum')?.click()` },
    { name: 'Reports', expr: `document.getElementById('snav-reports')?.click()` },
    { name: 'Settings', expr: `document.getElementById('snav-setup')?.click()` },
    { name: 'Me Menu', expr: `document.getElementById('tbAccountBtn')?.click()` },
    { name: 'Ask Bloomie Topic', expr: `document.getElementById('snav-chat')?.click(); await new Promise(r=>setTimeout(r,250)); document.querySelectorAll('#page-chat .chat-topic')[0]?.click()` },
    { name: 'Ask Bloomie Suggestion', expr: `document.querySelectorAll('#chatSugs .chat-sug')[0]?.click()` }
  ];

  const results = [];
  for (const action of actions) {
    const result = await client.eval(`(async()=>{ try { ${action.expr}; await new Promise(r=>setTimeout(r,700)); return {
      activePage:(Array.from(document.querySelectorAll('.page.active')).map(n=>n.id)[0]||''),
      menuOpen:document.getElementById('tbAccountMenu')?.classList.contains('open')||false,
      chatCount:document.querySelectorAll('#chatMessages .chat-bubble').length,
      errors:[...(window.__qaErrors||[])]
    }; } catch(err){ return { activePage:'', menuOpen:false, chatCount:0, errors:[String(err)] }; } })()`);
    results.push({ action: action.name, ...result });
  }

  console.log(JSON.stringify({ login, results }, null, 2));
  client.close();
}

main().catch(err => { console.error(err); process.exit(1); });

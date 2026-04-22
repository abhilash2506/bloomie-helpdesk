const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';
const MASTER_PASS = process.env.MASTER_PASS || 'Bloomie@9271#Master';

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
    await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true
    });
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

async function waitFor(client, expression, { timeoutMs = 12000, intervalMs = 250 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.eval(expression);
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for condition: ${expression}`);
}

async function resetBrowserState(client) {
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');
  await client.send('Page.navigate', { url: APP_URL });
  await waitFor(client, `document.readyState === 'complete'`);
  await client.eval(`(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    return true;
  })()`);
}

async function main() {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await resetBrowserState(client);
  await waitFor(client, `!!document.getElementById('loginTenantCode') && !!document.getElementById('loginUser') && !!document.getElementById('loginPass') && !!document.getElementById('loginBtn')`);

  const summary = {};
  summary.login = await client.eval(`(async()=>{
    window.__qaErrors=[]; window.addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error||'error')));
    loginTenantCode.value='DEFAULT'; loginUser.value='master'; loginPass.value=${JSON.stringify(process.env.MASTER_PASS || 'Bloomie@9271#Master')};
    loginBtn.click();
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8000) {
      if (getComputedStyle(appShell).display !== 'none') break;
      await new Promise(r=>setTimeout(r,250));
    }
    return {
      ok:getComputedStyle(appShell).display!=='none',
      viewport:{w:window.innerWidth,h:window.innerHeight},
      user:profileName?.textContent||''
    };
  })()`);

  summary.sidebar = await client.eval(`(async()=>{
    tbHamburger.click();
    await new Promise(r=>setTimeout(r,300));
    const open = document.body.classList.contains('sidebar-open') || document.getElementById('sidebar')?.classList.contains('mobile-open');
    document.getElementById('snav-chat')?.click();
    await new Promise(r=>setTimeout(r,500));
    const afterNavOpen = document.body.classList.contains('sidebar-open') || document.getElementById('sidebar')?.classList.contains('mobile-open');
    return { open, afterNavOpen, activePage:Array.from(document.querySelectorAll('.page.active')).map(n=>n.id)[0]||'' };
  })()`);

  summary.chat = await client.eval(`(async()=>{
    const inp=document.getElementById('chatInp');
    inp.value='hi';
    window.sendChat();
    await new Promise(r=>setTimeout(r,1800));
    const lastBot=Array.from(document.querySelectorAll('#chatMessages .chat-bubble.bot')).slice(-1)[0]?.innerText||'';
    const inputRect=inp.getBoundingClientRect();
    return {
      lastBot,
      inputVisible: inputRect.top >= 0 && inputRect.bottom <= window.innerHeight + 4
    };
  })()`);

  summary.settings = await client.eval(`(async()=>{
    tbHamburger.click();
    await new Promise(r=>setTimeout(r,250));
    document.getElementById('snav-setup')?.click();
    await new Promise(r=>setTimeout(r,400));
    const title=document.querySelector('#page-setup .page-title')?.textContent||'';
    const firstCard=document.querySelector('#page-setup .card-title')?.textContent||'';
    return { activePage:Array.from(document.querySelectorAll('.page.active')).map(n=>n.id)[0]||'', title, firstCard };
  })()`);

  const refreshBefore = await client.eval(`Array.from(document.querySelectorAll('.page.active')).map(n=>n.id)[0]||''`);
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, `document.readyState === 'complete'`);
  await client.eval(`(async()=>{
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8000) {
      const loginVisible = typeof loginScreen !== 'undefined' && getComputedStyle(loginScreen).display !== 'none';
      const appVisible = typeof appShell !== 'undefined' && getComputedStyle(appShell).display !== 'none';
      if (loginVisible || appVisible) break;
      await new Promise(r => setTimeout(r, 250));
    }
    return true;
  })()`);
  summary.refresh = await client.eval(`({
    before:${JSON.stringify('')},
    after:Array.from(document.querySelectorAll('.page.active')).map(n=>n.id)[0]||'',
    loginVisible:getComputedStyle(loginScreen).display!=='none',
    errors:[...(window.__qaErrors||[])]
  })`);
  summary.refresh.before = refreshBefore;

  console.log(JSON.stringify(summary, null, 2));
  client.close();
}

main().catch(err => { console.error(err); process.exit(1); });

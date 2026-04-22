const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';
const MASTER_PASS = process.env.MASTER_PASS || 'Bloomie@9271#Master';

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  return res.json();
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
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return result.result ? result.result.value : undefined;
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  const target = await httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');
  await client.send('Page.navigate', { url: APP_URL });
  await new Promise(resolve => setTimeout(resolve, 2500));
  await client.eval(`(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    return true;
  })()`);
  await client.send('Page.navigate', { url: APP_URL });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const initial = await client.eval(`({
    ready: document.readyState,
    title: document.title,
    authTitle: document.getElementById('authTitle')?.textContent || '',
    loginBtn: !!document.getElementById('loginBtn'),
    legacyHandlers: document.querySelectorAll('[data-legacy-click],[data-legacy-change],[data-legacy-input],[data-legacy-keydown]').length,
    inlineHandlers: document.querySelectorAll('[onclick],[onchange],[oninput],[onkeydown]').length,
    appVisible: !!document.getElementById('appShell') && getComputedStyle(document.getElementById('appShell')).display !== 'none',
    loginVisible: !!document.getElementById('loginScreen') && getComputedStyle(document.getElementById('loginScreen')).display !== 'none',
    bodyClass: document.body.className
  })`);
  const login = await client.eval(`(async () => {
    const tenant = document.getElementById('loginTenantCode');
    const user = document.getElementById('loginUser');
    const pass = document.getElementById('loginPass');
    const btn = document.getElementById('loginBtn');
    if (!tenant || !user || !pass || !btn) {
      return { attempted: false, reason: 'missing-login-controls' };
    }
    tenant.value = 'DEFAULT';
    user.value = 'master';
    pass.value = ${JSON.stringify(process.env.MASTER_PASS || 'Bloomie@9271#Master')};
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 3500));
    return {
      attempted: true,
      appVisible: !!document.getElementById('appShell') && getComputedStyle(document.getElementById('appShell')).display !== 'none',
      loginVisible: !!document.getElementById('loginScreen') && getComputedStyle(document.getElementById('loginScreen')).display !== 'none',
      currentUser: document.getElementById('profileName')?.textContent || '',
      currentPage: Array.from(document.querySelectorAll('.page.active')).map(node => node.id)[0] || '',
      loginMessage: document.getElementById('loginMsg')?.textContent || '',
      loginBtnLabel: document.getElementById('loginBtn')?.textContent || '',
      legacyHandlers: document.querySelectorAll('[data-legacy-click],[data-legacy-change],[data-legacy-input],[data-legacy-keydown]').length,
      inlineHandlers: document.querySelectorAll('[onclick],[onchange],[oninput],[onkeydown]').length
    };
  })()`);
  console.log(JSON.stringify({ initial, login }, null, 2));
  client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';
const MASTER_PASS = process.env.MASTER_PASS || 'Bloomie@9271#Master';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Secure@123';
const MANAGER_PASS = process.env.MANAGER_PASS || 'Secure@123';
const USER_PASS = process.env.USER_PASS || 'Secure@123';

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

async function runRole(role) {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await resetBrowserState(client);
  await waitFor(client, `!!document.getElementById('loginTenantCode') && !!document.getElementById('loginUser') && !!document.getElementById('loginPass') && !!document.getElementById('loginBtn')`);

  const snapshot = await client.eval(`(async () => {
    window.__qaErrors = [];
    window.addEventListener('error', e => window.__qaErrors.push(String(e.message || e.error || 'error')));
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('Missing field ' + id);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('loginTenantCode', ${JSON.stringify(role.tenantCode)});
    setValue('loginUser', ${JSON.stringify(role.identifier)});
    setValue('loginPass', ${JSON.stringify(role.password)});
    document.getElementById('loginBtn')?.click();
    const loginStartedAt = Date.now();
    while (Date.now() - loginStartedAt < 8000) {
      if (document.getElementById('appShell') && getComputedStyle(document.getElementById('appShell')).display !== 'none') break;
      await new Promise(r => setTimeout(r, 250));
    }

    const isVisible = el => !!el
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden'
      && el.getClientRects().length > 0;
    const activePage = () => (Array.from(document.querySelectorAll('.page.active')).map(n => n.id)[0] || '');
    const navItems = Array.from(document.querySelectorAll('.sidebar .sb-item[id]'))
      .filter(isVisible)
      .map(el => ({
        id: el.id,
        text: (el.querySelector('.sb-text')?.textContent || el.textContent || '').trim()
      }));

    const clicks = [];
    for (const item of navItems) {
      const before = activePage();
      document.getElementById(item.id)?.click();
      await new Promise(r => setTimeout(r, 420));
      clicks.push({
        id: item.id,
        text: item.text,
        before,
        after: activePage()
      });
    }

    return {
      loginOk: !!document.getElementById('appShell') && getComputedStyle(document.getElementById('appShell')).display !== 'none',
      currentUser: document.getElementById('profileName')?.textContent || '',
      currentRole: document.getElementById('profileRole')?.textContent || '',
      activePage: activePage(),
      navItems,
      clicks,
      errors: window.__qaErrors || []
    };
  })()`);

  client.close();
  return snapshot;
}

async function main() {
  const roles = [
    { name: 'master', tenantCode: process.env.MASTER_TENANT || 'DEFAULT', identifier: process.env.MASTER_IDENTIFIER || 'master', password: MASTER_PASS },
    { name: 'admin', tenantCode: process.env.ADMIN_TENANT || 'DEFAULT', identifier: process.env.ADMIN_IDENTIFIER || 'DEMO-ADMIN', password: ADMIN_PASS },
    { name: 'manager', tenantCode: process.env.MANAGER_TENANT || 'DEFAULT', identifier: process.env.MANAGER_IDENTIFIER || 'DEMO-MGR', password: MANAGER_PASS },
    { name: 'user', tenantCode: process.env.USER_TENANT || 'DEFAULT', identifier: process.env.USER_IDENTIFIER || 'DEMO-USER', password: USER_PASS }
  ];
  const results = {};
  for (const role of roles) {
    results[role.name] = await runRole(role);
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

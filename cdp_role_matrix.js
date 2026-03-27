const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4181';

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} failed: ${res.status} ${text}`);
  return data;
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
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

async function loginInBrowser(role) {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.eval(`
    localStorage.clear();
    document.getElementById('loginTenantCode').value = ${JSON.stringify(role.tenantCode)};
    document.getElementById('loginUser').value = ${JSON.stringify(role.identifier)};
    document.getElementById('loginPass').value = ${JSON.stringify(role.password)};
    document.getElementById('loginBtn').click();
    true;
  `);
  await new Promise(resolve => setTimeout(resolve, 2200));

  const snapshot = await client.eval(`(async()=>{
    const isVisible = el => !!el
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden'
      && el.getClientRects().length > 0;
    const visibleText = nodes => Array.from(nodes).filter(isVisible).map(el => (el.textContent || '').trim()).filter(Boolean);
    const navIds = ['snav-home','snav-raise','snav-track','snav-chat','snav-kb','snav-forum','snav-my','snav-all','snav-reports','snav-integration','snav-setup'];
    const visibleSidebarItems = Array.from(document.querySelectorAll('.sidebar .sb-item'))
      .filter(isVisible)
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
    const navChecks = [];
    for (const id of navIds) {
      const el = document.getElementById(id);
      navChecks.push({
        id,
        visible: isVisible(el),
        text: el ? (el.textContent || '').trim() : '',
      });
    }
    const quickCards = visibleText(document.querySelectorAll('#homeQuickGrid .qc-label'));
    document.getElementById('tbAccountBtn')?.click();
    await new Promise(r => setTimeout(r, 250));
    const meMenu = visibleText(document.querySelectorAll('#tbAccountMenu .tb-menu-item'));
    const activePage = (Array.from(document.querySelectorAll('.page.active')).map(n => n.id)[0] || '');
    const pageChecks = [];
    for (const id of navIds) {
      const el = document.getElementById(id);
      if (!isVisible(el)) continue;
      el.click();
      await new Promise(r => setTimeout(r, 300));
      pageChecks.push({
        id,
        text: (el.textContent || '').trim(),
        activePage: (Array.from(document.querySelectorAll('.page.active')).map(n => n.id)[0] || '')
      });
    }
    return {
      loginOk: getComputedStyle(document.getElementById('appShell')).display !== 'none',
      profileName: (document.getElementById('profileName') || {}).textContent || '',
      profileRole: (document.getElementById('profileRole') || {}).textContent || '',
      tenantBadge: (document.getElementById('sbOrgName') || {}).textContent || '',
      sidebar: visibleSidebarItems,
      quickCards,
      meMenu,
      activePage,
      pageChecks
    };
  })()`);

  client.close();
  return snapshot;
}

async function main() {
  const stamp = Date.now();
  const founder = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      tenantCode: 'DEFAULT',
      identifier: 'master',
      password: 'Bloomie@9271#Master'
    })
  });
  if (founder.status !== 200) throw new Error(`Founder login failed: ${founder.status} ${JSON.stringify(founder.body)}`);
  const founderAuth = { Authorization: 'Bearer ' + founder.body.token };

  const tenantCode = `RM${String(stamp).slice(-6)}`;
  const adminEmpId = `ADM-${String(stamp).slice(-6)}`;
  const userEmpId = `USR-${String(stamp).slice(-6)}`;

  const tenantCreate = await api('/api/master/tenants', {
    method: 'POST',
    headers: founderAuth,
    body: JSON.stringify({
      code: tenantCode,
      name: `Role Matrix ${stamp}`,
      plan: 'enterprise',
      primaryDomain: `role-${stamp}.local`,
      adminName: 'Role Admin',
      adminEmail: `role.admin.${stamp}@example.com`,
      adminEmpId,
      adminPassword: 'Secure@1234'
    })
  });
  if (tenantCreate.status !== 201) throw new Error(`Tenant create failed: ${tenantCreate.status} ${JSON.stringify(tenantCreate.body)}`);

  const userRegister = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      tenantCode,
      name: 'Role User',
      empId: userEmpId,
      email: `role.user.${stamp}@example.com`,
      dept: 'Ops',
      property: 'HQ',
      password: 'Secure@123'
    })
  });
  if (userRegister.status !== 201) throw new Error(`User register failed: ${userRegister.status} ${JSON.stringify(userRegister.body)}`);

  const roles = [
    { name: 'master', tenantCode: 'DEFAULT', identifier: 'master', password: 'Bloomie@9271#Master' },
    { name: 'admin', tenantCode, identifier: adminEmpId, password: 'Secure@1234' },
    { name: 'user', tenantCode, identifier: userEmpId, password: 'Secure@123' }
  ];

  const results = {};
  for (const role of roles) {
    results[role.name] = await loginInBrowser(role);
  }

  console.log(JSON.stringify({ tenantCode, adminEmpId, userEmpId, results }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

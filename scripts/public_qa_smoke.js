const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'https://bloomie-helpdesk-demo-abhilash.onrender.com/';
const API_BASE = process.env.API_BASE || APP_URL.replace(/\/$/, '');
const MASTER_PASS = process.env.MASTER_PASS || 'BloomieDemo@2026!';

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed: ${res.status} ${text}`);
  }
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
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
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

async function ensureDemoAccounts() {
  const users = [
    { empId: 'DEMO-ADMIN', email: 'demo.admin@bloomie.local', name: 'Demo Admin', dept: 'Operations', property: 'HQ', userType: 'associate', password: 'Secure@123' },
    { empId: 'DEMO-MGR', email: 'demo.manager@bloomie.local', name: 'Demo Manager', dept: 'Operations', property: 'HQ', userType: 'manager', password: 'Secure@123' },
    { empId: 'DEMO-USER', email: 'demo.user@bloomie.local', name: 'Demo User', dept: 'Operations', property: 'HQ', userType: 'associate', password: 'Secure@123' }
  ];

  const registerResults = [];
  for (const user of users) {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ tenantCode: 'DEFAULT', ...user })
    });
    registerResults.push({ empId: user.empId, status: result.status });
  }

  const master = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ tenantCode: 'DEFAULT', identifier: 'master', password: MASTER_PASS })
  });
  if (master.status !== 200) {
    throw new Error(`Master login failed for setup: ${master.status} ${JSON.stringify(master.body)}`);
  }
  const promote = await api('/api/admin/users/DEMO-ADMIN/role', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${master.body.token}` },
    body: JSON.stringify({ tenantCode: 'DEFAULT', role: 'admin' })
  });

  return { registerResults, promoteStatus: promote.status };
}

async function loginInBrowser(role) {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.eval(`
    const setValue = (node, value) => {
      if (!node) return;
      const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      node.focus();
      if (setter) setter.call(node, value);
      else node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      node.blur();
    };
    sessionStorage.clear();
    localStorage.clear();
    setValue(document.getElementById('loginTenantCode'), ${JSON.stringify(role.tenantCode)});
    setValue(document.getElementById('loginUser'), ${JSON.stringify(role.identifier)});
    setValue(document.getElementById('loginPass'), ${JSON.stringify(role.password)});
    document.getElementById('loginBtn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    true;
  `);
  await new Promise(resolve => setTimeout(resolve, 2500));

  const snapshot = await client.eval(`(async()=>{
    const isVisible = el => !!el
      && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden'
      && el.getClientRects().length > 0;
    const visibleText = nodes => Array.from(nodes).filter(isVisible).map(el => (el.textContent || '').trim()).filter(Boolean);
    const loginScreenVisible = isVisible(document.getElementById('loginScreen'));
    const appVisible = isVisible(document.getElementById('appShell'));
    const navIds = ['snav-home','snav-raise','snav-track','snav-chat','snav-kb','snav-forum','snav-my','snav-all','snav-reports','snav-integration','snav-setup'];
    const sidebar = Array.from(document.querySelectorAll('.sidebar .sb-item')).filter(isVisible).map(el => (el.textContent || '').trim()).filter(Boolean);
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
    let chat = null;
    const chatNav = document.getElementById('snav-chat');
    if (isVisible(chatNav)) {
      chatNav.click();
      await new Promise(r => setTimeout(r, 400));
      if (typeof window.openBloomieChat === 'function') window.openBloomieChat();
      await new Promise(r => setTimeout(r, 400));
      const inp = document.getElementById('chatInp');
      if (inp && typeof window.sendChat === 'function') {
        inp.value = 'hi';
        window.sendChat();
        await new Promise(r => setTimeout(r, 1800));
        const bubbles = Array.from(document.querySelectorAll('#chatMessages .chat-bubble'));
        chat = {
          bubbleCount: bubbles.length,
          lastBot: bubbles.filter(n => n.classList.contains('bot')).slice(-1)[0]?.innerText || ''
        };
      }
    }
    return {
      loginScreenVisible,
      appVisible,
      loginError: (document.getElementById('loginMsg') || {}).textContent || '',
      profileName: (document.getElementById('profileName') || {}).textContent || '',
      profileRole: (document.getElementById('profileRole') || {}).textContent || '',
      tenantName: (document.getElementById('sbOrgName') || {}).textContent || '',
      sidebar,
      quickCards: visibleText(document.querySelectorAll('#homeQuickGrid .qc-label')),
      pageChecks,
      chat
    };
  })()`);

  client.close();
  return snapshot;
}

async function main() {
  const health = await api('/api/health');
  const accountSetup = await ensureDemoAccounts();

  const roles = [
    { name: 'master', tenantCode: 'DEFAULT', identifier: 'master', password: MASTER_PASS },
    { name: 'admin', tenantCode: 'DEFAULT', identifier: 'DEMO-ADMIN', password: 'Secure@123' },
    { name: 'manager', tenantCode: 'DEFAULT', identifier: 'DEMO-MGR', password: 'Secure@123' },
    { name: 'user', tenantCode: 'DEFAULT', identifier: 'DEMO-USER', password: 'Secure@123' }
  ];

  const apiLogins = {};
  for (const role of roles) {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenantCode: role.tenantCode, identifier: role.identifier, password: role.password })
    });
    apiLogins[role.name] = {
      status: result.status,
      role: result.body.user && result.body.user.role,
      userType: result.body.user && result.body.user.userType
    };
  }

  const browser = {};
  for (const role of roles) {
    browser[role.name] = await loginInBrowser(role);
  }

  console.log(JSON.stringify({ health, accountSetup, apiLogins, browser }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

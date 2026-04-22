const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'https://bloomie-helpdesk-demo-abhilash.onrender.com/';
const IDENTIFIER = process.env.IDENTIFIER || 'master';
const PASSWORD = process.env.PASSWORD || '';

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
        const pending = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
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
}

async function createTab(url) {
  return httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
}

async function main() {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await new Promise(resolve => setTimeout(resolve, 1500));
  const result = await client.eval(`(async () => {
    const setValue = (node, value) => {
      if (!node) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      node.focus();
      if (setter) setter.call(node, value);
      else node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      node.blur();
    };
    sessionStorage.clear();
    localStorage.clear();
    setValue(document.getElementById('loginTenantCode'), 'DEFAULT');
    setValue(document.getElementById('loginUser'), ${JSON.stringify(IDENTIFIER)});
    setValue(document.getElementById('loginPass'), ${JSON.stringify(PASSWORD)});
    let thrown = null;
    try {
      await doLogin();
    } catch (err) {
      thrown = err && err.message ? err.message : String(err);
    }
    const visible = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    return {
      thrown,
      loginMsg: (document.getElementById('loginMsg') || {}).textContent || '',
      apiState: typeof API_STATE !== 'undefined' ? { token: !!API_STATE.token, tenantCode: API_STATE.tenantCode, backendReachable: API_STATE.backendReachable } : null,
      currentUser: typeof currentUser !== 'undefined' && currentUser ? { id: currentUser.id, role: currentUser.role, userType: currentUser.userType, name: currentUser.name } : null,
      loginVisible: visible(document.getElementById('loginScreen')),
      appVisible: visible(document.getElementById('appShell')),
      profileName: (document.getElementById('profileName') || {}).textContent || '',
      profileRole: (document.getElementById('profileRole') || {}).textContent || ''
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

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

async function main() {
  const target = await httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.eval(`
    localStorage.removeItem('bloomie_hd_token');
    localStorage.setItem('bloomie_hd_tenant_code', 'DEFAULT');
    localStorage.setItem(
      'bloomie_hd_session_user__DEFAULT',
      JSON.stringify({ name:'Fake User', role:'master', empId:'SYS-000', tenantCode:'DEFAULT' })
    );
    true;
  `);

  await client.send('Page.reload', {});
  await new Promise(resolve => setTimeout(resolve, 1800));

  const result = await client.eval(`({
    loginVisible: getComputedStyle(document.getElementById('loginScreen')).display !== 'none',
    appVisible: getComputedStyle(document.getElementById('appShell')).display !== 'none',
    profileName: (document.getElementById('profileName') || {}).textContent || '',
    token: localStorage.getItem('bloomie_hd_token') || '',
    savedUser: localStorage.getItem('bloomie_hd_session_user__DEFAULT')
  })`);

  console.log(JSON.stringify(result, null, 2));
  client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

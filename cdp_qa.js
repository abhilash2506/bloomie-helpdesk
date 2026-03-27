const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';

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

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
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

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function createTab(url) {
  return httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
}

async function main() {
  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  const summary = {};
  summary.initial = await client.eval(`({
    readyState: document.readyState,
    url: location.href,
    title: document.title,
    authTitle: document.getElementById('authTitle')?.textContent || '',
    hasLoginPanel: !!document.getElementById('loginPanel')
  })`);

  summary.login = await client.eval(`(async () => {
    const tenant = document.getElementById('loginTenantCode');
    const user = document.getElementById('loginUser');
    const pass = document.getElementById('loginPass');
    if (!tenant || !user || !pass) return { ok: false, error: 'login fields missing' };
    tenant.value = 'DEFAULT';
    user.value = 'master';
    pass.value = 'Bloomie@9271#Master';
    document.getElementById('loginBtn')?.click();
    await new Promise(r => setTimeout(r, 1800));
    return {
      ok: !!document.getElementById('appShell') && getComputedStyle(document.getElementById('appShell')).display !== 'none',
      currentPage: Array.from(document.querySelectorAll('.page.active')).map(n => n.id),
      currentUser: document.getElementById('profileName')?.textContent || '',
      meLabel: document.querySelector('.tb-account-label')?.textContent || ''
    };
  })()`);

  summary.chat = await client.eval(`(async () => {
    window.openBloomieChat();
    await new Promise(r => setTimeout(r, 500));
    const inp = document.getElementById('chatInp');
    if (!inp) return { ok: false, error: 'chat input missing' };
    inp.value = 'hi';
    window.sendChat();
    await new Promise(r => setTimeout(r, 1800));
    const bubbles = Array.from(document.querySelectorAll('#chatMessages .chat-bubble'));
    return {
      ok: bubbles.length >= 2,
      lastBot: bubbles.filter(n => n.classList.contains('bot')).slice(-1)[0]?.innerText || ''
    };
  })()`);

  summary.localization = await client.eval(`(async () => {
    window.showPage('setup', document.getElementById('snav-setup'));
    await new Promise(r => setTimeout(r, 300));
    const lang = document.getElementById('setupLanguage');
    lang.value = 'hi-IN';
    window.saveAISettings();
    await new Promise(r => setTimeout(r, 500));
    window.showPage('integration', document.getElementById('snav-integration'));
    await new Promise(r => setTimeout(r, 300));
    const hrmsCardTitle = document.querySelector('#page-integration .card-title')?.textContent || '';
    const hrmsButton = document.querySelector('#page-integration .card .btn')?.textContent || '';
    window.showPage('reports', document.getElementById('snav-reports'));
    await new Promise(r => setTimeout(r, 300));
    const reportLabel = document.querySelector('#page-reports .stat-card .sc-label')?.textContent || '';
    window.showPage('setup', document.getElementById('snav-setup'));
    await new Promise(r => setTimeout(r, 300));
    const settingsCardTitle = document.querySelector('#page-setup .card-title')?.textContent || '';
    const sidebar = document.querySelector('#snav-chat .sb-text')?.textContent || '';
    const hrmsTitle = document.querySelector('#page-integration .page-title')?.textContent || '';
    return { sidebar, hrmsTitle, hrmsCardTitle, hrmsButton, reportLabel, settingsCardTitle, docLang: document.documentElement.lang };
  })()`);

  const refreshBefore = await client.eval(`(async () => {
    window.showPage('forum', document.getElementById('snav-forum'));
    await new Promise(r => setTimeout(r, 300));
    return Array.from(document.querySelectorAll('.page.active')).map(n => n.id)[0] || '';
  })()`);
  await client.send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2500));
  const refreshAfter = await client.eval(`({
    after: Array.from(document.querySelectorAll('.page.active')).map(n => n.id)[0] || '',
    loginVisible: !!document.getElementById('loginScreen') && getComputedStyle(document.getElementById('loginScreen')).display !== 'none'
  })`);
  summary.refresh = { before: refreshBefore, ...refreshAfter };

  console.log(JSON.stringify(summary, null, 2));
  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

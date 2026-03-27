const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4181/';

const LANGS = [
  { code: 'pa-IN', name: 'Punjabi' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'kn-IN', name: 'Kannada' }
];

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} failed: ${res.status} ${text}`);
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

  close() {
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

  const login = await client.eval(`(async () => {
    const tenant = document.getElementById('loginTenantCode');
    const user = document.getElementById('loginUser');
    const pass = document.getElementById('loginPass');
    tenant.value = 'DEFAULT';
    user.value = 'master';
    pass.value = 'Bloomie@9271#Master';
    document.getElementById('loginBtn')?.click();
    await new Promise(r => setTimeout(r, 1800));
    return {
      ok: !!document.getElementById('appShell') && getComputedStyle(document.getElementById('appShell')).display !== 'none',
      currentUser: document.getElementById('profileName')?.textContent || ''
    };
  })()`);

  const results = [];
  for (const lang of LANGS) {
    const result = await client.eval(`(async () => {
      window.showPage('setup', document.getElementById('snav-setup'));
      await new Promise(r => setTimeout(r, 250));
      const langSel = document.getElementById('setupLanguage');
      langSel.value = '${lang.code}';
      window.saveAISettings();
      await new Promise(r => setTimeout(r, 450));

      window.showPage('integration', document.getElementById('snav-integration'));
      await new Promise(r => setTimeout(r, 250));
      const hrmsTitle = document.querySelector('#page-integration .page-title')?.textContent || '';
      const hrmsCardTitle = document.querySelector('#page-integration .card-title')?.textContent || '';

      window.showPage('reports', document.getElementById('snav-reports'));
      await new Promise(r => setTimeout(r, 250));
      const reportLabel = document.querySelector('#page-reports .stat-card .sc-label')?.textContent || '';

      window.openBloomieChat();
      await new Promise(r => setTimeout(r, 250));
      const inp = document.getElementById('chatInp');
      inp.value = 'hi';
      window.sendChat();
      await new Promise(r => setTimeout(r, 1800));
      const lastBot = Array.from(document.querySelectorAll('#chatMessages .chat-bubble.bot')).slice(-1)[0]?.innerText || '';

      return {
        code: '${lang.code}',
        sidebar: document.querySelector('#snav-chat .sb-text')?.textContent || '',
        hrmsTitle,
        hrmsCardTitle,
        reportLabel,
        chat: lastBot,
        docLang: document.documentElement.lang
      };
    })()`);
    results.push({ language: lang.name, ...result });
  }

  console.log(JSON.stringify({ login, results }, null, 2));
  client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

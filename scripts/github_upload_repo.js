const path = require('path');

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const REPO_URL = process.env.REPO_URL || 'https://github.com/Abhilash2506/Bloomie-Helpdesk';
const UPLOAD_URL = `${REPO_URL}/upload`;
const WORKDIR = process.env.WORKDIR || process.cwd();
const FILES = (process.env.FILES || '').split('\n').map(v => v.trim()).filter(Boolean);
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE || 'Initial Bloomie Helpdesk product and deployment setup';

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
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
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

  async waitFor(checkExpression, timeoutMs = 30000, intervalMs = 500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.eval(checkExpression);
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out waiting for condition: ${checkExpression}`);
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

function absFiles() {
  if (!FILES.length) throw new Error('No files provided in FILES env var');
  return FILES.map(file => path.resolve(WORKDIR, file));
}

async function findPageTarget() {
  const targets = await httpJson(`${CDP_HTTP}/json/list`);
  const existing = targets.find(target => target.type === 'page' && target.url.startsWith(REPO_URL));
  if (existing) return existing;
  return httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(UPLOAD_URL)}`, { method: 'PUT' });
}

async function main() {
  const target = await findPageTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.navigate', { url: UPLOAD_URL });
  await client.waitFor(`document.readyState === 'complete'`);
  await client.waitFor(`!!document.querySelector('input[type="file"]')`, 30000);

  const root = await client.send('DOM.getDocument', {});
  const fileInput = await client.send('DOM.querySelector', {
    nodeId: root.root.nodeId,
    selector: 'input[type="file"]'
  });
  if (!fileInput.nodeId) {
    throw new Error('Could not find GitHub upload file input');
  }

  await client.send('DOM.setFileInputFiles', {
    nodeId: fileInput.nodeId,
    files: absFiles()
  });

  await client.waitFor(`(() => {
    const form = Array.from(document.forms).find(f => f.action && f.action.endsWith('/Bloomie-Helpdesk/upload'));
    const button = form && Array.from(form.querySelectorAll('button[type="submit"]')).find(b => /commit changes/i.test(b.innerText || ''));
    return !!button && !button.disabled;
  })()`, 60000);
  await client.eval(`(() => {
    const summary = document.getElementById('commit-summary-input');
    if (summary) summary.value = ${JSON.stringify(COMMIT_MESSAGE)};
    const details = document.getElementById('commit-description-textarea');
    if (details) details.value = 'Published from the prepared local product build.';
    const form = Array.from(document.forms).find(f => f.action && f.action.endsWith('/Bloomie-Helpdesk/upload'));
    if (!form) throw new Error('Commit form missing');
    const button = Array.from(form.querySelectorAll('button[type="submit"]')).find(b => /commit changes/i.test(b.innerText || ''));
    if (!button) throw new Error('Commit button missing');
    button.click();
    return true;
  })()`);

  await client.waitFor(`location.href === ${JSON.stringify(REPO_URL)} || (!location.href.includes('/upload') && document.title.includes('Abhilash2506/Bloomie-Helpdesk'))`, 60000);
  const summary = await client.eval(`({
    url: location.href,
    title: document.title,
    fileCountText: document.body.innerText.includes('backend/server.js')
  })`);
  console.log(JSON.stringify(summary, null, 2));
  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

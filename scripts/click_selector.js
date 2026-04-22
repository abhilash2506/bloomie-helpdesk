const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const TARGET_ID = process.env.TARGET_ID || '';
const SELECTOR = process.env.SELECTOR || '';
const INDEX = Number(process.env.INDEX || 0);

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
    this.ws = null;
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
    await this.send('Page.enable');
    await this.send('Runtime.enable');
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

async function main() {
  if (!TARGET_ID || !SELECTOR) throw new Error('TARGET_ID and SELECTOR are required');
  const targets = await httpJson(`${CDP_HTTP}/json/list`);
  const target = targets.find(item => item.id === TARGET_ID);
  if (!target) throw new Error(`Target not found: ${TARGET_ID}`);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  const result = await client.eval(`(async () => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(SELECTOR)}));
    const node = nodes[${INDEX}] || null;
    if (!node) return { ok: false, error: 'selector not found', count: nodes.length };
    node.click();
    await new Promise(resolve => setTimeout(resolve, 5000));
    return {
      ok: true,
      url: location.href,
      title: document.title,
      body: document.body.innerText.slice(0, 2400)
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

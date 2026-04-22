const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const TARGET_ID = process.env.TARGET_ID || '';
const SERVICE_NAME = process.env.SERVICE_NAME || '';
const BASE_URL = process.env.BASE_URL || '';
const MASTER_PASS = process.env.MASTER_PASS || '';
const APP_SECRET = process.env.APP_SECRET || '';

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
  if (!TARGET_ID || !SERVICE_NAME || !BASE_URL || !MASTER_PASS || !APP_SECRET) {
    throw new Error('TARGET_ID, SERVICE_NAME, BASE_URL, MASTER_PASS, and APP_SECRET are required');
  }
  const targets = await httpJson(`${CDP_HTTP}/json/list`);
  const target = targets.find(item => item.id === TARGET_ID);
  if (!target) throw new Error(`Target not found: ${TARGET_ID}`);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  const result = await client.eval(`(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const setValue = (node, value) => {
      const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      node.focus();
      if (setter) setter.call(node, value);
      else node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      node.blur();
    };

    const serviceNameInput = document.getElementById('serviceName');
    if (!serviceNameInput) return { ok: false, error: 'serviceName input missing' };
    setValue(serviceNameInput, ${JSON.stringify(SERVICE_NAME)});

    const freeButton = Array.from(document.querySelectorAll('button')).find(button => (button.innerText || '').includes('Free'));
    if (!freeButton) return { ok: false, error: 'Free instance button missing' };
    freeButton.click();
    await sleep(300);

    const envs = [
      ['BLOOMIE_BASE_URL', ${JSON.stringify(BASE_URL)}],
      ['BLOOMIE_MASTER_PASS', ${JSON.stringify(MASTER_PASS)}],
      ['BLOOMIE_SECRET', ${JSON.stringify(APP_SECRET)}]
    ];

    const addEnvButton = () => Array.from(document.querySelectorAll('button')).find(button => (button.innerText || '').trim() === 'Add Environment Variable');
    const getNameInputs = () => Array.from(document.querySelectorAll('input[placeholder="NAME_OF_VARIABLE"]'));
    const getValueInputs = () => Array.from(document.querySelectorAll('textarea[placeholder="value"]'));

    while (getNameInputs().length < envs.length) {
      const button = addEnvButton();
      if (!button) return { ok: false, error: 'Add Environment Variable button missing' };
      button.click();
      await sleep(250);
    }

    const nameInputs = getNameInputs();
    const valueInputs = getValueInputs();
    if (nameInputs.length < envs.length || valueInputs.length < envs.length) {
      return {
        ok: false,
        error: 'Environment variable rows missing',
        names: nameInputs.length,
        values: valueInputs.length
      };
    }

    envs.forEach(([name, value], index) => {
      setValue(nameInputs[index], name);
      setValue(valueInputs[index], value);
    });

    await sleep(500);
    return {
      ok: true,
      url: location.href,
      title: document.title,
      serviceName: serviceNameInput.value,
      envNames: getNameInputs().map(node => node.value),
      body: document.body.innerText.slice(0, 2500)
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

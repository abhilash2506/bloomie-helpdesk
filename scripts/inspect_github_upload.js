const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const TARGET_URL = process.env.TARGET_URL || 'https://github.com/Abhilash2506/Bloomie-Helpdesk/upload';

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
  const targets = await httpJson(`${CDP_HTTP}/json/list`);
  const target = targets.find(item => item.url === TARGET_URL);
  if (!target) throw new Error(`Target not found: ${TARGET_URL}`);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  const result = await client.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]')).map((button, index) => ({
      index,
      tag: button.tagName,
      type: button.getAttribute('type'),
      text: (button.innerText || button.value || '').trim(),
      formAction: button.form ? button.form.action : '',
      className: button.className,
      name: button.getAttribute('name'),
      disabled: !!button.disabled
    }));
    const forms = Array.from(document.forms).map((form, index) => ({
      index,
      action: form.action,
      className: form.className,
      text: form.innerText.slice(0, 500)
    }));
    return {
      url: location.href,
      title: document.title,
      buttons: buttons.filter(item => /commit|upload|publish|add/i.test(item.text) || /upload/.test(item.formAction)),
      forms,
      body: document.body.innerText.slice(0, 4000)
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

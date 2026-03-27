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
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return result.result ? result.result.value : undefined;
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function createTab(url) {
  return httpJson(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
}

async function ask(client, prompt) {
  await client.eval(`(async()=>{
    document.getElementById('snav-chat').click();
    await new Promise(r=>setTimeout(r,250));
    const inp = document.getElementById('chatInp');
    inp.value = ${JSON.stringify(prompt)};
    sendChat();
    await new Promise(r=>setTimeout(r,1800));
    return true;
  })()`);
  return client.eval(`(() => {
    const bubbles = Array.from(document.querySelectorAll('#chatMessages .chat-bubble.bot'));
    const last = bubbles[bubbles.length - 1];
    return (last ? last.innerText : '').trim();
  })()`);
}

async function main() {
  const languages = [
    {
      code: 'en-IN',
      label: 'English',
      prompts: [
        'How do I submit an employee referral?',
        'My salary was delayed. What should I do?',
        'I need attendance regularisation for a missed punch',
        'Should I use forum or raise a ticket?',
        'How do I file a POSH complaint?'
      ]
    },
    {
      code: 'hi-IN',
      label: 'Hindi',
      prompts: [
        'मुझे employee referral कैसे submit करना है?',
        'मेरी salary delay हो गई है, क्या करूँ?',
        'मेरा missed punch है, attendance regularisation कैसे होगा?',
        'मुझे forum use करना चाहिए या ticket raise करना चाहिए?',
        'POSH complaint कैसे file करूँ?'
      ]
    },
    {
      code: 'pa-IN',
      label: 'Punjabi',
      prompts: [
        'ਮੈਂ employee referral ਕਿਵੇਂ submit ਕਰਾਂ?',
        'ਮੇਰੀ salary ਨਹੀਂ ਆਈ, ਕੀ ਕਰਾਂ?',
        'ਮੇਰਾ missed punch ਹੈ, attendance regularisation ਕਿਵੇਂ ਹੋਵੇਗੀ?',
        'ਮੈਨੂੰ forum ਵਰਤਣਾ ਚਾਹੀਦਾ ਹੈ ਜਾਂ ticket raise ਕਰਨੀ ਚਾਹੀਦੀ ਹੈ?',
        'POSH complaint ਕਿਵੇਂ file ਕਰਾਂ?'
      ]
    },
    {
      code: 'bn-IN',
      label: 'Bengali',
      prompts: [
        'আমি employee referral কীভাবে submit করব?',
        'আমার salary দেরি হয়েছে, কী করব?',
        'আমার missed punch হয়েছে, attendance regularisation কীভাবে হবে?',
        'আমার forum ব্যবহার করা উচিত নাকি ticket raise করা উচিত?',
        'POSH complaint কীভাবে file করব?'
      ]
    },
    {
      code: 'mr-IN',
      label: 'Marathi',
      prompts: [
        'मी employee referral कसा submit करू?',
        'माझा salary delay झाला आहे, काय करू?',
        'माझा missed punch आहे, attendance regularisation कसे होईल?',
        'मी forum वापरू का ticket raise करू?',
        'POSH complaint कशी file करू?'
      ]
    },
    {
      code: 'ta-IN',
      label: 'Tamil',
      prompts: [
        'நான் employee referral எப்படி submit செய்வது?',
        'என் salary delay ஆகி இருக்கிறது, என்ன செய்வது?',
        'எனக்கு missed punch உள்ளது, attendance regularisation எப்படி செய்வது?',
        'நான் forum பயன்படுத்தலாமா அல்லது ticket raise செய்யலாமா?',
        'POSH complaint எப்படி file செய்வது?'
      ]
    },
    {
      code: 'te-IN',
      label: 'Telugu',
      prompts: [
        'నేను employee referral ఎలా submit చేయాలి?',
        'నా salary delay అయింది, నేను ఏమి చేయాలి?',
        'నా missed punch కు attendance regularisation ఎలా చేయాలి?',
        'నేను forum ఉపయోగించాలా లేక ticket raise చేయాలా?',
        'POSH complaint ఎలా file చేయాలి?'
      ]
    },
    {
      code: 'ml-IN',
      label: 'Malayalam',
      prompts: [
        'ഞാൻ employee referral എങ്ങനെ submit ചെയ്യാം?',
        'എന്റെ salary delay ആയി, ഞാൻ എന്ത് ചെയ്യണം?',
        'എനിക്ക് missed punch ഉണ്ട്, attendance regularisation എങ്ങനെ ചെയ്യാം?',
        'ഞാൻ forum ഉപയോഗിക്കണോ അല്ലെങ്കിൽ ticket raise ചെയ്യണോ?',
        'POSH complaint എങ്ങനെ file ചെയ്യാം?'
      ]
    },
    {
      code: 'kn-IN',
      label: 'Kannada',
      prompts: [
        'ನಾನು employee referral ಅನ್ನು ಹೇಗೆ submit ಮಾಡಬೇಕು?',
        'ನನ್ನ salary delay ಆಗಿದೆ, ನಾನು ಏನು ಮಾಡಬೇಕು?',
        'ನನಗೆ missed punch ಇದೆ, attendance regularisation ಹೇಗೆ ಮಾಡುವುದು?',
        'ನಾನು forum ಬಳಸಬೇಕಾ ಅಥವಾ ticket raise ಮಾಡಬೇಕಾ?',
        'POSH complaint ಅನ್ನು ಹೇಗೆ file ಮಾಡಬೇಕು?'
      ]
    }
  ];

  const target = await createTab(APP_URL);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  const login = await client.eval(`(async()=>{
    localStorage.clear();
    loginTenantCode.value='ANTARA';
    loginUser.value='ANT-EMP-001';
    loginPass.value='Antara@User1';
    loginBtn.click();
    await new Promise(r=>setTimeout(r,2200));
    return { ok:getComputedStyle(appShell).display!=='none', user:(profileName||{}).textContent||'', lang:document.documentElement.lang };
  })()`);

  const runs = [];
  for (const language of languages) {
    await client.eval(`(async()=>{
      const key='bloomie_hd_cfg__ANTARA';
      const cfg=JSON.parse(localStorage.getItem(key)||'{}');
      cfg.language=${JSON.stringify(language.code)};
      localStorage.setItem(key, JSON.stringify(cfg));
      applyLanguageUI();
      clearChat();
      await new Promise(r=>setTimeout(r,300));
      return { lang:document.documentElement.lang };
    })()`);

    const answers = [];
    for (const prompt of language.prompts) {
      const answer = await ask(client, prompt);
      answers.push({ prompt, answer });
    }

    const meta = await client.eval(`({lang:document.documentElement.lang, user:(profileName||{}).textContent||''})`);
    runs.push({ language: language.label, code: language.code, login, meta, answers });
  }

  client.close();
  console.log(JSON.stringify({ runs }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

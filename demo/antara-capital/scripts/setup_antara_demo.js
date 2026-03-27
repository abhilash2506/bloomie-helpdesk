const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4181';
const APP_BASE = process.env.APP_BASE || 'http://127.0.0.1:4181';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function login(tenantCode, identifier, password) {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ tenantCode, identifier, password })
  });
}

async function loginWithRetry(tenantCode, identifier, password, attempts = 6) {
  let last;
  for (let index = 0; index < attempts; index += 1) {
    last = await login(tenantCode, identifier, password);
    if (last.status !== 429) return last;
    const retryAfter = Number(last.body && last.body.retryAfter) || 1;
    await sleep((retryAfter * 1000) + 250);
  }
  return last;
}

async function main() {
  const founder = await loginWithRetry('DEFAULT', 'master', 'Bloomie@9271#Master');
  if (founder.status !== 200) throw new Error(`Founder login failed: ${founder.status} ${JSON.stringify(founder.body)}`);
  const founderAuth = { Authorization: 'Bearer ' + founder.body.token };

  const tenantCode = 'ANTARA';
  const adminEmpId = 'ANT-ADM-001';
  const userEmpId = 'ANT-EMP-001';

  const existingTenants = await api('/api/master/tenants', { headers: founderAuth });
  const tenantExists = Array.isArray(existingTenants.body.tenants)
    && existingTenants.body.tenants.some(tenant => tenant.code === tenantCode);

  if (!tenantExists) {
    const created = await api('/api/master/tenants', {
      method: 'POST',
      headers: founderAuth,
      body: JSON.stringify({
        code: tenantCode,
        name: 'Antara Capital',
        plan: 'enterprise',
        primaryDomain: 'antara-capital.local',
        adminName: 'Ananya Mehta',
        adminEmail: 'admin@antaracapital.demo',
        adminEmpId,
        adminPassword: 'Antara@Admin1'
      })
    });
    if (created.status !== 201) throw new Error(`Tenant create failed: ${created.status} ${JSON.stringify(created.body)}`);
  }

  const adminLogin = await loginWithRetry(tenantCode, adminEmpId, 'Antara@Admin1');
  if (adminLogin.status !== 200) throw new Error(`Admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.body)}`);
  const adminAuth = { Authorization: 'Bearer ' + adminLogin.body.token };

  const userRegister = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      tenantCode,
      name: 'Rohan Singh',
      empId: userEmpId,
      email: 'rohan.singh@antaracapital.demo',
      dept: 'Operations',
      property: 'Mumbai HQ',
      password: 'Antara@User1'
    })
  });
  if (![201, 409].includes(userRegister.status)) {
    throw new Error(`User register failed: ${userRegister.status} ${JSON.stringify(userRegister.body)}`);
  }

  await api('/api/config/patch', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({
      orgName: 'Antara Capital',
      hrEmail: 'people@antaracapital.demo',
      portalUrl: 'intranet.antaracapital.demo',
      assistantName: 'Bloomie',
      language: 'en-IN',
      theme: 'dark',
      setupDoneAt: new Date().toISOString(),
      googleSheetUrl: `${APP_BASE}/demo/antara-capital/antara-capital-policies.csv`,
      policySource: 'Antara Capital HR Policy Digest',
      sopSource: 'Antara Capital Employee Operations SOP',
      misconductSource: 'Antara Capital Code of Conduct & POSH Handbook',
      importantTopics: 'leave,payroll,posh,referral,conduct,onboarding,offboarding'
    })
  });

  const sourceSync = await api('/api/sources/google-sheet/sync', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({
      title: 'Antara Capital Demo Policies',
      sheetUrl: `${APP_BASE}/demo/antara-capital/antara-capital-policies.csv`
    })
  });
  if (![201, 502].includes(sourceSync.status)) {
    throw new Error(`Source sync failed: ${sourceSync.status} ${JSON.stringify(sourceSync.body)}`);
  }

  const userLogin = await loginWithRetry(tenantCode, userEmpId, 'Antara@User1');
  if (userLogin.status !== 200) throw new Error(`User login failed: ${userLogin.status} ${JSON.stringify(userLogin.body)}`);
  const userAuth = { Authorization: 'Bearer ' + userLogin.body.token };

  const tickets = [
    {
      category: 'Payroll',
      priority: 'High',
      status: 'open',
      name: 'Rohan Singh',
      empcode: userEmpId,
      dept: 'Operations',
      hotel: 'Mumbai HQ',
      desc: 'My February reimbursement has not been included in payroll. Please confirm the claim status.',
      timeline: []
    },
    {
      category: 'Referral / Hiring',
      priority: 'Medium',
      status: 'open',
      name: 'Rohan Singh',
      empcode: userEmpId,
      dept: 'Operations',
      hotel: 'Mumbai HQ',
      desc: 'I want to refer a candidate for the Analyst role and need clarity on the bonus timeline.',
      timeline: []
    }
  ];
  for (const ticket of tickets) {
    await api('/api/tickets', { method: 'POST', headers: userAuth, body: JSON.stringify(ticket) });
  }

  const forumPost = await api('/api/forum/posts', {
    method: 'POST',
    headers: userAuth,
    body: JSON.stringify({
      title: 'What is the referral bonus eligibility timeline at Antara Capital?',
      body: 'I have referred a candidate and want to know when the referral bonus is usually released after joining.',
      category: 'referral',
      tags: ['referral', 'bonus', 'hiring'],
      status: 'open',
      acceptedReplyId: '',
      views: 8,
      upvotes: 2
    })
  });

  if (forumPost.status === 201 && forumPost.body.post && forumPost.body.post.id) {
    const postId = forumPost.body.post.id;
    await api(`/api/forum/posts/${encodeURIComponent(postId)}/replies`, {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        body: 'Referral bonus is generally released after the referred employee completes probation successfully, subject to final payroll validation.'
      })
    });
  }

  console.log(JSON.stringify({
    tenantCode,
    tenantName: 'Antara Capital',
    admin: { empId: adminEmpId, password: 'Antara@Admin1' },
    user: { empId: userEmpId, password: 'Antara@User1' },
    policyCsv: `${APP_BASE}/demo/antara-capital/antara-capital-policies.csv`,
    appUrl: APP_BASE + '/',
    sourceSyncStatus: sourceSync.status
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

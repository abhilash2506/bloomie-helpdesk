const base = process.env.APP_URL || 'http://127.0.0.1:4181';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function j(path, options = {}) {
  const res = await fetch(base + path, {
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
  const res = await j('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ tenantCode, identifier, password })
  });
  return res;
}

async function loginWithRetry(tenantCode, identifier, password, attempts = 6) {
  let last;
  for (let index = 0; index < attempts; index += 1) {
    last = await login(tenantCode, identifier, password);
    if (last.status !== 429) return last;
    const retryAfterSeconds = Number(last.body && last.body.retryAfter) || 1;
    await sleep((retryAfterSeconds * 1000) + 250);
  }
  return last;
}

async function main() {
  const stamp = Date.now();
  const founder = await loginWithRetry('DEFAULT', 'master', 'Bloomie@9271#Master');
  if (founder.status !== 200) {
    throw new Error(`Founder login failed: ${founder.status} ${JSON.stringify(founder.body)}`);
  }
  const founderAuth = { Authorization: 'Bearer ' + founder.body.token };

  const tenantCode = `DX${String(stamp).slice(-6)}`;
  const adminEmp = `ADM-${String(stamp).slice(-6)}`;
  const userEmp = `USR-${String(stamp).slice(-6)}`;

  const tenantCreate = await j('/api/master/tenants', {
    method: 'POST',
    headers: founderAuth,
    body: JSON.stringify({
      code: tenantCode,
      name: `Destructive QA ${stamp}`,
      plan: 'enterprise',
      primaryDomain: `dx-${stamp}.local`,
      adminName: 'Destroy Admin',
      adminEmail: `destroy.admin.${stamp}@example.com`,
      adminEmpId: adminEmp,
      adminPassword: 'Secure@1234'
    })
  });

  const tenantAdmin = await loginWithRetry(tenantCode, adminEmp, 'Secure@1234');
  const adminAuth = { Authorization: 'Bearer ' + tenantAdmin.body.token };

  const regUser = await j('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      tenantCode,
      name: 'Destroy User',
      empId: userEmp,
      email: `destroy.user.${stamp}@example.com`,
      dept: 'Ops',
      property: 'HQ',
      password: 'Secure@123'
    })
  });

  const userLogin1 = await loginWithRetry(tenantCode, userEmp, 'Secure@123');
  const userAuth = { Authorization: 'Bearer ' + userLogin1.body.token };

  const userReports = await j('/api/reports/summary', { headers: userAuth });
  const adminReports = await j('/api/reports/summary', { headers: adminAuth });
  const adminBackup = await j('/api/master/backups/create', { method: 'POST', headers: adminAuth });
  const founderBackup = await j('/api/master/backups/create', { method: 'POST', headers: founderAuth });
  const backupExport = await j('/api/master/backups/export', { headers: founderAuth });
  const backupRestore = await j('/api/master/backups/restore', {
    method: 'POST',
    headers: founderAuth,
    body: JSON.stringify(backupExport.body)
  });

  const promote = await j(`/api/admin/users/${encodeURIComponent(userEmp)}/role`, {
    method: 'PATCH',
    headers: founderAuth,
    body: JSON.stringify({ role: 'admin', tenantCode })
  });
  const promotedLogin = await loginWithRetry(tenantCode, userEmp, 'Secure@123');
  const promotedReports = await j('/api/reports/summary', {
    headers: { Authorization: 'Bearer ' + promotedLogin.body.token }
  });

  const suspend = await j(`/api/admin/users/${encodeURIComponent(userEmp)}/status`, {
    method: 'PATCH',
    headers: founderAuth,
    body: JSON.stringify({ status: 'suspended', tenantCode })
  });
  const suspendedLogin = await loginWithRetry(tenantCode, userEmp, 'Secure@123');

  const reactivate = await j(`/api/admin/users/${encodeURIComponent(userEmp)}/status`, {
    method: 'PATCH',
    headers: founderAuth,
    body: JSON.stringify({ status: 'active', tenantCode })
  });

  const ticketCreate = await j('/api/tickets', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({ category: 'QA', priority: 'High', status: 'open', desc: 'Destructive QA ticket', timeline: [] })
  });
  const ticketId = ticketCreate.body.ticket && ticketCreate.body.ticket.id;
  const ticketStatus = await j(`/api/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: 'PATCH',
    headers: adminAuth,
    body: JSON.stringify({ status: 'resolved' })
  });
  const ticketResponse = await j(`/api/tickets/${encodeURIComponent(ticketId)}/response`, {
    method: 'PATCH',
    headers: adminAuth,
    body: JSON.stringify({ hrResponse: 'Resolved in QA' })
  });
  const ticketDeleteByUser = await j(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'DELETE',
    headers: adminAuth
  });
  const ticketDeleteByMaster = await j(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'DELETE',
    headers: founderAuth,
    body: JSON.stringify({ tenantCode })
  });

  const deleteUser = await j(`/api/admin/users/${encodeURIComponent(userEmp)}`, {
    method: 'DELETE',
    headers: founderAuth,
    body: JSON.stringify({ tenantCode })
  });
  const deletedLogin = await loginWithRetry(tenantCode, userEmp, 'Secure@123');

  console.log(JSON.stringify({
    tenantCreate: tenantCreate.status,
    tenantAdminLogin: tenantAdmin.status,
    registerUser: regUser.status,
    userReports: userReports.status,
    adminReports: adminReports.status,
    adminBackup: adminBackup.status,
    founderBackup: founderBackup.status,
    backupExport: backupExport.status,
    backupRestore: backupRestore.status,
    promote: promote.status,
    promotedLogin: promotedLogin.status,
    promotedReports: promotedReports.status,
    suspend: suspend.status,
    suspendedLogin: suspendedLogin.status,
    reactivate: reactivate.status,
    ticketCreate: ticketCreate.status,
    ticketStatus: ticketStatus.status,
    ticketResponse: ticketResponse.status,
    ticketDeleteByUser: ticketDeleteByUser.status,
    ticketDeleteByMaster: ticketDeleteByMaster.status,
    deleteUser: deleteUser.status,
    deletedLogin: deletedLogin.status
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

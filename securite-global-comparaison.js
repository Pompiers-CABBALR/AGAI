(() => {
  'use strict';
  const recordId = '_GLOBAL__global__main';
  const config = window.AGAI_CONFIG || {};
  const base = String(config.supabaseUrl || '').replace(/\/$/, '');
  const apiKey = String(config.supabasePublishableKey || '');
  const form = document.getElementById('check-form');
  const button = document.getElementById('check-button');
  const result = document.getElementById('result');
  const loginField = document.getElementById('login');
  const passwordField = document.getElementById('password');
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const ordered = {};
      Object.keys(value).sort().forEach(key => { ordered[key] = canonical(value[key]); });
      return ordered;
    }
    return value;
  };
  const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  const withoutCredential = account => {
    const safe = { ...account };
    ['p', 'password_hash', 'passwordHash'].forEach(key => { delete safe[key]; });
    return safe;
  };
  const request = async (url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try { return await fetch(url, { ...options, cache: 'no-store', signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };
  const readLocal = async () => {
    if (!window.indexedDB || typeof indexedDB.databases !== 'function') throw new Error('stockage local non lisible');
    const databases = await indexedDB.databases();
    if (!databases.some(info => info.name === 'agai-sync-outbox')) throw new Error('file durable absente');
    const db = await new Promise((resolve, reject) => {
      const opened = indexedDB.open('agai-sync-outbox', 1);
      opened.onupgradeneeded = () => { opened.transaction.abort(); };
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error || new Error('file durable non lisible'));
    });
    try {
      if (!db.objectStoreNames.contains('records')) throw new Error('file durable non lisible');
      const entry = await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const read = tx.objectStore('records').get(recordId);
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error || new Error('copie locale non lisible'));
        tx.onabort = () => reject(tx.error || new Error('lecture locale interrompue'));
      });
      if (!entry || entry.id !== recordId || entry.row?.id !== recordId
        || entry.row?.caserne !== '_GLOBAL' || entry.row?.type !== 'global'
        || entry.row?.deleted !== false || !entry.row?.data
        || typeof entry.row.data !== 'object' || Array.isArray(entry.row.data)) {
        throw new Error('copie générale locale absente ou incomplète');
      }
      return entry.row.data;
    } finally { db.close(); }
  };
  const compare = (local, remote) => {
    const otherDifferences = Object.keys(local).filter(key => {
      if (key === 'LOGIN_HISTORY' || key === 'LOGIN_HISTORY_DELETED') return false;
      const left = key === 'GLOBAL_ACCOUNTS' ? (local.GLOBAL_ACCOUNTS || []).map(withoutCredential) : local[key];
      const right = key === 'GLOBAL_ACCOUNTS' ? (remote.GLOBAL_ACCOUNTS || []).map(withoutCredential) : remote[key];
      return !equal(left, right);
    });
    const remoteDeletes = remote.LOGIN_HISTORY_DELETED || {};
    const missingDeletes = Object.keys(local.LOGIN_HISTORY_DELETED || {}).filter(id =>
      !Object.prototype.hasOwnProperty.call(remoteDeletes, id)).length;
    const remoteHistory = new Map((remote.LOGIN_HISTORY || [])
      .filter(entry => entry && entry.id).map(entry => [entry.id, entry]));
    const unmatchedHistory = (local.LOGIN_HISTORY || []).filter(entry =>
      !entry || !entry.id || !(Object.prototype.hasOwnProperty.call(remoteDeletes, entry.id)
        || (remoteHistory.has(entry.id) && equal(entry, remoteHistory.get(entry.id))))).length;
    const covered = !otherDifferences.length && !missingDeletes && !unmatchedHistory;
    return 'Copie locale couverte par le serveur : ' + (covered ? 'OUI' : 'NON')
      + '\nAutres rubriques différentes : ' + (otherDifferences.join(', ') || 'aucune')
      + '\nSuppressions locales absentes du serveur : ' + missingDeletes
      + '\nConnexions locales non couvertes ou différentes : ' + unmatchedHistory
      + '\nAucune donnée ni file locale modifiée. Transmets seulement ces lignes à ton administrateur.';
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!base || !apiKey) { result.textContent = 'Configuration du contrôle indisponible. Rien n’a été modifié.'; return; }
    const login = loginField.value.trim().toLowerCase();
    const password = passwordField.value;
    button.disabled = true;
    result.textContent = 'Comparaison en cours…';
    try {
      const local = await readLocal();
      const signed = await request(base + '/functions/v1/agai-account-link', {
        method: 'POST', headers: { apikey: apiKey, Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'login', login, password })
      });
      const identity = await signed.json().catch(() => ({}));
      passwordField.value = '';
      if (!signed.ok || identity.personnelEnforcementEnabled !== true
        || identity.login !== login || identity.profile?.login !== login
        || identity.profile?.appRole !== 'superadmin' || !identity.session?.access_token) {
        result.textContent = 'Identité superadministrateur non confirmée. Rien n’a été modifié.';
        return;
      }
      const response = await request(base + '/rest/v1/records?id=eq.' + encodeURIComponent(recordId)
        + '&select=id,caserne,type,data,deleted&limit=1', {
        method: 'GET', headers: { apikey: apiKey, Authorization: 'Bearer ' + identity.session.access_token }
      });
      const rows = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(rows) || rows.length !== 1
        || rows[0].id !== recordId || rows[0].caserne !== '_GLOBAL'
        || rows[0].type !== 'global' || rows[0].deleted !== false
        || !rows[0].data || typeof rows[0].data !== 'object') {
        result.textContent = 'Copie générale du serveur inaccessible. Rien n’a été modifié ; conserve la file locale.';
        return;
      }
      result.textContent = compare(local, rows[0].data);
    } catch (_) {
      result.textContent = 'Contrôle indisponible sur cet appareil. Rien n’a été modifié ; conserve la file locale.';
    } finally {
      passwordField.value = '';
      button.disabled = false;
    }
  });
})();

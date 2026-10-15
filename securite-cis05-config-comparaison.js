(() => {
  'use strict';
  const station = 'CIS05';
  const recordId = station + '__config__main';
  const config = window.AGAI_CONFIG || {};
  const base = String(config.supabaseUrl || '').replace(/\/$/, '');
  const apiKey = String(config.supabasePublishableKey || '');
  const form = document.getElementById('check-form');
  const button = document.getElementById('check-button');
  const result = document.getElementById('result');
  const loginField = document.getElementById('login');
  const passwordField = document.getElementById('password');
  const names = {
    piquets: 'piquets', planningRotations: 'rotations du planning',
    disposValidated: 'disponibilités validées', piquetsValidated: 'piquets validés',
    astrConfig: 'paramètres des astreintes et véhicules',
    astrTelData: 'astreintes téléphoniques', astrTelParams: 'paramètres téléphoniques',
    statsTaux: 'taux statistiques', _stationLocation: 'position de la caserne',
    _operationalStartGeolocationEnabled: 'géolocalisation des départs',
    _rainModeAllowed: 'autorisation du mode pluie', rainMode: 'mode pluie',
    _statsPersonnelHoursReal: 'heures du personnel', _indemnitesAdmins: 'indemnités',
    _numberingStartOrderVersion: 'numérotation', _ut188ChainStartRepairVersion: 'correctif des horaires',
    _pilpUt185ChronologyRepairVersion: 'correctif de chronologie',
    adminLogins: 'administrateurs', adminLogin: 'administrateur principal'
  };
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
  const safeDifferences = (left, right) => {
    const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
    return [...keys].filter(key => !equal(left?.[key], right?.[key]))
      .map(key => names[key] || 'autre rubrique')
      .filter((name, index, all) => all.indexOf(name) === index).sort();
  };
  const request = async (url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try { return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }); }
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
        read.onerror = () => reject(read.error || new Error('fiche locale non lisible'));
        tx.onabort = () => reject(tx.error || new Error('lecture locale interrompue'));
      });
      if (!entry || entry.id !== recordId || entry.row?.id !== recordId
        || entry.row?.caserne !== station || entry.row?.type !== 'config'
        || entry.row?.deleted !== false || !entry.row?.data || typeof entry.row.data !== 'object') {
        throw new Error('fiche de configuration locale absente ou incomplète');
      }
      return entry.row.data;
    } finally { db.close(); }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!base || !apiKey) { result.textContent = 'Configuration du contrôle indisponible. Aucune donnée modifiée.'; return; }
    const login = loginField.value.trim().toLowerCase();
    const password = passwordField.value;
    button.disabled = true;
    result.textContent = 'Comparaison en cours…';
    try {
      const local = await readLocal();
      const signed = await request(base + '/functions/v1/agai-account-link', {
        method: 'POST', headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'login', login, password })
      });
      const identity = await signed.json().catch(() => ({}));
      passwordField.value = '';
      if (!signed.ok || identity.personnelEnforcementEnabled !== true
        || identity.login !== login || identity.caserneId !== station
        || identity.profile?.login !== login || identity.profile?.caserneId !== station
        || !identity.session?.access_token) {
        result.textContent = 'Identité CIS05 non confirmée. Aucune comparaison ni modification effectuée.';
        return;
      }
      const headers = { apikey: apiKey, Authorization: 'Bearer ' + identity.session.access_token };
      const checked = await request(base + '/functions/v1/agai-account-link', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'account_status' })
      });
      const status = await checked.json().catch(() => ({}));
      if (!checked.ok || status.canLogin !== true || status.login !== login || status.caserneId !== station) {
        result.textContent = 'Statut CIS05 non confirmé. Aucune comparaison ni modification effectuée.';
        return;
      }
      const url = base + '/rest/v1/records?id=eq.' + encodeURIComponent(recordId)
        + '&select=id,caserne,type,data,deleted&limit=1';
      const response = await request(url, { method: 'GET', headers });
      const rows = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(rows) || rows.length !== 1
        || rows[0].id !== recordId || rows[0].caserne !== station
        || rows[0].type !== 'config' || rows[0].deleted !== false
        || !rows[0].data || typeof rows[0].data !== 'object') {
        result.textContent = 'Fiche serveur CIS05 inaccessible ou incomplète. Rien n’a été modifié ; conservez la file locale.';
        return;
      }
      const remote = rows[0].data;
      const same = equal(local, remote);
      result.textContent = same
        ? 'CIS05 / configuration : copie locale identique à la copie serveur.\nAucune donnée ni file locale modifiée. Ne supprimez rien ; transmettez cette conclusion à votre administrateur.'
        : 'CIS05 / configuration : copies différentes.\nRubriques différentes : '
          + (safeDifferences(local, remote).join(', ') || 'structure de la fiche')
          + '.\nAucune donnée ni file locale modifiée. Ne supprimez rien ; transmettez cette conclusion à votre administrateur.';
    } catch (_) {
      result.textContent = 'Contrôle indisponible sur cet appareil. Aucune donnée ni file locale modifiée ; ne supprimez rien.';
    } finally {
      passwordField.value = '';
      button.disabled = false;
    }
  });
})();

(() => {
  'use strict';
  const recordId = '_GLOBAL__global__main';
  const config = window.AGAI_CONFIG || {};
  const base = String(config.supabaseUrl || '').replace(/\/$/, '');
  const apiKey = String(config.supabasePublishableKey || '');
  const form = document.getElementById('check-form');
  const button = document.getElementById('check-button');
  const repairButton = document.getElementById('repair-button');
  const result = document.getElementById('result');
  const loginField = document.getElementById('login');
  const passwordField = document.getElementById('password');
  passwordField.addEventListener('input', () => {
    if (!repairButton.hidden) repairButton.disabled = !passwordField.value;
  });
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
  const loginConflictDecision = (local, remote) => {
    if (!local || !remote || remote.id !== 'CIS05__login__' + local.id
      || remote.caserne !== 'CIS05' || remote.type !== 'login'
      || remote.deleted !== false || !remote.data || remote.data.id !== local.id
      || remote.data.login !== local.login || local.actif !== false
      || remote.data.actif !== false || !Number.isFinite(Date.parse(local.hConnexion || ''))
      || (local.hDeconnexion && !Number.isFinite(Date.parse(local.hDeconnexion)))
      || (remote.data.hDeconnexion && !Number.isFinite(Date.parse(remote.data.hDeconnexion)))) return '';
    const allowed = new Set(['lastSeenAt', 'hDeconnexion', 'fermetureAuto']);
    const keys = new Set(Object.keys(local).concat(Object.keys(remote.data)));
    if ([...keys].some(key => !allowed.has(key) && !equal(local[key], remote.data[key]))) return '';
    const localClosed = Date.parse(local.hDeconnexion || '');
    const remoteClosed = Date.parse(remote.data.hDeconnexion || '');
    if (!Number.isFinite(localClosed) && !Number.isFinite(remoteClosed)) return '';
    if (Number.isFinite(localClosed) && (!Number.isFinite(remoteClosed) || localClosed > remoteClosed)) return 'local';
    return 'remote';
  };
  const request = async (url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try { return await fetch(url, { ...options, cache: 'no-store', signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };
  const readLocal = async () => {
    const pending = JSON.parse(localStorage.getItem('agai_rc_pending_dirty') || '[]');
    if (!Array.isArray(pending) || pending.some(id => typeof id !== 'string'))
      throw new Error('liste locale illisible');
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
      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const read = tx.objectStore('records').getAll();
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error || new Error('copie locale non lisible'));
        tx.onabort = () => reject(tx.error || new Error('lecture locale interrompue'));
      });
      const entry = (entries || []).find(item => item && item.id === recordId);
      if (!entry || entry.id !== recordId || entry.row?.id !== recordId
        || entry.row?.caserne !== '_GLOBAL' || entry.row?.type !== 'global'
        || entry.row?.deleted !== false || !entry.row?.data
        || typeof entry.row.data !== 'object' || Array.isArray(entry.row.data)) {
        throw new Error('copie générale locale absente ou incomplète');
      }
      return { global: entry.row.data, entries, pending };
    } finally { db.close(); }
  };
  const compare = async (local, remote, token, login) => {
    const otherDifferences = Object.keys(local).filter(key => {
      if (key === 'LOGIN_HISTORY' || key === 'LOGIN_HISTORY_DELETED') return false;
      const left = key === 'GLOBAL_ACCOUNTS' ? (local.GLOBAL_ACCOUNTS || []).map(withoutCredential) : local[key];
      const right = key === 'GLOBAL_ACCOUNTS' ? (remote.GLOBAL_ACCOUNTS || []).map(withoutCredential) : remote[key];
      return !equal(left, right);
    });
    const remoteDeletes = remote.LOGIN_HISTORY_DELETED || {};
    const missingDeleteIds = Object.keys(local.LOGIN_HISTORY_DELETED || {}).filter(id =>
      !Object.prototype.hasOwnProperty.call(remoteDeletes, id));
    const missingDeletes = missingDeleteIds.length;
    const remoteHistory = new Map((remote.LOGIN_HISTORY || [])
      .filter(entry => entry && entry.id).map(entry => [entry.id, entry]));
    const unmatchedEntries = (local.LOGIN_HISTORY || []).filter(entry =>
      !entry || !entry.id || !(Object.prototype.hasOwnProperty.call(remoteDeletes, entry.id)
        || (remoteHistory.has(entry.id) && equal(entry, remoteHistory.get(entry.id)))));
    let separatelyStored = 0;
    let separatelyAbsent = 0;
    let otherSeparateCovered = 0;
    let otherSeparateDifferent = 0;
    let otherSeparateNotVisible = 0;
    const separateDifferences = [];
    let safeDecision = '';
    let safeConflicts = 0;
    if (unmatchedEntries.length > 10) throw new Error('Trop de traces à contrôler');
    for (const entry of unmatchedEntries) {
      if (!entry || !entry.id || !/^(CIS\d+|EMAJ)$/.test(entry.caserneId || '')) continue;
      const ownEntry = entry.login === login && entry.caserneId === 'CIS05';
      const id = entry.caserneId + '__login__' + entry.id;
      const response = await request(base + '/rest/v1/records?id=eq.' + encodeURIComponent(id)
        + '&select=id,caserne,type,data,deleted&limit=1', {
        method: 'GET', headers: { apikey: apiKey, Authorization: 'Bearer ' + token }
      });
      if (!response.ok) throw new Error('Lecture d’une trace impossible');
      const rows = await response.json();
      if (Array.isArray(rows) && rows.length === 1 && rows[0].id === id
        && rows[0].caserne === entry.caserneId && rows[0].type === 'login'
        && rows[0].deleted === false && equal(entry, rows[0].data)) {
        separatelyStored++;
        if (!ownEntry) otherSeparateCovered++;
      }
      else if (Array.isArray(rows) && rows.length === 1) {
        const remoteRow = rows[0];
        if (!ownEntry) otherSeparateDifferent++;
        else {
          safeDecision = loginConflictDecision(entry, remoteRow);
          if (safeDecision) safeConflicts++;
          if (remoteRow.deleted !== false) separateDifferences.push('trace marquée supprimée');
          else if (remoteRow.caserne !== 'CIS05' || remoteRow.type !== 'login'
            || remoteRow.data?.login !== login) separateDifferences.push('identité ou type différent');
          else {
            const keys = new Set(Object.keys(entry).concat(Object.keys(remoteRow.data || {})));
            separateDifferences.push('champs : ' + ([...keys].filter(key => !equal(entry[key], remoteRow.data?.[key])).join(', ') || 'structure'));
          }
        }
      } else if (Array.isArray(rows) && rows.length === 0) {
        separatelyAbsent++;
        if (!ownEntry) otherSeparateNotVisible++;
      }
    }
    const covered = !otherDifferences.length && !missingDeletes && !unmatchedEntries.length;
    const ownMissingDeletes = missingDeleteIds.filter(id => remoteHistory.get(id)?.login === login).length;
    const otherMissingDeletes = missingDeleteIds.filter(id => remoteHistory.has(id)
      && remoteHistory.get(id)?.login !== login).length;
    const absentMissingDeletes = missingDeletes - ownMissingDeletes - otherMissingDeletes;
    const ownUnmatched = unmatchedEntries.filter(entry => entry?.login === login
      && entry?.caserneId === 'CIS05').length;
    const otherUnmatched = unmatchedEntries.filter(entry => entry?.login !== login
      || entry?.caserneId !== 'CIS05');
    const sameAccountOtherStation = otherUnmatched.filter(entry => entry?.login === login).length;
    const differentAccount = otherUnmatched.filter(entry => entry?.login !== login).length;
    const otherInRemoteHistory = otherUnmatched.filter(entry => remoteHistory.has(entry?.id)).length;
    let deletionSeparateActive = 0;
    let deletionSeparateDeleted = 0;
    let deletionSeparateNotVisible = 0;
    for (const id of missingDeleteIds.slice(0, 3)) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) { deletionSeparateNotVisible++; continue; }
      const response = await request(base + '/rest/v1/records?id=like.'
        + encodeURIComponent('*__login__' + id) + '&select=id,caserne,type,deleted&limit=3', {
        method: 'GET', headers: { apikey: apiKey, Authorization: 'Bearer ' + token }
      });
      if (!response.ok) throw new Error('Lecture d’un marqueur impossible');
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Réponse du marqueur invalide');
      const matching = rows.filter(row => row?.id?.endsWith('__login__' + id)
        && row.type === 'login');
      if (!matching.length) deletionSeparateNotVisible++;
      matching.forEach(row => { if (row.deleted) deletionSeparateDeleted++;
        else deletionSeparateActive++; });
    }
    return { text: 'Copie locale couverte par le serveur : ' + (covered ? 'OUI' : 'NON')
      + '\nAutres rubriques différentes : ' + (otherDifferences.join(', ') || 'aucune')
      + '\nSuppressions locales absentes du serveur : ' + missingDeletes
      + '\nParmi ces suppressions, connexion du compte saisi encore dans l’historique serveur : ' + ownMissingDeletes
      + '\nConnexion d’un autre compte encore dans l’historique serveur : ' + otherMissingDeletes
      + '\nCible absente de l’historique serveur : ' + absentMissingDeletes
      + '\nMarqueur : trace séparée encore active / déjà supprimée / non visible : '
      + deletionSeparateActive + ' / ' + deletionSeparateDeleted + ' / ' + deletionSeparateNotVisible
      + '\nConnexions locales non couvertes ou différentes : ' + unmatchedEntries.length
      + '\nParmi elles, connexions du compte saisi à CIS05 : ' + ownUnmatched
      + '\nAutre trace : même compte dans une autre caserne / autre compte : '
      + sameAccountOtherStation + ' / ' + differentAccount
      + '\nAutre trace déjà présente dans l’historique global serveur : ' + otherInRemoteHistory
      + '\nAutre trace séparée identique / différente / non visible : '
      + otherSeparateCovered + ' / ' + otherSeparateDifferent + ' / ' + otherSeparateNotVisible
      + '\nParmi elles, traces déjà enregistrées séparément sur le serveur : ' + separatelyStored
      + '\nTraces séparées absentes du serveur : ' + separatelyAbsent
      + '\nTraces différentes à chronologie vérifiable : ' + safeConflicts
      + '\nTrace séparée présente mais différente : ' + (separateDifferences.join(' ; ') || 'non')
      + '\nRésolution sûre des heures de déconnexion : '
      + (unmatchedEntries.length !== 1 ? 'non établie pour l’ensemble des traces'
        : safeDecision === 'local' ? 'copie locale plus récente'
        : safeDecision === 'remote' ? 'copie serveur au moins aussi récente' : 'non établie')
      + '\nAucune donnée ni file locale modifiée. Transmets seulement ces lignes à ton administrateur.',
      recoverable: !otherDifferences.length && !missingDeletes
        && unmatchedEntries.length === 1 && (!separateDifferences.length || !!safeDecision),
      missingEntry: unmatchedEntries.length === 1 ? unmatchedEntries[0] : null };
  };
  const authenticate = async login => {
    const password = passwordField.value;
    const signed = await request(base + '/functions/v1/agai-account-link', {
      method: 'POST', headers: { apikey: apiKey, Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'login', login, password })
    });
    passwordField.value = '';
    const identity = await signed.json().catch(() => ({}));
    if (!signed.ok || identity.personnelEnforcementEnabled !== true
      || identity.login !== login || identity.profile?.login !== login
      || identity.profile?.appRole !== 'superadmin' || identity.profile?.caserneId !== 'CIS05'
      || !identity.session?.access_token) throw new Error('identité superadministrateur non confirmée');
    return identity.session.access_token;
  };
  const remoteRow = async (id, token) => {
    const response = await request(base + '/rest/v1/records?id=eq.' + encodeURIComponent(id)
      + '&select=id,caserne,type,data,deleted,updated_at&limit=1', {
      method: 'GET', headers: { apikey: apiKey, Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw new Error('lecture serveur indisponible');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('réponse serveur invalide');
    return rows[0] || null;
  };
  const sameLoginRow = (local, remote) => !!(remote && remote.id === local.id
    && remote.caserne === local.caserne && remote.type === 'login'
    && remote.deleted === false && equal(remote.data, local.data));
  const clearVerifiedLocalQueue = async (snapshot, loginId) => {
    const ids = [recordId, loginId];
    const expected = new Map(snapshot.entries.filter(entry => ids.includes(entry.id))
      .map(entry => [entry.id, JSON.stringify(entry)]));
    const currentPending = JSON.parse(localStorage.getItem('agai_rc_pending_dirty') || '[]');
    const expectedIds = JSON.stringify(ids.slice().sort());
    if (expected.size !== 2 || JSON.stringify(snapshot.pending.slice().sort()) !== expectedIds
      || !Array.isArray(currentPending) || JSON.stringify(currentPending.slice().sort()) !== expectedIds)
      throw new Error('la file locale a changé');
    const db = await new Promise((resolve, reject) => {
      const opened = indexedDB.open('agai-sync-outbox', 1);
      opened.onupgradeneeded = () => { opened.transaction.abort(); };
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        let checked = 0;
        ids.forEach(id => {
          const read = store.get(id);
          read.onsuccess = () => {
            if (JSON.stringify(read.result) !== expected.get(id)) { tx.abort(); return; }
            checked++;
            if (checked === ids.length) ids.forEach(key => store.delete(key));
          };
          read.onerror = () => tx.abort();
        });
        tx.oncomplete = resolve;
        tx.onabort = () => reject(new Error('la file locale a changé'));
        tx.onerror = () => reject(new Error('écriture locale impossible'));
      });
    } finally { db.close(); }
    for (const key of ['agai_rc_pending_dirty', 'agai_rc_pending_since', 'agai_rc_deferred_dirty']) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw);
      if (Array.isArray(value)) localStorage.setItem(key, JSON.stringify(value.filter(id => !ids.includes(id))));
      else if (value && typeof value === 'object') {
        ids.forEach(id => { delete value[id]; });
        localStorage.setItem(key, JSON.stringify(value));
      }
    }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    repairButton.hidden = true;
    if (!base || !apiKey) { result.textContent = 'Configuration du contrôle indisponible. Rien n’a été modifié.'; return; }
    const login = loginField.value.trim().toLowerCase();
    button.disabled = true;
    result.textContent = 'Comparaison en cours…';
    try {
      const local = await readLocal();
      const token = await authenticate(login);
      const remote = await remoteRow(recordId, token);
      if (!remote || remote.caserne !== '_GLOBAL' || remote.type !== 'global'
        || remote.deleted !== false || !remote.data || typeof remote.data !== 'object') {
        result.textContent = 'Copie générale du serveur inaccessible. Rien n’a été modifié ; conserve la file locale.';
        return;
      }
      const checked = await compare(local.global, remote.data, token, login);
      result.textContent = checked.text;
      const entry = checked.missingEntry;
      const loginId = entry && entry.caserneId + '__login__' + entry.id;
      const loginLocal = local.entries.find(item => item && item.id === loginId);
      repairButton.hidden = !(checked.recoverable && entry && entry.login === login
        && entry.caserneId === 'CIS05' && loginLocal && loginLocal.row
        && loginLocal.row.type === 'login' && loginLocal.row.caserne === 'CIS05'
        && loginLocal.row.deleted === false && equal(loginLocal.row.data, entry)
        && local.entries.length === 2 && local.pending.length === 2
        && local.pending.includes(recordId) && local.pending.includes(loginId));
      repairButton.disabled = true;
      if (!repairButton.hidden) result.textContent += '\nUne reprise de cette seule trace est disponible. Ressaisis ton mot de passe, puis confirme avec le second bouton.';
    } catch (_) {
      result.textContent = 'Contrôle indisponible sur cet appareil. Rien n’a été modifié ; conserve la file locale.';
    } finally {
      passwordField.value = '';
      button.disabled = false;
    }
  });
  repairButton.addEventListener('click', async () => {
    if (!passwordField.value) {
      result.textContent = 'Ressaisis ton mot de passe AGAI avant de confirmer la reprise. Rien n’a été modifié.';
      return;
    }
    repairButton.hidden = true;
    button.disabled = true;
    result.textContent = 'Reprise limitée de la trace de connexion en cours…';
    let stage = 'lecture locale';
    try {
      const login = loginField.value.trim().toLowerCase();
      const snapshot = await readLocal();
      stage = 'identité';
      const token = await authenticate(login);
      stage = 'lecture de la copie générale';
      const remoteGlobal = await remoteRow(recordId, token);
      if (!remoteGlobal || remoteGlobal.caserne !== '_GLOBAL' || remoteGlobal.type !== 'global'
        || remoteGlobal.deleted !== false || !remoteGlobal.data) throw new Error('copie serveur absente');
      stage = 'analyse de la copie générale';
      const checked = await compare(snapshot.global, remoteGlobal.data, token, login);
      const entry = checked.missingEntry;
      if (!checked.recoverable || !entry || entry.login !== login || entry.caserneId !== 'CIS05')
        throw new Error('conditions de reprise non réunies');
      const loginId = entry.caserneId + '__login__' + entry.id;
      stage = 'contrôle de la file locale';
      if (snapshot.entries.length !== 2 || snapshot.pending.length !== 2
        || !snapshot.pending.includes(recordId) || !snapshot.pending.includes(loginId))
        throw new Error('autres actions locales présentes');
      const localLogin = snapshot.entries.find(item => item && item.id === loginId)?.row;
      if (!localLogin || localLogin.id !== loginId || localLogin.caserne !== 'CIS05'
        || localLogin.type !== 'login' || localLogin.deleted !== false
        || !equal(localLogin.data, entry)) throw new Error('trace locale différente');
      stage = 'lecture de la trace serveur';
      const existing = await remoteRow(loginId, token);
      const decision = existing && !sameLoginRow(localLogin, existing)
        ? loginConflictDecision(localLogin.data, existing) : '';
      if (existing && !sameLoginRow(localLogin, existing) && !decision)
        throw new Error('trace serveur différente ou chronologie incertaine');
      if (decision === 'local') {
        if (!existing.updated_at) throw new Error('version serveur absente');
        stage = 'actualisation ciblée de la trace';
        const response = await request(base + '/rest/v1/records?id=eq.' + encodeURIComponent(loginId)
          + '&updated_at=eq.' + encodeURIComponent(existing.updated_at)
          + '&select=id', {
          method: 'PATCH', headers: { apikey: apiKey, Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ data: localLogin.data, updated_by: login })
        });
        const rows = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(rows) || rows.length !== 1 || rows[0].id !== loginId)
          throw new Error('mise à jour non confirmée');
      }
      if (!existing) {
        stage = 'transmission de la trace';
        const response = await request(base + '/rest/v1/records', {
          method: 'POST', headers: { apikey: apiKey, Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ id: loginId, caserne: 'CIS05', type: 'login',
            data: localLogin.data, deleted: false, updated_by: login })
        });
        if (!response.ok) throw new Error('trace non enregistrée');
      }
      stage = 'vérification de la trace';
      const confirmed = await remoteRow(loginId, token);
      if (decision === 'remote') {
        if (!confirmed || confirmed.updated_at !== existing.updated_at
          || !equal(confirmed.data, existing.data) || confirmed.deleted !== false)
          throw new Error('la trace serveur a changé');
      } else if (!sameLoginRow(localLogin, confirmed)) throw new Error('accusé de réception absent');
      stage = 'libération locale';
      await clearVerifiedLocalQueue(snapshot, loginId);
      result.textContent = 'Trace de connexion vérifiée sur le serveur ; la déconnexion la plus récente est conservée. Les deux indicateurs locaux correspondants ont été libérés. Ferme cette page, puis reconnecte-toi dans AGAI sur l’ordinateur. Aucune fiche d’intervention n’a été modifiée.';
    } catch (error) {
      const detail = String(error && error.message || 'contrôle indisponible').slice(0,100);
      result.textContent = 'Reprise non terminée à l’étape « ' + stage + ' » : ' + detail
        + '. Ne supprime aucune donnée ; transmets ce message. Aucune fiche d’intervention n’a été modifiée.';
    } finally {
      passwordField.value = '';
      button.disabled = false;
    }
  });
})();

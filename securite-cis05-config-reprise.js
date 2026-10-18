(() => {
  'use strict';
  const recordId = 'CIS05__config__main';
  const expectedLogin = 'dumoulin.sebastien';
  const pendingKey = 'agai_rc_pending_dirty';
  const cacheKey = 'agai_jb_cache';
  const config = window.AGAI_CONFIG || {};
  const base = String(config.supabaseUrl || '').replace(/\/$/, '');
  const apiKey = String(config.supabasePublishableKey || '');
  const form = document.getElementById('check-form');
  const checkButton = document.getElementById('check-button');
  const recoveryButton = document.getElementById('recovery-button');
  const confirmArea = document.getElementById('confirm-area');
  const noEdit = document.getElementById('no-edit');
  const loginField = document.getElementById('login');
  const passwordField = document.getElementById('password');
  const result = document.getElementById('result');
  let prepared = null;

  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const ordered = {};
      Object.keys(value).sort().forEach(key => {
        if (value[key] !== undefined) ordered[key] = canonical(value[key]);
      });
      return ordered;
    }
    return value;
  };
  const signature = value => JSON.stringify(canonical(value));
  const equal = (left, right) => signature(left) === signature(right);
  const fail = message => {
    prepared = null;
    confirmArea.hidden = true;
    noEdit.checked = false;
    recoveryButton.disabled = true;
    result.textContent = message + '\nAucune intervention ni configuration serveur modifiée. Conservez les données de ce navigateur.';
  };
  const request = async (url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try { return await fetch(url, {...options, signal: controller.signal, cache: 'no-store'}); }
    finally { clearTimeout(timer); }
  };
  const openDb = async (name, backup) => {
    if (!window.indexedDB || typeof indexedDB.databases !== 'function') throw new Error('stockage local non lisible');
    if (!backup && !(await indexedDB.databases()).some(item => item.name === name)) throw new Error('file durable absente');
    return new Promise((resolve, reject) => {
      const opened = indexedDB.open(name, 1);
      opened.onupgradeneeded = () => {
        if (backup) opened.result.createObjectStore('records', {keyPath:'id'});
        else opened.transaction.abort();
      };
      opened.onsuccess = () => {
        if (!opened.result.objectStoreNames.contains('records')) {
          opened.result.close(); reject(new Error('stockage incomplet')); return;
        }
        resolve(opened.result);
      };
      opened.onerror = () => reject(opened.error || new Error('stockage non lisible'));
      opened.onblocked = () => reject(new Error('stockage occupé par un autre onglet'));
    });
  };
  const readStore = (db, key) => new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const read = tx.objectStore('records').get(key);
    read.onsuccess = () => resolve(read.result || null);
    read.onerror = () => reject(read.error || new Error('lecture interrompue'));
    tx.onabort = () => reject(tx.error || new Error('lecture interrompue'));
  });
  const readLocal = async () => {
    const db = await openDb('agai-sync-outbox', false);
    let entry;
    try { entry = await readStore(db, recordId); }
    finally { db.close(); }
    if (!entry || entry.id !== recordId || entry.row?.id !== recordId
      || entry.row?.caserne !== 'CIS05' || entry.row?.type !== 'config'
      || entry.row?.deleted !== false || !entry.row?.data
      || typeof entry.row.data !== 'object' || Array.isArray(entry.row.data)) {
      throw new Error('configuration locale absente ou incomplète');
    }
    const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    if (!Array.isArray(pending) || !pending.includes(recordId)
      || pending.some(id => id !== recordId && !String(id).includes('__login__'))) {
      throw new Error('état local différent du contrôle initial');
    }
    return {entry, pending, cache:localStorage.getItem(cacheKey)};
  };
  const authenticate = async (login, password) => {
    if (login !== expectedLogin) throw new Error('ce contrôle est réservé au compte concerné');
    const signed = await request(base + '/functions/v1/agai-account-link', {
      method:'POST', headers:{apikey:apiKey, 'Content-Type':'application/json'},
      body:JSON.stringify({mode:'login', login, password})
    });
    const identity = await signed.json().catch(() => ({}));
    if (!signed.ok || identity.personnelEnforcementEnabled !== true
      || identity.login !== login || identity.caserneId !== 'CIS05'
      || identity.profile?.login !== login || identity.profile?.caserneId !== 'CIS05'
      || !identity.session?.access_token) throw new Error('identité CIS05 non confirmée');
    const headers = {apikey:apiKey, Authorization:'Bearer ' + identity.session.access_token};
    const checked = await request(base + '/functions/v1/agai-account-link', {
      method:'POST', headers:{...headers, 'Content-Type':'application/json'},
      body:JSON.stringify({mode:'account_status'})
    });
    const status = await checked.json().catch(() => ({}));
    if (!checked.ok || status.canLogin !== true || status.login !== login
      || status.caserneId !== 'CIS05') throw new Error('compte CIS05 non confirmé');
    return headers;
  };
  const readRemote = async headers => {
    const response = await request(base + '/rest/v1/records?id=eq.' + encodeURIComponent(recordId)
      + '&select=id,caserne,type,data,deleted,updated_at&limit=1', {method:'GET', headers});
    const rows = await response.json().catch(() => null);
    const row = response.ok && Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!row || row.id !== recordId || row.caserne !== 'CIS05' || row.type !== 'config'
      || row.deleted !== false || !row.data || typeof row.data !== 'object') {
      throw new Error('configuration serveur inaccessible ou incomplète');
    }
    return row;
  };
  const saveBackup = async value => {
    const db = await openDb('agai-sync-recovery-backups', true);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put(value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('sauvegarde impossible'));
        tx.onabort = () => reject(tx.error || new Error('sauvegarde interrompue'));
      });
      const saved = await readStore(db, value.id);
      if (!equal(saved, value)) throw new Error('sauvegarde non vérifiée');
    } finally { db.close(); }
  };
  const deleteUnchangedLocal = async expected => {
    const db = await openDb('agai-sync-outbox', false);
    try {
      return await new Promise(resolve => {
        let tx;
        try {
          tx = db.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          const read = store.get(recordId);
          read.onsuccess = () => {
            if (!equal(read.result, expected)) { tx.abort(); return; }
            store.delete(recordId);
          };
          read.onerror = () => tx.abort();
          tx.oncomplete = () => resolve(true);
          tx.onabort = () => resolve(false);
          tx.onerror = () => resolve(false);
        } catch (_) { try { tx?.abort(); } catch (_) {} resolve(false); }
      });
    } finally { db.close(); }
  };
  const restorePendingMarker = () => {
    const ids = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    if (!Array.isArray(ids)) throw new Error('indicateur local illisible');
    if (!ids.includes(recordId)) ids.push(recordId);
    localStorage.setItem(pendingKey, JSON.stringify(ids));
  };
  const removeAuxiliaryMarker = key => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        delete value[recordId]; localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (_) { /* Le marqueur principal et la file durable ont déjà été vérifiés. */ }
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    prepared = null; confirmArea.hidden = true; noEdit.checked = false; recoveryButton.disabled = true;
    if (!base || !apiKey) { fail('Configuration du contrôle indisponible.'); return; }
    checkButton.disabled = true;
    result.textContent = 'Vérification locale et serveur en cours…';
    try {
      const login = loginField.value.trim().toLowerCase();
      const local = await readLocal();
      const headers = await authenticate(login, passwordField.value);
      const remote = await readRemote(headers);
      if (equal(local.entry.row.data, remote.data)) {
        fail('Les copies sont maintenant identiques. Retournez dans AGAI : sa reprise automatique peut confirmer cette ligne.');
        return;
      }
      prepared = {login, local, remote};
      result.textContent = 'Copies CIS05 différentes, comme lors du contrôle précédent.\n'
        + 'Une sauvegarde locale vérifiée sera créée avant de libérer uniquement la configuration en attente.\n'
        + 'Aucun réglage local ne sera envoyé au serveur. Ressaisissez le mot de passe pour confirmer.';
      confirmArea.hidden = false;
    } catch (error) {
      fail('Contrôle interrompu : ' + String(error?.message || 'erreur inconnue') + '.');
    } finally { passwordField.value = ''; checkButton.disabled = false; }
  });
  noEdit.addEventListener('change', () => { recoveryButton.disabled = !noEdit.checked || !prepared; });
  recoveryButton.addEventListener('click', async () => {
    if (!prepared || !noEdit.checked || loginField.value.trim().toLowerCase() !== prepared.login) return;
    if (!passwordField.value) { result.textContent = 'Ressaisissez votre mot de passe AGAI avant la confirmation.'; return; }
    recoveryButton.disabled = true; checkButton.disabled = true;
    result.textContent = 'Nouvelle vérification et sauvegarde locale en cours…';
    try {
      const snapshot = prepared;
      const local = await readLocal();
      if (!equal(local, snapshot.local)) throw new Error('la copie locale a changé ; recommencez le contrôle');
      const headers = await authenticate(snapshot.login, passwordField.value);
      const remote = await readRemote(headers);
      if (!equal(remote, snapshot.remote)) throw new Error('la copie serveur a changé ; recommencez le contrôle');
      const backup = {
        id:recordId + '__' + crypto.randomUUID(), createdAt:new Date().toISOString(),
        entry:local.entry, cache:local.cache, pending:local.pending,
        pendingSince:localStorage.getItem('agai_rc_pending_since'),
        deferred:localStorage.getItem('agai_rc_deferred_dirty'),
        serverUpdatedAt:remote.updated_at || null
      };
      await saveBackup(backup);
      // Retirer d'abord le marqueur : si l'opération s'interrompt avant la
      // suppression conditionnelle, la ligne durable rebloquera la connexion.
      const current = await readLocal();
      if (!equal(current, snapshot.local)) throw new Error('la copie locale a changé avant la libération');
      const remaining = current.pending.filter(id => id !== recordId);
      localStorage.setItem(pendingKey, JSON.stringify(remaining));
      let removed = false;
      try { removed = await deleteUnchangedLocal(snapshot.local.entry); }
      catch (_) { restorePendingMarker(); throw new Error('suppression conditionnelle indisponible'); }
      if (!removed) {
        restorePendingMarker();
        throw new Error('la file locale a changé ; la reprise a été arrêtée');
      }
      const db = await openDb('agai-sync-outbox', false);
      let stillPresent;
      try { stillPresent = await readStore(db, recordId); }
      finally { db.close(); }
      const savedPending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
      if (stillPresent || !Array.isArray(savedPending) || savedPending.includes(recordId)) {
        throw new Error('libération non confirmée ; la sauvegarde locale est conservée');
      }
      removeAuxiliaryMarker('agai_rc_pending_since');
      removeAuxiliaryMarker('agai_rc_deferred_dirty');
      prepared = null; confirmArea.hidden = true;
      result.textContent = 'Configuration CIS05 sauvegardée et libérée sur ce téléphone.\n'
        + 'La trace de connexion et les interventions n’ont pas été touchées.\n'
        + 'Fermez cette page, ouvrez AGAI dans le même navigateur et connectez-vous une seule fois. Vérifiez ensuite « Sync OK ». Ne videz pas les données de Chrome.';
    } catch (error) {
      fail('Reprise non terminée : ' + String(error?.message || 'erreur inconnue') + '.');
    } finally { passwordField.value = ''; checkButton.disabled = false; }
  });
})();

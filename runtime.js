/* Hello GiDA – standalone runtime: stores everything on this device (localStorage) */
(function () {
  var PREFIX = 'gida:', listeners = {};
  function load(col) { try { return JSON.parse(localStorage.getItem(PREFIX + col) || '{}'); } catch (e) { return {}; } }
  function save(col, obj) { localStorage.setItem(PREFIX + col, JSON.stringify(obj)); notify(col); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function notify(col) { (listeners[col] || []).forEach(function (fn) { setTimeout(fn, 0); }); }
  function listen(col, fn) { (listeners[col] = listeners[col] || []).push(fn); setTimeout(fn, 0); return function () { listeners[col] = listeners[col].filter(function (f) { return f !== fn; }); }; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function docSnap(col, id) { var all = load(col), d = all[id]; return { id: id, exists: d !== undefined, data: function () { return clone(d); } }; }
  function docRef(col, id) {
    return {
      id: id,
      get: function () { return Promise.resolve(docSnap(col, id)); },
      set: function (data) { var all = load(col); all[id] = clone(data); save(col, all); return Promise.resolve(); },
      update: function (data) { var all = load(col); all[id] = Object.assign({}, all[id] || {}, clone(data)); save(col, all); return Promise.resolve(); },
      delete: function () { var all = load(col); delete all[id]; save(col, all); return Promise.resolve(); },
      onSnapshot: function (cb) { return listen(col, function () { cb(docSnap(col, id)); }); }
    };
  }
  function colRef(col) {
    return {
      doc: function (id) { return docRef(col, id || newId()); },
      add: function (data) { var id = newId(), r = docRef(col, id); return r.set(data).then(function () { return r; }); },
      onSnapshot: function (cb) {
        return listen(col, function () { var all = load(col); cb({ docs: Object.keys(all).map(function (k) { return docSnap(col, k); }) }); });
      }
    };
  }
  function splitDoc(path) { var i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; }
  var db = { collection: colRef, doc: function (path) { var p = splitDoc(path); return docRef(p[0], p[1]); } };
  var downloads = {
    save: function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: o.type || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); return Promise.resolve();
    }
  };
  window.claude = {
    use: function (name) {
      if (name === 'db') return Promise.resolve(db);
      if (name === 'user') return Promise.resolve({ id: function () { return Promise.resolve('local'); } });
      if (name === 'downloads') return Promise.resolve(downloads);
      return Promise.reject(Object.assign(new Error('not available'), { code: 'unavailable' }));
    }
  };

  /* ---- backup / restore ---- */
  window.gidaBackup = function () {
    var out = { app: 'hello-gida', version: 1, exportedAt: new Date().toISOString(), data: {} };
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(PREFIX) === 0) out.data[k.slice(PREFIX.length)] = load(k.slice(PREFIX.length)); }
    var d = new Date(), name = 'gida-backup-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
    return downloads.save({ filename: name, data: JSON.stringify(out, null, 1), type: 'application/json' });
  };
  window.gidaRestore = function (file) {
    return file.text().then(function (txt) {
      var j = JSON.parse(txt); if (!j || j.app !== 'hello-gida' || !j.data) throw new Error('bad file');
      Object.keys(localStorage).filter(function (k) { return k.indexOf(PREFIX) === 0; }).forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(j.data).forEach(function (col) { localStorage.setItem(PREFIX + col, JSON.stringify(j.data[col])); });
      return Object.keys(j.data).length;
    });
  };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})();

/* ==========================================================
   cloud.js — 云端共享（Supabase）
   设计原则：本地永远是第一份，云端是「合并后同步」的第二份
   - 文字数据（设置/时间轴/纪念日/清单/日记/问答）→ 整份 JSON 文档
   - 照片二进制 → Supabase Storage，文档里只存路径
   - 合并策略：按条 id + ut(更新时间) 取新，删除用 tomb 墓碑
   ========================================================== */
(function () {
  'use strict';

  var U = window.Utils, S = window.STORE;
  if (!U || !S) return;

  var LIST_KEYS = ['events', 'anniv', 'wishes', 'diary', 'answers'];
  var LOCAL_ONLY = ['theme', 'cloud', 'pin'];   // 每台设备各管各的，不参与同步
  var BUCKET = 'photos';
  var PULL_MS = 15000;

  var syncing = false, dirty = false, pushTimer = null, pollTimer = null, lastErr = '';

  /* ---------------- 配置 ---------------- */
  function settings() { return S.settings(); }
  function cfg() {
    var c = settings().cloud || {};
    return {
      url: String(c.url || '').replace(/\/+$/, ''),
      key: String(c.key || ''),
      space: String(c.space || '')
    };
  }
  function on() { var c = cfg(); return !!(c.url && c.key && c.space); }

  /* ---------------- HTTP ---------------- */
  function api(path, opts) {
    var c = cfg();
    opts = opts || {};
    var headers = Object.assign({
      apikey: c.key,
      Authorization: 'Bearer ' + c.key
    }, opts.headers || {});
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, 25000);
    return fetch(c.url + path, Object.assign({}, opts, { headers: headers, signal: ctl.signal }))
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            var msg = 'HTTP ' + res.status;
            try { var j = JSON.parse(txt); msg += ' · ' + (j.message || j.error || txt); }
            catch (e) { if (txt) msg += ' · ' + txt.slice(0, 160); }
            throw new Error(msg);
          }, function () { throw new Error('HTTP ' + res.status); });
        }
        var ct = res.headers.get('content-type') || '';
        return ct.indexOf('json') >= 0 ? res.json() : res.text();
      })
      .finally(function () { clearTimeout(t); });
  }

  function pullDoc() {
    var c = cfg();
    return api('/rest/v1/spaces?id=eq.' + encodeURIComponent(c.space) + '&select=doc,updated_at')
      .then(function (rows) { return (rows && rows[0]) || null; });
  }

  function pushDoc(doc) {
    var c = cfg();
    return api('/rest/v1/spaces?on_conflict=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ id: c.space, doc: doc, updated_at: new Date().toISOString() }])
    });
  }

  function publicURL(path) {
    var c = cfg();
    if (!path || !c.url) return '';
    return c.url + '/storage/v1/object/public/' + BUCKET + '/' +
      String(path).split('/').map(encodeURIComponent).join('/');
  }

  function uploadObject(blob, id, kind) {
    var c = cfg();
    var path = c.space + '/' + id + '_' + kind + '.jpg';
    return api('/storage/v1/object/' + BUCKET + '/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
      body: blob
    }).then(function () { return path; });
  }

  function removeObject(path) {
    var c = cfg();
    if (!path) return Promise.resolve();
    return api('/storage/v1/object/' + BUCKET + '/' + path, { method: 'DELETE' })
      .catch(function (e) { console.warn('[cloud] 删除云端文件失败', path, e.message); });
  }

  /* ---------------- 本地文档 ---------------- */
  async function buildLocal() {
    var st = Object.assign({}, settings());
    var doc = { v: 1, settings: st, tomb: S.getList('tomb') };
    LIST_KEYS.forEach(function (k) { doc[k] = S.getList(k); });
    var photos = await S.photoList();
    doc.photos = photos.map(function (p) {
      var o = Object.assign({}, p);
      delete o.full; delete o.thumb; delete o.fullUrl; delete o.thumbUrl;
      return o;
    });
    delete doc.settings.cloud;
    delete doc.settings.pin;
    delete doc.settings.theme;
    return doc;
  }

  function tombMapOf() {
    var m = {};
    S.getList('tomb').forEach(function (t) { if (t && t.id) m[t.id] = t.ut || 0; });
    return m;
  }
  function addTomb(id) {
    var m = tombMapOf();
    m[id] = Date.now();
    var arr = Object.keys(m).map(function (k) { return { id: k, ut: m[k] }; });
    arr.sort(function (a, b) { return a.ut - b.ut; });
    S.setList('tomb', arr.slice(-800));
  }

  /* ---------------- 合并 ---------------- */
  function mergeItems(local, remote, tomb) {
    local = local || []; remote = remote || [];
    var best = {};
    local.concat(remote).forEach(function (it) {
      if (!it || !it.id) return;
      var t = it.ut || it.createdAt || 0;
      var cur = best[it.id];
      if (!cur || t > (cur.ut || cur.createdAt || 0)) best[it.id] = it;
    });
    var seen = {}, out = [];
    local.concat(remote).forEach(function (it) {
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = 1;
      var item = best[it.id];
      var t = item.ut || item.createdAt || 0;
      if (tomb[item.id] && tomb[item.id] > t) return;
      out.push(item);
    });
    return out;
  }

  function merge(local, remote) {
    remote = remote || {};
    var lm = tombMapOf(), rm = {};
    (remote.tomb || []).forEach(function (t) { if (t && t.id) rm[t.id] = t.ut || 0; });
    var tomb = {};
    Object.keys(lm).forEach(function (k) { tomb[k] = Math.max(lm[k], rm[k] || 0); });
    Object.keys(rm).forEach(function (k) { if (!(k in tomb)) tomb[k] = rm[k]; });

    var doc = { v: 1, tomb: Object.keys(tomb).map(function (k) { return { id: k, ut: tomb[k] }; }) };
    doc.tomb.sort(function (a, b) { return a.ut - b.ut; });
    doc.tomb = doc.tomb.slice(-800);

    LIST_KEYS.forEach(function (k) { doc[k] = mergeItems(local[k], remote[k], tomb); });
    doc.photos = mergeItems(local.photos, remote.photos, tomb);

    var a = local.settings || {}, b = remote.settings || {};
    doc.settings = ((b.ut || 0) > (a.ut || 0)) ? Object.assign({}, a, b) : a;
    return doc;
  }

  function sig(doc) {
    if (!doc) return '';
    var parts = ['s' + ((doc.settings && doc.settings.ut) || 0)];
    LIST_KEYS.concat(['photos']).forEach(function (k) {
      parts.push(k + ':' + (doc[k] || []).map(function (it) { return it.id + '@' + (it.ut || it.createdAt || 0); }).join(','));
    });
    parts.push('t' + (doc.tomb || []).map(function (t) { return t.id + '@' + t.ut; }).join(','));
    return parts.join('|');
  }

  var ORIG = null;
  function captureOriginals() {
    if (ORIG) return;
    ORIG = {
      saveSettings: S.saveSettings,
      setList: S.setList,
      push: S.push, updateIn: S.updateIn, removeIn: S.removeIn,
      photoAdd: S.photoAdd, photoUpdate: S.photoUpdate, photoDelete: S.photoDelete,
      photoURL: S.photoURL
    };
  }

  /* 把合并结果写回本地（不动 cloud/pin/theme） */
  async function applyLocal(doc) {
    captureOriginals();
    var cur = settings();
    var next = Object.assign({}, doc.settings || {});
    LOCAL_ONLY.forEach(function (k) { if (cur[k] !== undefined) next[k] = cur[k]; });
    ORIG.saveSettings.call(S, next);

    LIST_KEYS.forEach(function (k) { ORIG.setList.call(S, k, doc[k] || []); });
    ORIG.setList.call(S, 'tomb', doc.tomb || []);

    if (S.replacePhotoMeta) await S.replacePhotoMeta(doc.photos || []);

    if (window.APP && APP.refreshAll) APP.refreshAll();
  }

  /* ---------------- 同步主流程 ---------------- */
  function setStatus(msg, bad) {
    var el = document.getElementById('clStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
  }

  function stamp() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  async function doSync(opt) {
    opt = opt || {};
    if (!on()) { setStatus('未启用云端。填好上面三项、两人填同一个共享码即可同步。'); return false; }
    if (syncing) { dirty = true; return false; }
    syncing = true; dirty = false;
    setStatus('正在同步…');
    try {
      var remote = await pullDoc();
      try { await uploadMissing(); } catch (e) { console.warn('[cloud] 补传照片出错', e); }
      var local = await buildLocal();
      var merged = merge(local, remote && remote.doc);
      var remoteSig = sig(remote && remote.doc), mergedSig = sig(merged);
      if (remoteSig !== mergedSig) await pushDoc(merged);
      if (mergedSig !== sig(local)) {
        await applyLocal(merged);
        if (opt.silent !== true) console.log('[cloud] 已从云端更新内容');
      }
      lastErr = '';
      setStatus('✅ 已连接 · 上次同步 ' + stamp() + ' · 共享码「' + cfg().space + '」');
      return true;
    } catch (e) {
      lastErr = e.message || String(e);
      var hint = '';
      if (/relation .*spaces.* does not exist|Could not find the table/i.test(lastErr)) hint = '（数据库表还没建，请先执行 README 里的 SQL）';
      else if (/Bucket not found/i.test(lastErr)) hint = '（存储桶 photos 还没建）';
      else if (/Invalid API key|JWT/i.test(lastErr)) hint = '（anon key 不对，注意别用 service_role）';
      setStatus('❌ 同步失败：' + lastErr + hint, true);
      return false;
    } finally {
      syncing = false;
      if (dirty) schedulePush(600);
    }
  }

  function schedulePush(delay) {
    if (!on()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { doSync({ silent: true }); }, delay || 1200);
  }
  function markDirty() { schedulePush(); }

  function startPoll() {
    stopPoll();
    if (!on()) return;
    pollTimer = setInterval(function () { doSync({ silent: true }); }, PULL_MS);
  }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  /* ---------------- 拦截写入，自动打时间戳 + 触发同步 ---------------- */
  function wrap() {
    captureOriginals();
    var ST = S;
    if (ST.__cloudWrapped) return;
    ST.__cloudWrapped = true;

    ST.saveSettings = function (patch) {
      var p = Object.assign({}, patch);
      if (on()) p.ut = Date.now();
      var r = ORIG.saveSettings.call(ST, p);
      if (on()) markDirty();
      return r;
    };

    ST.push = function (k, item) {
      if (on() && LIST_KEYS.indexOf(k) >= 0 && item) item.ut = Date.now();
      var r = ORIG.push.apply(ST, arguments);
      if (on() && LIST_KEYS.indexOf(k) >= 0) markDirty();
      return r;
    };

    ST.updateIn = function (k, id, patch) {
      var p = patch;
      if (on() && LIST_KEYS.indexOf(k) >= 0) p = Object.assign({}, patch, { ut: Date.now() });
      var r = ORIG.updateIn.call(ST, k, id, p);
      if (on() && LIST_KEYS.indexOf(k) >= 0 && r) markDirty();
      return r;
    };

    ST.removeIn = function (k, id) {
      var r = ORIG.removeIn.call(ST, k, id);
      if (on() && LIST_KEYS.indexOf(k) >= 0 && r) { addTomb(id); markDirty(); }
      return r;
    };

    ST.photoAdd = async function (rec) {
      if (!on()) return ORIG.photoAdd.apply(ST, arguments);
      var r = Object.assign({}, rec, { ut: Date.now() });
      try {
        var fullBlob = r.full || (r.fullUrl ? await U.dataURLToBlob(r.fullUrl) : null);
        var thumbBlob = r.thumb || (r.thumbUrl ? await U.dataURLToBlob(r.thumbUrl) : null);
        if (fullBlob) r.fullPath = await uploadObject(fullBlob, r.id, 'full');
        if (thumbBlob) r.thumbPath = await uploadObject(thumbBlob, r.id, 'thumb');
      } catch (e) {
        console.warn('[cloud] 照片上传失败，先存本地', e);
        if (window.APP && APP.toast) APP.toast('照片已存本地，云端上传失败：' + e.message);
      }
      var id = await ORIG.photoAdd.call(ST, r);
      if (on()) markDirty();
      return id;
    };

    ST.photoUpdate = async function (id, patch) {
      if (on()) patch = Object.assign({}, patch, { ut: Date.now() });
      var r = await ORIG.photoUpdate.call(ST, id, patch);
      if (on()) markDirty();
      return r;
    };

    ST.photoDelete = async function (id) {
      var rec = await (ST.photoGet ? ST.photoGet(id) : Promise.resolve(null));
      if (on()) addTomb(id);
      var r = await ORIG.photoDelete.call(ST, id);
      if (on() && rec) {
        if (rec.fullPath) removeObject(rec.fullPath);
        if (rec.thumbPath) removeObject(rec.thumbPath);
        markDirty();
      }
      return r;
    };

    /* 本地没有二进制（别人传的照片）时，回落到云端公网 URL */
    ST.photoURL = async function (id, kind) {
      kind = kind || 'thumb';
      var u = await ORIG.photoURL.apply(ST, arguments);
      if (u) return u;
      var rec = await ST.photoGet(id).catch(function () { return null; });
      if (rec && rec[kind + 'Path']) return publicURL(rec[kind + 'Path']);
      return '';
    };
  }

  /* 把本地独有、还没上云的照片补传上去 */
  async function uploadMissing() {
    var list = await S.photoList();
    var todo = list.filter(function (p) { return !p.fullPath || !p.thumbPath; });
    if (!todo.length) return 0;
    var done = 0;
    for (var i = 0; i < todo.length; i++) {
      var p = todo[i];
      setStatus('正在上传照片 ' + (i + 1) + '/' + todo.length + ' …');
      try {
        var rec = await S.photoGet(p.id);
        var fullBlob = (rec && rec.full) || (rec && rec.fullUrl ? await U.dataURLToBlob(rec.fullUrl) : null);
        var thumbBlob = (rec && rec.thumb) || (rec && rec.thumbUrl ? await U.dataURLToBlob(rec.thumbUrl) : null);
        var patch = { ut: Date.now() };
        if (fullBlob && !p.fullPath) patch.fullPath = await uploadObject(fullBlob, p.id, 'full');
        if (thumbBlob && !p.thumbPath) patch.thumbPath = await uploadObject(thumbBlob, p.id, 'thumb');
        await ORIG.photoUpdate.call(S, p.id, patch);
        done++;
      } catch (e) {
        console.warn('[cloud] 补传失败', p.id, e.message);
      }
    }
    return done;
  }

  /* ---------------- 设置页 UI ---------------- */
  function randomSpace() {
    var s = 'our-';
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  function paintInputs() {
    var c = cfg();
    var a = document.getElementById('clUrl');
    var b = document.getElementById('clKey');
    var d = document.getElementById('clSpace');
    if (a) a.value = c.url;
    if (b) b.value = c.key;
    if (d) d.value = c.space;
  }

  function setupUI() {
    var card = document.getElementById('cloudCard');
    if (!card) return;
    paintInputs();

    var gen = document.getElementById('clGen');
    if (gen) gen.addEventListener('click', function () {
      document.getElementById('clSpace').value = randomSpace();
      APP.toast('共享码已生成，抄给 TA 就行');
    });

    var save = document.getElementById('clSave');
    if (save) save.addEventListener('click', async function () {
      var url = document.getElementById('clUrl').value.trim().replace(/\/+$/, '');
      var key = document.getElementById('clKey').value.trim();
      var space = document.getElementById('clSpace').value.trim() || randomSpace();
      if (!/^https?:\/\//.test(url)) return APP.toast('项目 URL 要以 https:// 开头');
      if (key.length < 40) return APP.toast('anon key 看起来不对（很长的一串 eyJ…）');
      document.getElementById('clSpace').value = space;
      APP.setSettings({ cloud: { url: url, key: key, space: space } });
      setStatus('正在连接…');
      save.disabled = true;
      try {
        await doSync({ silent: false });
        var n = await uploadMissing();
        await doSync({ silent: true });
        startPoll();
        if (n) APP.toast('已上传 ' + n + ' 张照片到云端');
        else APP.toast('云端已连接');
      } catch (e) {
        setStatus('❌ ' + e.message, true);
      } finally { save.disabled = false; }
    });

    var now = document.getElementById('clNow');
    if (now) now.addEventListener('click', async function () {
      if (!on()) return APP.toast('还没填云端信息');
      now.disabled = true;
      var ok = await doSync({ silent: false });
      now.disabled = false;
      APP.toast(ok ? '同步完成' : '同步失败，看下面提示');
    });

    var off = document.getElementById('clOff');
    if (off) off.addEventListener('click', function () {
      APP.confirm('断开云端？',
        '只是不再同步，本地数据和云端已有的数据都不会删除。重新填回同样的共享码就能接上。',
        function () {
          stopPoll();
          APP.setSettings({ cloud: {} });
          paintInputs();
          setStatus('已断开云端，当前为纯本地模式。');
          APP.toast('已断开云端');
        }, '断开');
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && on()) doSync({ silent: true });
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    wrap();
    setupUI();
    if (!on()) { setStatus('未启用云端。填好上面三项，和 TA 用同一个共享码，就能看到同一份内容。'); return; }
    paintInputs();
    setStatus('正在连接云端…');
    setTimeout(function () { doSync({ silent: true }); startPoll(); }, 600);
  }

  window.CLOUD = {
    on: on,
    cfg: cfg,
    sync: doSync,
    pull: pullDoc,
    push: function () { return buildLocal().then(pushDoc); },
    publicURL: publicURL,
    uploadMissing: uploadMissing,
    buildLocal: buildLocal,
    startPoll: startPoll,
    stopPoll: stopPoll,
    randomSpace: randomSpace,
    status: function () { return lastErr || 'ok'; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
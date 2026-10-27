/* ==========================================================
   store.js — 存储层 + 日期工具 + 图片处理
   照片 → IndexedDB（不可用时回退 localStorage）
   其它 → localStorage
   ========================================================== */
(function (global) {
  'use strict';

  /* ---------------- 小工具 ---------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  /* 简易哈希（仅防窥，不是加密） */
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36);
  }

  /* ---------------- 日期 ---------------- */
  var DAY = 86400000;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (!v) return new Date(NaN);
    var s = String(v).trim();
    // 'YYYY-MM-DD' 按本地时间解析，避免 UTC 偏移导致差一天
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      var hh = 0, mm = 0;
      var t = s.match(/[ T](\d{2}):(\d{2})/);
      if (t) { hh = +t[1]; mm = +t[2]; }
      return new Date(+m[1], +m[2] - 1, +m[3], hh, mm, 0, 0);
    }
    return new Date(s);
  }

  function startOfDay(d) { var x = toDate(d); x.setHours(0, 0, 0, 0); return x; }

  /** 自然日差（b - a），忽略时分秒 */
  function dayDiff(a, b) {
    var A = startOfDay(a), B = startOfDay(b);
    return Math.round((B - A) / DAY);
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isoOf(d) {
    d = toDate(d);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDate(v) {
    var d = toDate(v);
    if (isNaN(d)) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtShort(v) {
    var d = toDate(v);
    if (isNaN(d)) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function fmtDot(v) {
    var d = toDate(v);
    if (isNaN(d)) return '';
    return pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function weekday(v) {
    var w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return w[toDate(v).getDay()];
  }
  /** 相位：从 since 起算的时长对象 */
  function duration(since) {
    var start = toDate(since), now = new Date();
    var ms = now - start;
    if (ms < 0) ms = 0;
    var totalDays = dayDiff(start, now);
    var h = Math.floor(ms / 3600000) % 24;
    var m = Math.floor(ms / 60000) % 60;
    var s = Math.floor(ms / 1000) % 60;
    var years = 0, probe = new Date(start.getTime());
    while (true) {
      var nx = new Date(probe.getTime());
      nx.setFullYear(nx.getFullYear() + 1);
      if (nx <= now) { years++; probe = nx; } else break;
    }
    return { totalDays: totalDays, h: h, m: m, s: s, years: years, ms: ms };
  }

  /** 构造日期，日号超出当月天数时夹到最后一天（2/29 在平年 → 2/28，31 号在小月 → 当月最后一天） */
  function makeClamped(y, m, day) {
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  }

  /** 下一次发生日期 */
  function nextOccurrence(dateStr, type) {
    var base = toDate(dateStr);
    if (isNaN(base)) return null;
    var now = startOfDay(new Date());
    var b = startOfDay(base);

    if (type === 'once') return b < now ? null : b;

    if (type === 'monthly') {
      var cand = makeClamped(now.getFullYear(), now.getMonth(), b.getDate());
      if (cand < now) cand = makeClamped(now.getFullYear(), now.getMonth() + 1, b.getDate());
      return cand;
    }
    // yearly（默认）
    var c = makeClamped(now.getFullYear(), b.getMonth(), b.getDate());
    if (c < now) c = makeClamped(now.getFullYear() + 1, b.getMonth(), b.getDate());
    return c;
  }

  /** 从 since 起算的第 n 天对应的日期 */
  function dateOfDayN(since, n) {
    var d = startOfDay(since);
    d.setDate(d.getDate() + n - 1);
    return d;
  }

  function relativeDays(n) {
    if (n === 0) return '就是今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    return n + ' 天后';
  }

  /* ---------------- 图片压缩 ---------------- */
  function loadBitmap(file) {
    if (global.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return loadViaImage(file); });
    }
    return loadViaImage(file);
  }
  function loadViaImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('图片读取失败')); };
      img.src = url;
    });
  }
  function drawTo(src, maxSide) {
    var w = src.width, h = src.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return { canvas: c, w: tw, h: th };
  }
  function canvasToBlob(canvas, quality) {
    return new Promise(function (res, rej) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { b ? res(b) : rej(new Error('编码失败')); }, 'image/jpeg', quality);
      } else {
        rej(new Error('浏览器不支持 toBlob'));
      }
    });
  }

  /**
   * 处理一张图片：返回 { full: Blob, thumb: Blob, w, h }
   * 原图长边 ≤1600（JPEG .85），缩略图长边 ≤480（JPEG .78）
   */
  async function processImage(file, opt) {
    opt = opt || {};
    var maxFull = opt.maxFull || 1600;
    var maxThumb = opt.maxThumb || 480;
    var src = await loadBitmap(file);
    var full = drawTo(src, maxFull);
    var thumb = drawTo(src, maxThumb);
    var fullBlob = await canvasToBlob(full.canvas, opt.quality || 0.85);
    var thumbBlob = await canvasToBlob(thumb.canvas, 0.78);
    if (src.close) { try { src.close(); } catch (e) {} }
    return { full: fullBlob, thumb: thumbBlob, w: full.w, h: full.h };
  }

  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(dataURL) {
    var parts = String(dataURL).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]);
    var len = bin.length;
    var buf = new Uint8Array(len);
    for (var i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }

  /* ---------------- localStorage 封装 ---------------- */
  var LS_PREFIX = 'ourmemory.';
  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn('localStorage 写入失败', e);
      return false;
    }
  }
  function lsDel(key) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch (e) {}
  }

  /* ---------------- IndexedDB ---------------- */
  var DB_NAME = 'ourmemory';
  var DB_VER = 1;
  var STORE = 'photos';

  function openDB() {
    return new Promise(function (res, rej) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; rej(new Error('IndexedDB 打开超时')); }
      }, 2600);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { clearTimeout(timer); return rej(e); }
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () {
        if (done) return;
        done = true; clearTimeout(timer); res(req.result);
      };
      req.onerror = function () {
        if (done) return;
        done = true; clearTimeout(timer); rej(req.error || new Error('IndexedDB 打开失败'));
      };
      req.onblocked = function () {
        if (done) return;
        done = true; clearTimeout(timer); rej(new Error('IndexedDB 被占用'));
      };
    });
  }

  function idbTx(db, mode, fn) {
    return new Promise(function (res, rej) {
      var tx, store;
      try {
        tx = db.transaction(STORE, mode);
        store = tx.objectStore(STORE);
      } catch (e) { return rej(e); }
      var out;
      try { out = fn(store); } catch (e) { return rej(e); }
      tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error || new Error('事务中止')); };
    });
  }

  /* ---------------- Store 主体 ---------------- */
  var S = {
    backend: 'ls',       // 'idb' | 'ls'
    db: null,
    ready: false,
    urlCache: new Map(), // id -> { thumb, full }

    /* ---- 初始化 ---- */
    async init() {
      try {
        S.db = await openDB();
        S.backend = 'idb';
      } catch (e) {
        console.warn('[store] IndexedDB 不可用，回退到 localStorage：', e && e.message);
        S.backend = 'ls';
      }
      S.ready = true;
      return S.backend;
    },

    /* ---- 设置 ---- */
    settings() {
      var d = lsGet('settings', null);
      var base = {
        relation: 'lover',
        theme: 'cream',
        me: { name: '', avatar: '' },
        ta: { name: '', avatar: '' },
        title: '',
        cover: '',
        since: isoToday(),
        sinceTime: '00:00',
        pin: '',
        createdAt: Date.now()
      };
      if (!d) return base;
      return Object.assign(base, d, {
        me: Object.assign({ name: '', avatar: '' }, d.me || {}),
        ta: Object.assign({ name: '', avatar: '' }, d.ta || {})
      });
    },
    saveSettings(patch) {
      var cur = S.settings();
      var next = Object.assign({}, cur, patch || {});
      lsSet('settings', next);
      return next;
    },

    /* ---- 通用集合（localStorage） ---- */
    getList(key) { var v = lsGet(key, []); return Array.isArray(v) ? v : []; },
    setList(key, arr) { return lsSet(key, arr); },
    push(key, item) {
      var arr = S.getList(key);
      arr.unshift(item);
      S.setList(key, arr);
      return item;
    },
    updateIn(key, id, patch) {
      var arr = S.getList(key);
      var i = arr.findIndex(function (x) { return x.id === id; });
      if (i < 0) return null;
      arr[i] = Object.assign({}, arr[i], patch);
      S.setList(key, arr);
      return arr[i];
    },
    removeIn(key, id) {
      var arr = S.getList(key);
      var n = arr.length;
      arr = arr.filter(function (x) { return x.id !== id; });
      S.setList(key, arr);
      return arr.length !== n;
    },

    /* ---- 照片 ---- */
    async photoList() {
      if (S.backend === 'idb') {
        if (!S.db) return [];
        var all = await idbTx(S.db, 'readonly', function (st) { return st.getAll(); });
        return (all || []).map(function (r) {
          var o = Object.assign({}, r);
          delete o.full; delete o.thumb;
          return o;
        });
      }
      return S.getList('photos');
    },

    async photoAdd(rec) {
      // rec: {id,title,note,date,place,tags,fav,w,h,full,thumb,createdAt}
      if (S.backend === 'idb') {
        if (!S.db) throw new Error('数据库不可用');
        await idbTx(S.db, 'readwrite', function (st) { st.put(rec); });
        return rec.id;
      }
      // 回退：把图片转成 dataURL 存 localStorage
      var fullUrl = await blobToDataURL(rec.full);
      var thumbUrl = await blobToDataURL(rec.thumb);
      var meta = Object.assign({}, rec, { fullUrl: fullUrl, thumbUrl: thumbUrl });
      delete meta.full; delete meta.thumb;
      var arr = S.getList('photos');
      arr.unshift(meta);
      if (!lsSet('photos', arr)) throw new Error('本地空间不足，请改用本地服务器打开或减少照片');
      return rec.id;
    },

    async photoUpdate(id, patch) {
      if (S.backend === 'idb') {
        if (!S.db) return null;
        var rec = await idbTx(S.db, 'readonly', function (st) { return st.get(id); });
        if (!rec) return null;
        var next = Object.assign({}, rec, patch);
        await idbTx(S.db, 'readwrite', function (st) { st.put(next); });
        return next;
      }
      return S.updateIn('photos', id, patch);
    },

    async photoGet(id) {
      if (S.backend === 'idb') {
        if (!S.db) return null;
        return await idbTx(S.db, 'readonly', function (st) { return st.get(id); });
      }
      return S.getList('photos').find(function (x) { return x.id === id; }) || null;
    },

    async photoDelete(id) {
      S.revokeURL(id);
      if (S.backend === 'idb') {
        if (!S.db) return;
        await idbTx(S.db, 'readwrite', function (st) { st.delete(id); });
        return;
      }
      S.removeIn('photos', id);
    },

    async photoClear() {
      S.urlCache.forEach(function (v, k) { S.revokeURL(k); });
      S.urlCache.clear();
      if (S.backend === 'idb') {
        if (!S.db) return;
        await idbTx(S.db, 'readwrite', function (st) { st.clear(); });
        return;
      }
      lsDel('photos');
    },

    /** 云端合并用：用远端元数据覆盖本地照片列表，但保留本地已有的二进制缓存 */
    async replacePhotoMeta(list) {
      list = Array.isArray(list) ? list : [];
      S.urlCache.forEach(function (v, k) { S.revokeURL(k); });
      S.urlCache.clear();
      var keep = {};
      list.forEach(function (m) { keep[m.id] = 1; });
      if (S.backend === 'idb') {
        if (!S.db) return;
        var cur = await idbTx(S.db, 'readonly', function (st) { return st.getAll(); }) || [];
        var byId = {};
        cur.forEach(function (r) { byId[r.id] = r; });
        await idbTx(S.db, 'readwrite', function (st) {
          cur.forEach(function (r) { if (!keep[r.id]) st.delete(r.id); });
          list.forEach(function (m) {
            var old = byId[m.id];
            if (old) {
              var next = Object.assign({}, old, m);
              if (old.full) next.full = old.full;
              if (old.thumb) next.thumb = old.thumb;
              st.put(next);
            } else {
              st.put(Object.assign({}, m));
            }
          });
        });
        return;
      }
      var cm = {};
      S.getList('photos').forEach(function (r) { cm[r.id] = r; });
      S.setList('photos', list.map(function (m) {
        var old = cm[m.id];
        return old ? Object.assign({}, old, m) : Object.assign({}, m);
      }));
    },

    /** 取可显示的 URL（带缓存） */
    async photoURL(id, kind) {
      kind = kind || 'thumb';
      var cached = S.urlCache.get(id);
      if (cached && cached[kind]) return cached[kind];
      var rec = await S.photoGet(id);
      if (!rec) return '';
      var entry = cached || {};
      if (S.backend === 'idb') {
        if (rec[kind]) entry[kind] = URL.createObjectURL(rec[kind]);
        else if (rec.thumb) entry[kind] = URL.createObjectURL(rec.thumb);
        else entry[kind] = '';
      } else {
        entry[kind] = kind === 'full' ? (rec.fullUrl || rec.thumbUrl) : (rec.thumbUrl || rec.fullUrl);
        entry[kind] = entry[kind] || '';
      }
      S.urlCache.set(id, entry);
      return entry[kind] || '';
    },
    revokeURL(id) {
      var e = S.urlCache.get(id);
      if (!e) return;
      ['thumb', 'full'].forEach(function (k) {
        if (e[k] && e[k].indexOf('blob:') === 0) URL.revokeObjectURL(e[k]);
      });
      S.urlCache.delete(id);
    },

    /* ---- 全量导出 / 导入 ---- */
    async exportAll() {
      var photos = await S.photoList();
      var out = {
        app: 'ourmemory',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: S.settings(),
        events: S.getList('events'),
        anniv: S.getList('anniv'),
        wishes: S.getList('wishes'),
        diary: S.getList('diary'),
        answers: S.getList('answers'),
        photos: []
      };
      for (var i = 0; i < photos.length; i++) {
        var p = photos[i];
        var rec = await S.photoGet(p.id);
        if (!rec) continue;
        var item = Object.assign({}, p);
        if (S.backend === 'idb') {
          item.full = rec.full ? await blobToDataURL(rec.full) : '';
          item.thumb = rec.thumb ? await blobToDataURL(rec.thumb) : '';
        } else {
          item.full = rec.fullUrl || '';
          item.thumb = rec.thumbUrl || '';
        }
        out.photos.push(item);
      }
      return out;
    },

    async importAll(data) {
      if (!data || data.app !== 'ourmemory') throw new Error('这不是本应用的备份文件');
      await S.photoClear();
      lsSet('settings', data.settings || {});
      lsSet('events', data.events || []);
      lsSet('anniv', data.anniv || []);
      lsSet('wishes', data.wishes || []);
      lsSet('diary', data.diary || []);
      lsSet('answers', data.answers || []);

      var ok = 0;
      for (var i = 0; i < (data.photos || []).length; i++) {
        var p = data.photos[i];
        try {
          var rec = {
            id: p.id || uid(),
            title: p.title || '', note: p.note || '',
            date: p.date || isoToday(), place: p.place || '',
            tags: p.tags || [], fav: !!p.fav,
            w: p.w || 0, h: p.h || 0,
            createdAt: p.createdAt || Date.now()
          };
          if (S.backend === 'idb') {
            rec.full = p.full ? dataURLToBlob(p.full) : null;
            rec.thumb = p.thumb ? dataURLToBlob(p.thumb) : null;
            if (!rec.full) continue;
            await idbTx(S.db, 'readwrite', function (st) { st.put(rec); });
          } else {
            rec.fullUrl = p.full || p.thumb || '';
            rec.thumbUrl = p.thumb || p.full || '';
            if (!rec.fullUrl) continue;
            var arr = S.getList('photos');
            arr.unshift(rec);
            lsSet('photos', arr);
          }
          ok++;
        } catch (e) { console.warn('导入照片失败', e); }
      }
      return ok;
    },

    async wipe() {
      await S.photoClear();
      ['settings', 'events', 'anniv', 'wishes', 'diary', 'answers', 'photos'].forEach(lsDel);
    },

    /** 估算占用 */
    async usage() {
      if (global.navigator && navigator.storage && navigator.storage.estimate) {
        try {
          var e = await navigator.storage.estimate();
          return { used: e.usage || 0, quota: e.quota || 0 };
        } catch (err) {}
      }
      return null;
    }
  };

  /* ---------------- 对外接口 ---------------- */
  global.STORE = S;
  global.Utils = {
    uid: uid, esc: esc, clamp: clamp, hash: hash, debounce: debounce,
    toDate: toDate, startOfDay: startOfDay, dayDiff: dayDiff,
    isoToday: isoToday, isoOf: isoOf, pad: pad,
    fmtDate: fmtDate, fmtShort: fmtShort, fmtDot: fmtDot, weekday: weekday,
    duration: duration, nextOccurrence: nextOccurrence, dateOfDayN: dateOfDayN,
    relativeDays: relativeDays,
    processImage: processImage, blobToDataURL: blobToDataURL, dataURLToBlob: dataURLToBlob,
    canvasToBlob: canvasToBlob, drawTo: drawTo, loadBitmap: loadBitmap
  };
  global.CONST = { WISH_CAP: 400 };
})(window);
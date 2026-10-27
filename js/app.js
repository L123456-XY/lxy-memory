/* ==========================================================
   app.js — 核心：启动 / 路由 / 首页 / 相册 / 设置 / 弹层
   ========================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;
  var STORE = global.STORE;
  var CONTENT = global.CONTENT;
  var esc = U.esc;

  /* ================= 全局状态 ================= */
  var S = STORE.settings();
  var currentView = 'home';
  var renderers = {};
  var isReady = false;

  var VIEW_META = {
    home: { title: '首页', sub: '' },
    album: { title: '相册', sub: '照片只存在你的设备里' },
    timeline: { title: '时光轴', sub: '那些值得被记住的时刻' },
    anniv: { title: '纪念日', sub: '不许忘，也不会忘' },
    wishes: { title: '一起做的事', sub: '一件一件，慢慢来' },
    diary: { title: '日记', sub: '替未来的你们记得' },
    ask: { title: '每日一问', sub: '一天一题，一年就是一本采访录' },
    stats: { title: '统计', sub: '用数字看看我们一起走了多远' },
    settings: { title: '设置', sub: '你的数据，只有你知道' }
  };

  /* ================= 基础工具 ================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var debounce = U.debounce;

  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }

  /* ---------- 弹层 ---------- */
  var openModals = [];
  function modal(opts) {
    var root = $('#modalRoot');
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    var footHtml = (opts.foot || []).map(function (b, i) {
      return '<button class="' + (b.cls || 'btn-ghost-solid') + '" data-foot="' + i + '">' + esc(b.label) + '</button>';
    }).join('');
    wrap.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true">' +
        '<h3>' + esc(opts.title || '') + '</h3>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +
      '</div>';
    var card = wrap.firstChild;

    function close() {
      wrap.remove();
      openModals = openModals.filter(function (m) { return m !== close; });
    }
    openModals.push(close);

    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    $$('[data-foot]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var b = opts.foot[+btn.dataset.foot];
        if (b && b.onClick) {
          var keep = b.onClick(card, close);
          if (keep !== false) close();
        } else close();
      });
    });
    root.appendChild(wrap);
    if (opts.onMount) opts.onMount(card, close);
    var focusable = wrap.querySelector('input,textarea,select');
    if (focusable) setTimeout(function () { focusable.focus(); }, 60);
    return { el: wrap, card: card, close: close };
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (openModals.length) { openModals[openModals.length - 1](); return; }
    if (!$('#lightbox').hidden) closeLightbox();
  });

  /* ---------- 关系文案 ---------- */
  function rel() { return CONTENT.RELATION_TEXT[S.relation] || CONTENT.RELATION_TEXT.lover; }

  function personName(which) {
    var p = which === 'me' ? S.me : S.ta;
    if (p && p.name) return p.name;
    return which === 'me' ? '我' : (S.relation === 'lover' ? '你' : 'TA');
  }

  function pairTitle() {
    var a = personName('me'), b = personName('ta');
    if (S.title) return S.title;
    return a + ' & ' + b;
  }

  /* ================= 主题 / 外观 ================= */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || 'cream';
    $$('#themeDots .dot').forEach(function (d) {
      d.classList.toggle('on', d.dataset.themeSet === theme);
    });
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', theme === 'night' ? 'dark' : 'light dark');
  }

  function applyIdentity() {
    var r = rel();
    document.documentElement.dataset.relation = S.relation;
    $('#brandTitle').textContent = S.title || r.headerDefault;
    $('#brandSub').textContent = r.subDefault;
    $('#brandMark').textContent = r.brandIcon;

    // 头像
    setAvatarEl($('#avatarA'), S.me.avatar, 'me');
    setAvatarEl($('#avatarB'), S.ta.avatar, 'ta');
    setAvatarEl($('#setMeAvatar'), S.me.avatar, 'me');
    setAvatarEl($('#setTaAvatar'), S.ta.avatar, 'ta');

    // 封面
    var bg = $('#heroBg');
    if (S.cover) { bg.style.backgroundImage = 'url("' + S.cover + '")'; bg.classList.add('has-image'); }
    else { bg.style.backgroundImage = ''; bg.classList.remove('has-image'); }

    $('#heroLabel').textContent = r.label;
    $('#diaryText').placeholder = r.diaryPlaceholder;
    $('#wishHeadTitle').textContent = r.wishTitle;
    $('#wishHeadSub').textContent = r.wishSub;

    // 设置表单回填
    $('#setRelation').value = S.relation;
    $('#setSince').value = S.since || '';
    $('#setMeName').value = S.me.name || '';
    $('#setTaName').value = S.ta.name || '';
    $('#setTitle').value = S.title || '';
    $('#setTheme').value = S.theme;
    $('#setPin').value = '';
    $('#setPin').placeholder = S.pin ? '已设置密码，输入新密码可修改' : '纯本地防窥，不是加密';

    updateChrome();
  }

  function setAvatarEl(el, url, which) {
    if (!el) return;
    if (url) {
      el.style.backgroundImage = 'url("' + url + '")';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = which ? (which === 'me' ? '♡' : rel().heart) : '♡';
    }
  }

  function updateChrome() {
    var meta = VIEW_META[currentView] || VIEW_META.home;
    var r = rel();
    var title = meta.title, sub = meta.sub;
    if (currentView === 'album') title = r.photos;
    if (currentView === 'timeline') title = r.timeline;
    if (currentView === 'wishes') title = r.wishTitle;
    if (currentView === 'home') {
      title = S.title || r.heroTitle;
      var d = U.duration(S.since);
      sub = r.sinceLabel + ' ' + d.totalDays + ' 天' + (d.years ? ' · 第 ' + (d.years + 1) + ' 年' : '');
    }
    $('#viewTitle').textContent = title;
    $('#viewSub').textContent = sub || '';
    document.title = (S.title || r.heroTitle) + ' · ' + r.sinceLabel + ' ' + U.duration(S.since).totalDays + ' 天';
  }

  /* ================= 路由 ================= */
  function go(view, silent) {
    if (!renderers[view]) view = 'home';
    currentView = view;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + view; });
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    updateChrome();
    if (renderers[view]) renderers[view]();
    if (!silent) {
      try { history.replaceState(null, '', '#' + view); } catch (e) {}
      $('#main').scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ================= 首页 ================= */
  var tickTimer = null;

  function renderHome() {
    var r = rel();
    var d = U.duration(S.since);
    $('#heroDays').textContent = d.totalDays;
    $('#heroLabel').textContent = r.label;
    $('#heroSince').textContent = '自 ' + U.fmtDate(S.since) + ' 起 · ' + U.weekday(S.since);
    paintClock();

    // 胶囊
    var chips = [];
    var next = upcomingAnchors()[0];
    if (next) {
      chips.push('<div class="chip"><span class="chip-label">' + esc(next.name) + '</span><b>' +
        (next.days === 0 ? '今天' : next.days) + '</b>' + (next.days === 0 ? '' : '<span class="chip-label">天后</span>') + '</div>');
    }
    var wl = STORE.getList('wishes');
    var doneN = wl.filter(function (w) { return w.done; }).length;
    if (wl.length) {
      chips.push('<div class="chip"><span class="chip-label">清单</span><b>' + doneN + '</b><span class="chip-label">/ ' + wl.length + ' 件</span></div>');
    }
    var photosN = homePhotoCount;
    chips.push('<div class="chip"><span class="chip-label">相册</span><b>' + photosN + '</b><span class="chip-label">张</span></div>');
    var diaryN = STORE.getList('diary').length;
    if (diaryN) chips.push('<div class="chip"><span class="chip-label">日记</span><b>' + diaryN + '</b><span class="chip-label">篇</span></div>');
    $('#heroChips').innerHTML = chips.join('');

    renderOnThisDay();
    renderQuote();

    // 小统计
    var evN = STORE.getList('events').length;
    var stats = [
      { n: d.totalDays, l: r.sinceLabel + '的天数' },
      { n: photosN, l: '照片' },
      { n: evN, l: '里程碑' },
      { n: diaryN, l: '日记' }
    ];
    $('#miniStats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="stat-num">' + s.n + '</div><div class="stat-label">' + esc(s.l) + '</div></div>';
    }).join('');
  }

  function paintClock() {
    var d = U.duration(S.since);
    var el = $('#heroClock');
    if (!el) return;
    el.textContent = U.pad(d.h) + ' : ' + U.pad(d.m) + ' : ' + U.pad(d.s);
    var daysEl = $('#heroDays');
    if (daysEl && daysEl.textContent !== String(d.totalDays)) {
      daysEl.textContent = d.totalDays;
      updateChrome();
      if (renderers.home && S.since) { /* 天数变化时刷新胶囊 */ }
    }
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (currentView === 'home') paintClock();
    }, 1000);
  }

  /** 自动里程碑 + 自定义纪念日，按剩余天数升序 */
  function upcomingAnchors() {
    var out = [];
    var since = U.toDate(S.since);
    var today = U.startOfDay(new Date());
    var defs = [
      { n: 100, name: '第 100 天' }, { n: 200, name: '第 200 天' },
      { n: 365, name: '相识一周年' }, { n: 520, name: '第 520 天' },
      { n: 730, name: '两周年' }, { n: 1000, name: '第 1000 天' },
      { n: 1314, name: '第 1314 天' }, { n: 1825, name: '三周年' },
      { n: 2000, name: '第 2000 天' }, { n: 2555, name: '七周年' },
      { n: 3650, name: '十周年' }
    ];
    defs.forEach(function (def) {
      var d = U.dateOfDayN(since, def.n);
      var diff = U.dayDiff(today, d);
      if (diff >= 0) out.push({ name: def.name, date: d, days: diff, kind: 'auto' });
    });
    STORE.getList('anniv').forEach(function (a) {
      var nx = U.nextOccurrence(a.date, a.type || 'yearly');
      if (!nx) return;
      out.push({ name: (a.emoji ? a.emoji + ' ' : '') + a.name, date: nx, days: U.dayDiff(today, nx), kind: 'custom', id: a.id });
    });
    out.sort(function (a, b) { return a.days - b.days; });
    return out;
  }

  var homePhotoCount = 0;
  var quoteIdx = -1;

  function renderQuote() {
    var arr = CONTENT.QUOTES[S.relation] || CONTENT.QUOTES.lover;
    if (quoteIdx < 0) quoteIdx = Math.floor(Math.random() * arr.length);
    $('#quoteText').textContent = arr[quoteIdx % arr.length];
  }

  function renderOnThisDay() {
    var now = new Date();
    var md = U.pad(now.getMonth() + 1) + '-' + U.pad(now.getDate());
    var box = $('#onThisDay');
    var tag = $('#otdTag');
    var found = [];

    STORE.photoList().then(function (list) {
      list.forEach(function (p) {
        if (!p.date) return;
        var d = U.toDate(p.date);
        if (isNaN(d)) return;
        if (d.getFullYear() === now.getFullYear()) return;
        if (U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) === md) {
          found.push({ kind: 'photo', id: p.id, title: p.title || '一张照片', date: p.date, years: now.getFullYear() - d.getFullYear() });
        }
      });
      STORE.getList('diary').forEach(function (e) {
        var d = U.toDate(e.date);
        if (isNaN(d) || d.getFullYear() === now.getFullYear()) return;
        if (U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) === md) {
          found.push({ kind: 'diary', title: (e.text || '').slice(0, 40) || '一篇日记', date: e.date, years: now.getFullYear() - d.getFullYear(), mood: e.mood });
        }
      });
      STORE.getList('events').forEach(function (e) {
        var d = U.toDate(e.date);
        if (isNaN(d) || d.getFullYear() === now.getFullYear()) return;
        if (U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) === md) {
          found.push({ kind: 'event', title: e.title, date: e.date, years: now.getFullYear() - d.getFullYear(), emoji: e.emoji });
        }
      });

      found.sort(function (a, b) { return U.toDate(a.date) - U.toDate(b.date); });
      tag.textContent = found.length ? found.length + ' 条旧回忆' : '空空如也';
      if (!found.length) {
        box.innerHTML = '<p class="otd-none">往年的今天还没有留下痕迹。<br>今天写一句话，明年的今天就会有人替你记得。</p>';
        return;
      }
      box.innerHTML = '<div class="otd-list">' + found.slice(0, 4).map(function (f) {
        var thumb = f.kind === 'photo'
          ? '<div class="otd-thumb" data-otd-photo="' + f.id + '"></div>'
          : '<div class="otd-thumb" style="display:grid;place-items:center;font-size:19px">' + (f.mood || f.emoji || '📝') + '</div>';
        return '<div class="otd-item">' + thumb + '<div class="otd-body">' +
          '<div class="otd-t">' + esc(f.title) + '</div>' +
          '<div class="otd-s">' + f.years + ' 年前的今天 · ' + U.fmtShort(f.date) + '</div>' +
          '</div></div>';
      }).join('') + '</div>';

      // 缩略图
      $$('[data-otd-photo]', box).forEach(function (el) {
        STORE.photoURL(el.dataset.otdPhoto, 'thumb').then(function (url) {
          if (url) el.style.backgroundImage = 'url("' + url + '")';
        });
      });
    });
  }

  /* ================= 相册 ================= */
  var album = { filter: 'all', sort: 'desc', shown: 0, items: [], gen: 0 };
  var PAGE = 24;

  function renderAlbum(reset) {
    if (reset !== false) { album.shown = 0; album.gen++; }
    STORE.photoList().then(function (list) {
      homePhotoCount = list.length;
      var items = list.slice();
      if (album.filter === 'fav') items = items.filter(function (p) { return p.fav; });
      items.sort(function (a, b) {
        var da = U.toDate(a.date || a.createdAt), db = U.toDate(b.date || b.createdAt);
        return album.sort === 'desc' ? db - da : da - db;
      });
      album.items = items;
      var favN = list.filter(function (p) { return p.fav; }).length;
      $('#albumCount').textContent = list.length ? ('共 ' + list.length + ' 张 · 收藏 ' + favN) : '';
      var grid = $('#albumGrid');
      grid.innerHTML = '';
      $('#albumEmpty').hidden = items.length > 0;
      album.shown = 0;
      loadMorePhotos();
    });
  }

  function loadMorePhotos() {
    var grid = $('#albumGrid');
    var gen = album.gen;
    var slice = album.items.slice(album.shown, album.shown + PAGE);
    if (!slice.length) return;
    album.shown += slice.length;

    slice.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'photo-card' + (p.fav ? ' is-fav' : '');
      card.dataset.id = p.id;
      card.tabIndex = 0;
      var ratio = (p.w && p.h) ? (p.w + '/' + p.h) : '4/3';
      card.style.aspectRatio = ratio;
      card.innerHTML =
        '<img alt="' + esc(p.title || '照片') + '" decoding="async">' +
        '<button class="photo-fav" data-fav="' + p.id + '" title="收藏">' + (p.fav ? '♥' : '♡') + '</button>' +
        (p.title || p.date ? '<span class="photo-meta">' + esc((p.title || '') + (p.title && p.date ? ' · ' : '') + (p.date ? U.fmtDot(p.date) : '')) + '</span>' : '');
      grid.appendChild(card);

      STORE.photoURL(p.id, 'thumb').then(function (url) {
        if (gen !== album.gen || !url) return;
        var img = card.querySelector('img');
        img.onload = function () { img.classList.add('loaded'); };
        img.src = url;
        if (img.complete) img.classList.add('loaded');
      });

      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-fav]')) return;
        openLightbox(p.id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') openLightbox(p.id);
      });
    });

    album.gen = gen;
  }

  // 无限滚动
  function setupSentinel() {
    var sent = $('#albumSentinel');
    if (!sent || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) loadMorePhotos();
      });
    }, { rootMargin: '600px 0px' });
    io.observe(sent);
  }

  /* ================= 上传 ================= */
  async function handleFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) {
      return f && /^image\//.test(f.type);
    });
    if (!list.length) { toast('没有可用的图片'); return; }

    var okN = 0, failN = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      toast('正在处理 ' + (i + 1) + ' / ' + list.length + ' …', 4000);
      try {
        var img = await U.processImage(f, { maxFull: 1600, maxThumb: 480 });
        var d = f.lastModified ? new Date(f.lastModified) : new Date();
        var rec = {
          id: U.uid(),
          title: '',
          note: '',
          date: U.isoOf(d) || U.isoToday(),
          place: '',
          tags: [],
          fav: false,
          w: img.w, h: img.h,
          full: img.full,
          thumb: img.thumb,
          createdAt: Date.now()
        };
        await STORE.photoAdd(rec);
        okN++;
      } catch (e) {
        console.warn('上传失败', f.name, e);
        failN++;
      }
    }
    toast(failN ? ('成功 ' + okN + ' 张，失败 ' + failN + ' 张') : ('已收好 ' + okN + ' 张照片'), 2600);
    renderAlbum();
    if (currentView === 'home') renderHome();
  }

  function setupDrop() {
    var hint = $('#dropHint');
    var depth = 0;
    window.addEventListener('dragenter', function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      depth++; hint.classList.add('on');
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('dragleave', function (e) {
      depth = Math.max(0, depth - 1);
      if (!depth) hint.classList.remove('on');
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      depth = 0; hint.classList.remove('on');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        go('album');
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  /* ================= 灯箱 ================= */
  var lb = { ids: [], idx: 0, urls: new Map() };

  function openLightbox(id, ids) {
    if (!ids || !ids.length) ids = album.items.map(function (p) { return p.id; });
    if (!ids || !ids.length) ids = [id];
    if (ids.indexOf(id) < 0) ids = ids.concat([id]);
    lb.ids = ids;
    lb.idx = Math.max(0, ids.indexOf(id));
    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    showLb();
  }

  function showLb() {
    var id = lb.ids[lb.idx];
    if (!id) return;
    var box = $('#lightbox');
    var img = $('#lbImg');
    img.style.opacity = '.4';
    STORE.photoGet(id).then(function (rec) {
      if (!rec) { closeLightbox(); return; }
      STORE.photoURL(id, 'full').then(function (url) {
        img.src = url || '';
        img.style.transition = 'none';
        requestAnimationFrame(function () { img.style.transition = ''; img.style.opacity = '1'; });
      });
      $('#lbTitle').textContent = rec.title || '未命名';
      var bits = [];
      if (rec.date) bits.push(U.fmtDate(rec.date));
      if (rec.place) bits.push('📍 ' + rec.place);
      if (rec.tags && rec.tags.length) bits.push(rec.tags.map(function (t) { return '#' + t; }).join(' '));
      $('#lbSub').textContent = bits.join(' · ') + (rec.note ? ' — ' + rec.note : '');
      $('#lbFav').classList.toggle('is-fav', !!rec.fav);
      $('#lbFav').textContent = rec.fav ? '♥' : '♡';
      var many = lb.ids.length > 1;
      $('#lbPrev').style.display = many ? '' : 'none';
      $('#lbNext').style.display = many ? '' : 'none';
      void box;
    });
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    document.body.style.overflow = '';
    $('#lbImg').src = '';
  }

  function lbStep(dir) {
    if (lb.ids.length < 2) return;
    lb.idx = (lb.idx + dir + lb.ids.length) % lb.ids.length;
    showLb();
  }

  function setupLightbox() {
    $('#lbClose').addEventListener('click', closeLightbox);
    $('#lbPrev').addEventListener('click', function () { lbStep(-1); });
    $('#lbNext').addEventListener('click', function () { lbStep(1); });
    $('#lightbox').addEventListener('click', function (e) {
      if (e.target.id === 'lightbox' || e.target.classList.contains('lb-stage')) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if ($('#lightbox').hidden) return;
      if (e.key === 'ArrowLeft') lbStep(-1);
      if (e.key === 'ArrowRight') lbStep(1);
    });

    // 触摸滑动
    var sx = 0, sy = 0;
    var stage = $('.lb-stage');
    stage.addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) lbStep(dx > 0 ? -1 : 1);
    }, { passive: true });

    $('#lbFav').addEventListener('click', async function () {
      var id = lb.ids[lb.idx];
      var rec = await STORE.photoGet(id);
      if (!rec) return;
      await STORE.photoUpdate(id, { fav: !rec.fav });
      showLb();
      renderAlbum();
      toast(rec.fav ? '已取消收藏' : '已收藏 ♥');
    });

    $('#lbEdit').addEventListener('click', function () {
      var id = lb.ids[lb.idx];
      editPhoto(id, function () { showLb(); renderAlbum(); });
    });

    $('#lbDel').addEventListener('click', function () {
      var id = lb.ids[lb.idx];
      comfirmModal('删除这张照片？', '删除后无法恢复（除非你有备份）。', async function () {
        await STORE.photoDelete(id);
        lb.ids = lb.ids.filter(function (x) { return x !== id; });
        if (!lb.ids.length) closeLightbox();
        else { lb.idx = Math.min(lb.idx, lb.ids.length - 1); showLb(); }
        renderAlbum();
        toast('已删除');
      });
    });
  }

  function editPhoto(id, done) {
    STORE.photoGet(id).then(function (rec) {
      if (!rec) return;
      modal({
        title: '编辑照片信息',
        body:
          field('标题', '<input class="input" name="title" value="' + esc(rec.title || '') + '" placeholder="给这张照片起个名字">') +
          field('日期', '<input type="date" class="input" name="date" value="' + esc(rec.date || '') + '">') +
          field('地点', '<input class="input" name="place" value="' + esc(rec.place || '') + '" placeholder="在哪里拍的">') +
          field('标签', '<input class="input" name="tags" value="' + esc((rec.tags || []).join(' ')) + '" placeholder="用空格分隔，例如 旅行 海边">') +
          field('备注', '<textarea class="textarea" name="note" rows="3" placeholder="当时发生了什么">' + esc(rec.note || '') + '</textarea>'),
        foot: [
          { label: '取消' },
          {
            label: '保存', cls: 'btn-primary', onClick: async function (card, close) {
              var get = function (n) { return card.querySelector('[name="' + n + '"]').value.trim(); };
              await STORE.photoUpdate(id, {
                title: get('title'), date: get('date'), place: get('place'),
                note: get('note'),
                tags: get('tags').split(/[\s,，]+/).filter(Boolean)
              });
              toast('已保存');
              if (done) done();
            }
          }
        ]
      });
    });
  }

  function field(label, control) {
    return '<label class="field"><span>' + esc(label) + '</span>' + control + '</label>';
  }

  function comfirmModal(title, text, onOk, okLabel) {
    modal({
      title: title,
      body: '<p class="note-text">' + esc(text) + '</p>',
      foot: [
        { label: '取消' },
        { label: okLabel || '确定删除', cls: 'btn-danger', onClick: function () { onOk(); } }
      ]
    });
  }

  /* ================= 设置 ================= */
  function setupSettings() {
    function save(patch, msg) {
      S = STORE.saveSettings(patch);
      applyIdentity();
      renderers.home && renderHome();
      if (msg) toast(msg);
    }

    $('#setRelation').addEventListener('change', function () {
      save({ relation: this.value }, '已切换');
      if (currentView !== 'settings') go(currentView, true);
      else go('home', true);
    });
    $('#setSince').addEventListener('change', function () {
      save({ since: this.value }, '日期已更新');
    });
    $('#setMeName').addEventListener('input', debounce(function () {
      save({ me: Object.assign({}, S.me, { name: this.value }) });
    }, 400));
    $('#setTaName').addEventListener('input', debounce(function () {
      save({ ta: Object.assign({}, S.ta, { name: this.value }) });
    }, 400));
    $('#setTitle').addEventListener('input', debounce(function () {
      save({ title: this.value });
    }, 400));
    $('#setTheme').addEventListener('change', function () {
      applyTheme(this.value);
      save({ theme: this.value });
    });

    // 主题圆点
    $$('#themeDots .dot').forEach(function (d) {
      d.addEventListener('click', function () {
        applyTheme(d.dataset.themeSet);
        S = STORE.saveSettings({ theme: d.dataset.themeSet });
        if ($('#setTheme')) $('#setTheme').value = d.dataset.themeSet;
      });
    });

    // 头像
    $$('[data-avatar]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickImage(function (dataUrl) {
          var which = btn.dataset.avatar;
          var patch = which === 'me' ? { me: Object.assign({}, S.me, { avatar: dataUrl }) }
                                    : { ta: Object.assign({}, S.ta, { avatar: dataUrl }) };
          save(patch, '头像已更新');
        }, 240);
      });
    });
    $$('[data-avatar-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var which = btn.dataset.avatarClear;
        var patch = which === 'me' ? { me: Object.assign({}, S.me, { avatar: '' }) }
                                  : { ta: Object.assign({}, S.ta, { avatar: '' }) };
        save(patch, '已清除');
      });
    });

    $$('[data-cover]').forEach(function (btn) {
      btn.addEventListener('click', function () { pickCover(); });
    });
    $$('[data-cover-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () { save({ cover: '' }, '已清除封面'); });
    });

    // PIN
    $('#savePin').addEventListener('click', function () {
      var v = $('#setPin').value.trim();
      if (!v) { save({ pin: '', pinLen: 0 }, '密码已关闭'); $('#setPin').value = ''; return; }
      if (!/^\d{4,8}$/.test(v)) { toast('请输入 4-8 位数字'); return; }
      save({ pin: U.hash(v), pinLen: v.length }, '密码已保存');
      $('#setPin').value = '';
      $('#setPin').placeholder = '已设置密码，输入新密码可修改';
    });

    // 数据
    $('#exportBtn').addEventListener('click', doExport);
    $('#importBtn').addEventListener('click', doImport);
    $('#resetBtn').addEventListener('click', function () {
      modal({
        title: '清空所有数据？',
        body: '<p class="note-text">照片、日记、里程碑、清单都会被删除，且无法撤销。<br>建议先导出一份备份。</p>',
        foot: [
          { label: '取消' },
          {
            label: '我已备份，清空', cls: 'btn-danger', onClick: async function () {
              await STORE.wipe();
              toast('已清空，正在重载…');
              setTimeout(function () { location.reload(); }, 700);
            }
          }
        ]
      });
    });
    $('#posterBtn').addEventListener('click', function () {
      if (global.POSTER) global.POSTER.open();
    });
    $('#demoBtn').addEventListener('click', seedDemo);

    refreshStorageInfo();
    return save;
  }

  function pickImage(cb, maxSide) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async function () {
      var f = input.files && input.files[0];
      if (!f) return;
      try {
        var img = await U.processImage(f, { maxFull: maxSide || 240, maxThumb: maxSide || 240, quality: 0.9 });
        cb(await U.blobToDataURL(img.full));
      } catch (e) { toast('图片处理失败'); }
    });
    input.click();
  }

  function pickCover() {
    STORE.photoList().then(function (list) {
      if (!list.length) { toast('相册还是空的，先上传几张照片吧'); return; }
      var body = '<p class="note-text" style="margin-bottom:12px">选一张照片做首页封面</p><div class="pick-grid">' +
        list.slice(0, 24).map(function (p) {
          return '<button class="pick-item" data-pick="' + p.id + '"><img alt=""></button>';
        }).join('') + '</div>';
      modal({
        title: '选择封面',
        body: body,
        onMount: function (card, close) {
          $$('[data-pick]', card).forEach(function (b) {
            STORE.photoURL(b.dataset.pick, 'thumb').then(function (url) {
              if (url) b.firstChild.src = url;
            });
            b.addEventListener('click', async function () {
              var rec = await STORE.photoGet(b.dataset.pick);
              if (!rec) return;
              var blob = (rec.full instanceof Blob) ? rec.full
                : U.dataURLToBlob(rec.fullUrl || rec.thumbUrl || '');
              var img = await U.processImage(blob, { maxFull: 1200, maxThumb: 1200, quality: 0.8 });
              var url = await U.blobToDataURL(img.full);
              S = STORE.saveSettings({ cover: url });
              applyIdentity();
              close();
              toast('封面已更新');
            });
          });
        }
      });
    });
  }

  async function doExport() {
    toast('正在打包，照片多时需要一点时间…', 6000);
    try {
      var data = await STORE.exportAll();
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      a.href = url;
      a.download = '回忆录备份-' + d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('备份已导出（' + data.photos.length + ' 张照片）');
    } catch (e) {
      console.error(e);
      toast('导出失败：' + e.message);
    }
  }

  function doImport() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var data;
        try { data = JSON.parse(fr.result); }
        catch (e) { toast('文件格式不对'); return; }
        modal({
          title: '导入备份？',
          body: '<p class="note-text">备份包含 <b>' + (data.photos || []).length + '</b> 张照片。导入会<strong>覆盖</strong>当前所有数据。</p>',
          foot: [
            { label: '取消' },
            {
              label: '覆盖导入', cls: 'btn-primary', onClick: async function () {
                toast('正在导入…', 8000);
                try {
                  var n = await STORE.importAll(data);
                  toast('导入完成（' + n + ' 张照片），即将重载');
                  setTimeout(function () { location.reload(); }, 900);
                } catch (e) { toast('导入失败：' + e.message); }
              }
            }
          ]
        });
      };
      fr.readAsText(f);
    });
    input.click();
  }

  async function refreshStorageInfo() {
    var el = $('#storageInfo');
    if (!el) return;
    var photos = await STORE.photoList();
    var u = await STORE.usage();
    var txt = '引擎：' + (STORE.backend === 'idb' ? 'IndexedDB（推荐，容量大）' : 'localStorage（备用，容量小）') +
      ' · 照片：' + photos.length + ' 张';
    if (u && u.quota) txt += ' · 已用 ' + fmtBytes(u.used) + ' / ' + fmtBytes(u.quota);
    el.textContent = txt;
  }
  function fmtBytes(n) {
    if (!n) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + ' ' + u[i];
  }

  /* 示例数据：纯色渐变卡片，方便先看效果 */
  async function seedDemo() {
    var exist = await STORE.photoList();
    if (exist.length) { toast('相册里已经有照片了，先清空再试'); return; }
    var pairs = [
      ['#F6DCE0', '#E7B39A', '第一次一起看的海'],
      ['#DCE7F6', '#B3C9E7', '下雨的那个下午'],
      ['#E9F6DC', '#C4E7B3', '山上的风很大'],
      ['#F6EFDC', '#E7D4B3', '你做的第一顿饭'],
      ['#EFDCF6', '#D4B3E7', '深夜的便利店'],
      ['#F6DCF0', '#E7B3D9', '一起过的第一个生日']
    ];
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var c = document.createElement('canvas');
      c.width = 900; c.height = 700;
      var ctx = c.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 900, 700);
      g.addColorStop(0, p[0]); g.addColorStop(1, p[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 900, 700);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = '600 42px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p[2], 450, 360);
      var blob = await U.canvasToBlob(c, 0.85);
      var thumb = await (async function () {
        var t = document.createElement('canvas');
        t.width = 480; t.height = 373;
        t.getContext('2d').drawImage(c, 0, 0, 480, 373);
        return U.canvasToBlob(t, 0.8);
      })();
      var d = new Date();
      d.setDate(d.getDate() - (i * 37 + 3));
      await STORE.photoAdd({
        id: U.uid(), title: p[2], note: '', date: U.isoOf(d), place: '',
        tags: [], fav: i < 2, w: 900, h: 700, full: blob, thumb: thumb, createdAt: Date.now() - i * 1000
      });
    }
    toast('示例照片已加入');
    renderAlbum();
    renderHome();
  }

  /* 快速记录 */
  function setupQuickAdd() {
    $('#quickAdd').addEventListener('click', function () {
      modal({
        title: '记录一点什么',
        body:
          '<div class="quick-list">' +
          '<button class="quick-item" data-q="photo"><span>📷</span><div><b>加照片</b><small>上传一张合影</small></div></button>' +
          '<button class="quick-item" data-q="event"><span>🌱</span><div><b>写里程碑</b><small>记下一个重要时刻</small></div></button>' +
          '<button class="quick-item" data-q="diary"><span>📖</span><div><b>写日记</b><small>今天的一句话</small></div></button>' +
          '<button class="quick-item" data-q="wish"><span>✅</span><div><b>加一件想做的事</b><small>共同清单 +1</small></div></button>' +
          '</div>',
        onMount: function (card, close) {
          $$('[data-q]', card).forEach(function (b) {
            b.addEventListener('click', function () {
              var q = b.dataset.q;
              close();
              if (q === 'photo') { go('album'); setTimeout(function () { $('#fileInput').click(); }, 200); }
              if (q === 'event') { go('timeline'); setTimeout(function () { global.APP.openEventModal && global.APP.openEventModal(); }, 220); }
              if (q === 'diary') { go('diary'); setTimeout(function () { $('#diaryText').focus(); }, 260); }
              if (q === 'wish') { go('wishes'); setTimeout(function () { global.APP.openWishModal && global.APP.openWishModal(); }, 220); }
            });
          });
        }
      });
    });
  }

  /* ================= 密码锁 ================= */
  function setupLock() {
    if (!S.pin) {
      $('#lockScreen').hidden = true;
      setTimeout(boot2, 0);
      return;
    }
    var wantLen = S.pinLen || 4;
    var buf = '';
    var lock = $('#lockScreen');
    lock.hidden = false;

    function paint() {
      var dots = '';
      for (var i = 0; i < wantLen; i++) dots += '<i class="' + (i < buf.length ? 'on' : '') + '"></i>';
      $('#lockDots').innerHTML = dots;
    }
    paint();

    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    $('#lockPad').innerHTML = keys.map(function (k) {
      if (k === 'del') return '<button class="pad-fn" data-k="del">删除</button>';
      if (k === 'ok') return '<button class="pad-fn" data-k="ok">进入</button>';
      return '<button data-k="' + k + '">' + k + '</button>';
    }).join('');

    function submit() {
      if (!buf.length) return;
      if (U.hash(buf) === S.pin) {
        lock.hidden = true;
        buf = '';
        paint();
        boot2();
      } else {
        $('#lockErr').textContent = '密码不对，再想想';
        lock.querySelector('.lock-card').classList.add('shake');
        setTimeout(function () {
          lock.querySelector('.lock-card').classList.remove('shake');
          buf = ''; paint(); $('#lockErr').textContent = '';
        }, 520);
      }
    }

    $('#lockPad').addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      if (!b) return;
      var k = b.dataset.k;
      if (k === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (k === 'ok') { submit(); return; }
      if (buf.length >= wantLen + 4) return;
      buf += k;
      paint();
      if (buf.length === wantLen) setTimeout(submit, 120);
    });

    document.addEventListener('keydown', function (e) {
      if (lock.hidden) return;
      if (/^\d$/.test(e.key)) { $('#lockPad [data-k="' + e.key + '"]').click(); }
      if (e.key === 'Backspace') { buf = buf.slice(0, -1); paint(); }
      if (e.key === 'Enter') submit();
    });
  }

  /* ================= 启动 ================= */
  async function boot() {
    await STORE.init();
    S = STORE.settings();
    if (!S.since) S = STORE.saveSettings({ since: U.isoToday() });
    // 首次访问给个默认起始日（昨天），让计时器不是全 0
    if (!localStorage.getItem('ourmemory.settings')) {
      var d = new Date(); d.setDate(d.getDate() - 1);
      S = STORE.saveSettings({ since: U.isoOf(d) });
    }
    applyTheme(S.theme);
    applyIdentity();
    setupLock();
  }

  function boot2() {
    if (isReady) return;
    isReady = true;

    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.view); });
    });
    $('#quoteRefresh').addEventListener('click', function () {
      quoteIdx = (quoteIdx + 1 + Math.floor(Math.random() * 3)) % (CONTENT.QUOTES[S.relation] || []).length;
      renderQuote();
    });
    $('#posterQuick').addEventListener('click', function () {
      if (global.POSTER) global.POSTER.open();
    });
    $('#uploadBtn').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function () {
      handleFiles(this.files);
      this.value = '';
    });
    $$('#albumFilter button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#albumFilter button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        album.filter = b.dataset.filter;
        renderAlbum();
      });
    });
    $('#albumSort').addEventListener('change', function () {
      album.sort = this.value;
      renderAlbum();
    });

    setupDrop();
    setupLightbox();
    setupQuickAdd();
    setupSentinel();
    setupSettings();

    startTick();
    var hash = (location.hash || '').replace('#', '');
    go(renderers[hash] ? hash : 'home', true);
    if (!renderers[hash]) go('home', true);
    renderHome();
    setTimeout(refreshStorageInfo, 400);
  }

  /* 对外 API */
  global.APP = {
    get settings() { return S; },
    setSettings: function (patch) { S = STORE.saveSettings(patch); applyIdentity(); return S; },
    rel: rel,
    personName: personName,
    pairTitle: pairTitle,
    go: go,
    toast: toast,
    modal: modal,
    field: field,
    confirm: comfirmModal,
    esc: esc,
    $: $, $$: $$,
    debounce: debounce,
    renderers: renderers,
    register: function (name, fn) { renderers[name] = fn; },
    openLightbox: openLightbox,
    editPhoto: editPhoto,
    handleFiles: handleFiles,
    saveSettings: function (patch) { S = STORE.saveSettings(patch); applyIdentity(); return S; },
    upcomingAnchors: upcomingAnchors,
    renderHome: renderHome,
    renderAlbum: renderAlbum,
    refreshHomeCount: function () { return STORE.photoList().then(function (l) { homePhotoCount = l.length; }); },
    applyTheme: applyTheme,
    applyIdentity: applyIdentity,
    pickImage: pickImage,
    refreshStorageInfo: refreshStorageInfo,
    fmtBytes: fmtBytes,
    refreshAll: function () {
      S = STORE.settings();
      applyTheme(S.theme);
      applyIdentity();
      updateChrome();
      var cur = currentView || 'home';
      if (renderers[cur]) renderers[cur]();
    },
    POSTER: null
  };
  renderers.home = renderHome;
  renderers.album = function () { renderAlbum(); };
  renderers.settings = function () { refreshStorageInfo(); };

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();

  // 供 more.js 在 boot2 之前注册渲染器
  global.APP._boot2 = boot2;
})(window);
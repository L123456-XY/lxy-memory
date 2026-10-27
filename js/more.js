/* ==========================================================
   more.js — 时光轴 / 纪念日 / 清单 / 日记 / 每日一问 / 统计 / 纪念卡
   ========================================================== */
(function (global) {
  'use strict';

  var U = global.Utils;
  var STORE = global.STORE;
  var CONTENT = global.CONTENT;
  var A = global.APP;
  var esc = U.esc;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function rel() { return A.rel(); }

  var EVENT_EMOJIS = ['🌱', '💞', '✈️', '🎂', '🏠', '🎓', '💍', '🐾', '🎬', '🍜', '✨', '🌊', '🎁', '🕯️', '🎡', '🌸'];
  var ANNIV_EMOJIS = ['🎂', '💞', '🎁', '🌸', '🏠', '💍', '🐾', '✈️', '🍰', '🕯️'];

  /* ==========================================================
     时光轴
     ========================================================== */
  function renderTimeline() {
    var list = STORE.getList('events').slice();
    list.sort(function (a, b) { return U.toDate(b.date) - U.toDate(a.date); });
    $('#eventCount').textContent = list.length ? list.length + ' 个时刻' : '';
    $('#timelineEmpty').hidden = list.length > 0;

    var wrap = $('#timelineList');
    wrap.innerHTML = list.map(function (e, i) {
      var n = U.dayDiff(A.settings.since, e.date) + 1;
      var dayBadge = (n > 0 && !isNaN(n)) ? '<span class="tl-days">第 ' + n + ' 天</span>' : '';
      return '<div class="tl-item" style="animation-delay:' + Math.min(i * 40, 400) + 'ms">' +
        '<div class="tl-date">' + U.fmtDate(e.date) + ' · ' + U.weekday(e.date) + '</div>' +
        '<div class="tl-card">' +
          '<div class="tl-emoji">' + esc(e.emoji || '🌱') + '</div>' +
          '<div class="tl-body">' +
            '<div class="tl-title">' + esc(e.title || '未命名') + dayBadge + '</div>' +
            (e.note ? '<div class="tl-note">' + esc(e.note) + '</div>' : '') +
          '</div>' +
          (e.photoId ? '<div class="tl-photo" data-tl-photo="' + esc(e.photoId) + '"></div>' : '') +
          '<div class="tl-tools">' +
            '<button class="mini-btn" data-edit="' + e.id + '">改</button>' +
            '<button class="mini-btn" data-del="' + e.id + '">删</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-tl-photo]', wrap).forEach(function (el) {
      STORE.photoURL(el.dataset.tlPhoto, 'thumb').then(function (url) {
        if (url) el.style.backgroundImage = 'url("' + url + '")';
      });
      el.addEventListener('click', function () {
        var ids = list.filter(function (x) { return x.photoId; }).map(function (x) { return x.photoId; });
        A.openLightbox(el.dataset.tlPhoto, ids);
      });
    });
    $$('[data-edit]', wrap).forEach(function (b) {
      b.addEventListener('click', function () { openEventModal(b.dataset.edit); });
    });
    $$('[data-del]', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        A.confirm('删除这个时刻？', '删除后无法恢复。', function () {
          STORE.removeIn('events', b.dataset.del);
          renderTimeline();
          A.renderHome();
          A.toast('已删除');
        });
      });
    });
  }

  function openEventModal(id) {
    var ev = id ? STORE.getList('events').find(function (x) { return x.id === id; }) : null;
    var emoji = (ev && ev.emoji) || '🌱';

    var body =
      '<div class="field"><span>图标</span><div class="emoji-row" id="evEmoji">' +
        EVENT_EMOJIS.map(function (e) {
          return '<button type="button" class="emoji-btn' + (e === emoji ? ' on' : '') + '" data-e="' + e + '">' + e + '</button>';
        }).join('') +
      '</div></div>' +
      A.field('标题', '<input class="input" name="title" maxlength="40" placeholder="例如：第一次一起旅行" value="' + esc(ev ? ev.title : '') + '">') +
      A.field('日期', '<input type="date" class="input" name="date" value="' + esc(ev ? ev.date : U.isoToday()) + '">') +
      A.field('写下当时', '<textarea class="textarea" name="note" rows="3" placeholder="发生了什么？心情怎么样？">' + esc(ev ? ev.note : '') + '</textarea>') +
      '<div class="field"><span>关联照片（可选）</span><select class="select" name="photoId" id="evPhotoSel" style="width:100%"><option value="">不关联</option></select></div>';

    A.modal({
      title: ev ? '编辑时刻' : '添加一个时刻',
      body: body,
      foot: [
        { label: '取消' },
        {
          label: '保存', cls: 'btn-primary', onClick: async function (card) {
            var title = card.querySelector('[name="title"]').value.trim();
            var date = card.querySelector('[name="date"]').value;
            if (!title) { A.toast('给这个时刻起个名字吧'); return false; }
            if (!date) { A.toast('选个日期'); return false; }
            var patch = {
              title: title,
              date: date,
              note: card.querySelector('[name="note"]').value.trim(),
              emoji: card.querySelector('#evEmoji .on') ? card.querySelector('#evEmoji .on').dataset.e : '🌱',
              photoId: card.querySelector('#evPhotoSel').value || ''
            };
            if (ev) STORE.updateIn('events', ev.id, patch);
            else STORE.push('events', Object.assign({ id: U.uid(), createdAt: Date.now() }, patch));
            renderTimeline();
            A.renderHome();
            A.toast(ev ? '已更新' : '已记下这一刻');
          }
        }
      ],
      onMount: function (card) {
        var em = card.querySelector('#evEmoji');
        em.addEventListener('click', function (e) {
          var b = e.target.closest('[data-e]');
          if (!b) return;
          $$('.emoji-btn', em).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
        STORE.photoList().then(function (list) {
          var sel = card.querySelector('#evPhotoSel');
          list.slice(0, 80).forEach(function (p) {
            var o = document.createElement('option');
            o.value = p.id;
            o.textContent = (p.title || '照片') + ' · ' + (p.date || '');
            if (ev && ev.photoId === p.id) o.selected = true;
            sel.appendChild(o);
          });
        });
      }
    });
  }

  $('#eventAddBtn').addEventListener('click', function () { openEventModal(); });
  A.register('timeline', renderTimeline);

  /* ==========================================================
     纪念日
     ========================================================== */
  function annivItems() {
    return STORE.getList('anniv').slice().sort(function (a, b) {
      var na = U.nextOccurrence(a.date, a.type || 'yearly');
      var nb = U.nextOccurrence(b.date, b.type || 'yearly');
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return na - nb;
    });
  }

  function renderAnniv() {
    var today = U.startOfDay(new Date());

    // 下一个
    var anchors = A.upcomingAnchors();
    if (anchors.length) {
      var n = anchors[0];
      $('#nextName').textContent = n.name;
      $('#nextDays').textContent = n.days;
      $('#nextDate').textContent = U.fmtDate(n.date) + ' · ' + U.weekday(n.date) + ' · ' + U.relativeDays(n.days);
      $('#nextCard').style.display = '';
    } else {
      $('#nextName').textContent = '还没有纪念日';
      $('#nextDays').textContent = '—';
      $('#nextDate').textContent = '在设置里填上起始日期，节点会自动算出来';
    }

    // 自动节点
    var since = U.toDate(A.settings.since);
    var defs = [
      { n: 100, name: '第 100 天' }, { n: 200, name: '第 200 天' },
      { n: 300, name: '第 300 天' }, { n: 365, name: '相识一周年' },
      { n: 520, name: '第 520 天' }, { n: 730, name: '两周年' },
      { n: 1000, name: '第 1000 天' }, { n: 1314, name: '第 1314 天' },
      { n: 1825, name: '三周年' }, { n: 2000, name: '第 2000 天' },
      { n: 2555, name: '七周年' }, { n: 3650, name: '十周年' }
    ];
    $('#milestoneList').innerHTML = defs.map(function (d) {
      var date = U.dateOfDayN(since, d.n);
      var diff = U.dayDiff(today, date);
      var past = diff < 0;
      return '<div class="ms-item' + (past ? ' past' : '') + '">' +
        '<div class="ms-name">' + esc(d.name) + '</div>' +
        '<div class="ms-num">' + (past ? '已过 ' + Math.abs(diff) : diff) + '<small>天</small></div>' +
        '<div class="ms-date">' + U.fmtShort(date) + '</div>' +
      '</div>';
    }).join('');

    // 自定义
    var list = annivItems();
    $('#annivEmpty').hidden = list.length > 0;
    $('#annivList').innerHTML = list.map(function (a) {
      var nx = U.nextOccurrence(a.date, a.type || 'yearly');
      var days = nx ? U.dayDiff(today, nx) : null;
      var typeTxt = a.type === 'monthly' ? '每月' : (a.type === 'once' ? '仅此一次' : '每年');
      return '<div class="anniv-item">' +
        '<div class="anniv-emoji">' + esc(a.emoji || '🎂') + '</div>' +
        '<div class="anniv-body">' +
          '<div class="anniv-name">' + esc(a.name) + '</div>' +
          '<div class="anniv-sub">' + typeTxt + ' · 原始日期 ' + U.fmtShort(a.date) +
          (nx ? ' · 下次 ' + U.fmtShort(nx) : ' · 已过期') + '</div>' +
        '</div>' +
        (days != null ? '<div class="anniv-days">' + days + '<small>天</small></div>' : '') +
        '<div class="tl-tools" style="opacity:1">' +
          '<button class="mini-btn" data-aedit="' + a.id + '">改</button>' +
          '<button class="mini-btn" data-adel="' + a.id + '">删</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-aedit]').forEach(function (b) {
      b.addEventListener('click', function () { openAnnivModal(b.dataset.aedit); });
    });
    $$('[data-adel]').forEach(function (b) {
      b.addEventListener('click', function () {
        A.confirm('删除这个纪念日？', '删除后不再提醒。', function () {
          STORE.removeIn('anniv', b.dataset.adel);
          renderAnniv(); A.renderHome(); A.toast('已删除');
        });
      });
    });
  }

  function openAnnivModal(id) {
    var a = id ? STORE.getList('anniv').find(function (x) { return x.id === id; }) : null;
    var emoji = (a && a.emoji) || '🎂';
    var body =
      '<div class="field"><span>图标</span><div class="emoji-row" id="anEmoji">' +
        ANNIV_EMOJIS.map(function (e) {
          return '<button type="button" class="emoji-btn' + (e === emoji ? ' on' : '') + '" data-e="' + e + '">' + e + '</button>';
        }).join('') +
      '</div></div>' +
      A.field('名称', '<input class="input" name="name" maxlength="30" placeholder="例如：TA 的生日" value="' + esc(a ? a.name : '') + '">') +
      A.field('日期', '<input type="date" class="input" name="date" value="' + esc(a ? a.date : U.isoToday()) + '">') +
      A.field('重复', '<select class="select" name="type" style="width:100%">' +
        '<option value="yearly"' + (a && a.type === 'yearly' ? ' selected' : '') + '>每年</option>' +
        '<option value="monthly"' + (a && a.type === 'monthly' ? ' selected' : '') + '>每月</option>' +
        '<option value="once"' + (a && a.type === 'once' ? ' selected' : '') + '>仅一次（倒数）</option>' +
      '</select>');

    A.modal({
      title: a ? '编辑纪念日' : '新增纪念日',
      body: body,
      foot: [
        { label: '取消' },
        {
          label: '保存', cls: 'btn-primary', onClick: function (card) {
            var name = card.querySelector('[name="name"]').value.trim();
            var date = card.querySelector('[name="date"]').value;
            if (!name) { A.toast('写个名字'); return false; }
            if (!date) { A.toast('选个日期'); return false; }
            var patch = {
              name: name, date: date,
              type: card.querySelector('[name="type"]').value,
              emoji: card.querySelector('#anEmoji .on') ? card.querySelector('#anEmoji .on').dataset.e : '🎂'
            };
            if (a) STORE.updateIn('anniv', a.id, patch);
            else STORE.push('anniv', Object.assign({ id: U.uid(), createdAt: Date.now() }, patch));
            renderAnniv();
            A.renderHome();
            A.toast('已保存');
          }
        }
      ],
      onMount: function (card) {
        var em = card.querySelector('#anEmoji');
        em.addEventListener('click', function (e) {
          var b = e.target.closest('[data-e]');
          if (!b) return;
          $$('.emoji-btn', em).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
      }
    });
  }

  $('#annivAddBtn').addEventListener('click', function () { openAnnivModal(); });
  A.register('anniv', renderAnniv);

  /* ==========================================================
     清单
     ========================================================== */
  var wishFilter = 'all';

  function seedWishes() {
    if (localStorage.getItem('ourmemory.wishSeeded')) return;
    if (STORE.getList('wishes').length) { localStorage.setItem('ourmemory.wishSeeded', '1'); return; }
    var arr = CONTENT.WISHES_100.map(function (t, i) {
      return { id: U.uid() + i, text: t, done: false, doneAt: '', custom: false, createdAt: Date.now() + i };
    });
    STORE.setList('wishes', arr);
    localStorage.setItem('ourmemory.wishSeeded', '1');
  }

  function renderWishes() {
    seedWishes();
    var all = STORE.getList('wishes');
    var done = all.filter(function (w) { return w.done; });
    var pct = all.length ? Math.round(done.length / all.length * 100) : 0;

    $('#wishPct').textContent = pct + '%';
    $('#wishRatio').textContent = done.length + '/' + all.length;
    var C = 2 * Math.PI * 52;
    $('#wishRing').style.strokeDasharray = C;
    $('#wishRing').style.strokeDashoffset = C * (1 - pct / 100);

    var items = all.slice();
    if (wishFilter === 'todo') items = items.filter(function (w) { return !w.done; });
    if (wishFilter === 'done') items = items.filter(function (w) { return w.done; });

    $('#wishList').innerHTML = items.map(function (w, i) {
      return '<li class="wish-item' + (w.done ? ' done' : '') + '" data-id="' + w.id + '">' +
        '<span class="wish-num">' + (i + 1) + '</span>' +
        '<button class="wish-check" data-toggle="' + w.id + '">✓</button>' +
        '<span class="wish-text">' + esc(w.text) + '</span>' +
        (w.done && w.doneAt ? '<span class="wish-date">' + U.fmtDot(w.doneAt) + '</span>' : '') +
        '<button class="wish-del" data-wdel="' + w.id + '" title="删除">✕</button>' +
      '</li>';
    }).join('') || '<li style="padding:40px;text-align:center;color:var(--muted);font-size:12.5px">这里还没有内容</li>';

    $$('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.toggle;
        var w = STORE.getList('wishes').find(function (x) { return x.id === id; });
        if (!w) return;
        STORE.updateIn('wishes', id, { done: !w.done, doneAt: !w.done ? U.isoToday() : '' });
        renderWishes();
        A.renderHome();
        if (!w.done) A.toast('又完成一件 ♥');
      });
    });
    $$('[data-wdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        STORE.removeIn('wishes', b.dataset.wdel);
        renderWishes();
        A.renderHome();
      });
    });
  }

  function openWishModal() {
    A.modal({
      title: '加一件想一起做的事',
      body: A.field('内容', '<input class="input" name="text" maxlength="60" placeholder="例如：一起去看一次雪">'),
      foot: [
        { label: '取消' },
        {
          label: '添加', cls: 'btn-primary', onClick: function (card) {
            var t = card.querySelector('[name="text"]').value.trim();
            if (!t) { A.toast('写点什么吧'); return false; }
            STORE.push('wishes', { id: U.uid(), text: t, done: false, doneAt: '', custom: true, createdAt: Date.now() });
            wishFilter = 'all';
            $$('#wishFilter button').forEach(function (x) { x.classList.toggle('active', x.dataset.filter === 'all'); });
            renderWishes();
            A.renderHome();
            A.toast('已加入清单');
          }
        }
      ]
    });
  }

  $('#wishAddBtn').addEventListener('click', openWishModal);
  $$('#wishFilter button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#wishFilter button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      wishFilter = b.dataset.filter;
      renderWishes();
    });
  });
  A.register('wishes', renderWishes);

  /* ==========================================================
     日记
     ========================================================== */
  var diaryMood = '';

  function buildMoodRow() {
    $('#moodRow').innerHTML = CONTENT.MOODS.map(function (m) {
      return '<button class="mood" data-mood="' + m.e + '" title="' + m.n + '">' + m.e + '</button>';
    }).join('');
    $$('#moodRow .mood').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#moodRow .mood').forEach(function (x) { x.classList.remove('on'); });
        diaryMood = b.dataset.mood;
        b.classList.add('on');
      });
    });
  }

  function renderDiary() {
    var list = STORE.getList('diary').slice();
    list.sort(function (a, b) { return U.toDate(b.date) - U.toDate(a.date) || (b.createdAt || 0) - (a.createdAt || 0); });
    $('#diaryEmpty').hidden = list.length > 0;
    $('#diaryList').innerHTML = list.map(function (d) {
      return '<div class="diary-item" data-id="' + d.id + '">' +
        '<div class="diary-tools">' +
          '<button class="mini-btn" data-dedit="' + d.id + '">改</button>' +
          '<button class="mini-btn" data-ddel="' + d.id + '">删</button>' +
        '</div>' +
        '<div class="diary-top">' +
          '<span class="diary-mood">' + esc(d.mood || '📝') + '</span>' +
          '<span class="diary-date">' + U.fmtDate(d.date) + '</span>' +
          '<span class="diary-weather">' + esc(d.weather || '') + ' ' + U.weekday(d.date) + '</span>' +
        '</div>' +
        '<div class="diary-text">' + esc(d.text) + '</div>' +
      '</div>';
    }).join('');

    $$('[data-ddel]').forEach(function (b) {
      b.addEventListener('click', function () {
        A.confirm('删除这篇日记？', '删除后无法恢复。', function () {
          STORE.removeIn('diary', b.dataset.ddel);
          renderDiary(); A.renderHome(); A.toast('已删除');
        });
      });
    });
    $$('[data-dedit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = STORE.getList('diary').find(function (x) { return x.id === b.dataset.dedit; });
        if (!d) return;
        $('#diaryDate').value = d.date;
        $('#diaryText').value = d.text;
        $('#diaryWeather').value = d.weather || '';
        diaryMood = d.mood || '';
        $$('#moodRow .mood').forEach(function (x) { x.classList.toggle('on', x.dataset.mood === diaryMood); });
        $('#diaryHint').textContent = '正在编辑 ' + U.fmtShort(d.date) + ' 的日记';
        $('#diaryText').focus();
        $('#diaryText').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  $('#diarySave').addEventListener('click', function () {
    var date = $('#diaryDate').value || U.isoToday();
    var text = $('#diaryText').value.trim();
    if (!text) { A.toast('还没写内容呢'); return; }
    var exist = STORE.getList('diary').find(function (x) { return x.date === date; });
    var payload = { date: date, text: text, mood: diaryMood, weather: $('#diaryWeather').value, createdAt: Date.now() };
    if (exist) {
      STORE.updateIn('diary', exist.id, payload);
      A.toast('已更新 ' + U.fmtShort(date) + ' 的日记');
    } else {
      STORE.push('diary', Object.assign({ id: U.uid() }, payload));
      A.toast('这一天被记下来了');
    }
    $('#diaryText').value = '';
    diaryMood = '';
    $$('#moodRow .mood').forEach(function (x) { x.classList.remove('on'); });
    $('#diaryHint').textContent = '';
    renderDiary();
    A.renderHome();
  });

  A.register('diary', function () {
    if (!$('#diaryDate').value) $('#diaryDate').value = U.isoToday();
    if (!$('#moodRow').children.length) buildMoodRow();
    renderDiary();
  });

  /* ==========================================================
     每日一问
     ========================================================== */
  var askIdx = -1;

  function answeredMap() {
    var m = {};
    STORE.getList('answers').forEach(function (a) { m[a.qid] = a; });
    return m;
  }

  function renderAsk(keep) {
    var ans = answeredMap();
    var total = CONTENT.QUESTIONS_100.length;
    var n = Object.keys(ans).length;

    $('#askMeta').textContent = '已经回答 ' + n + ' 题 · 还剩 ' + (total - n) + ' 题';
    $('#askBar').style.width = (n / total * 100) + '%';

    if (!keep || askIdx < 0) {
      var pool = [];
      for (var i = 0; i < total; i++) if (!ans[i]) pool.push(i);
      if (!pool.length) pool = CONTENT.QUESTIONS_100.map(function (_, i) { return i; });
      askIdx = pool[Math.floor(Math.random() * pool.length)];
    }
    $('#askNo').textContent = '#' + (askIdx + 1);
    $('#askQ').textContent = CONTENT.QUESTIONS_100[askIdx];
    var cur = ans[askIdx];
    $('#askAnswerBtn').textContent = cur ? '看看我们的答案' : '写下答案';

    var list = STORE.getList('answers').slice();
    list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    $('#qaEmpty').hidden = list.length > 0;
    $('#qaList').innerHTML = list.map(function (a) {
      return '<div class="qa-item">' +
        '<div class="qa-q">' + esc(CONTENT.QUESTIONS_100[a.qid] || '') + '</div>' +
        '<div class="qa-a">' + esc(a.text) + '</div>' +
        '<div class="qa-date">' + U.fmtShort(a.createdAt || a.date) +
          ' <button class="mini-btn" data-qedit="' + a.qid + '" style="margin-left:8px">改</button>' +
          ' <button class="mini-btn" data-qdel="' + a.qid + '">删</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-qedit]').forEach(function (b) {
      b.addEventListener('click', function () { openAnswer(+b.dataset.qedit); });
    });
    $$('[data-qdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var qid = +b.dataset.qdel;
        A.confirm('删除这个回答？', '', function () {
          var arr = STORE.getList('answers').filter(function (x) { return x.qid !== qid; });
          STORE.setList('answers', arr);
          renderAsk(true); A.toast('已删除');
        });
      });
    });
  }

  function openAnswer(qid) {
    if (qid == null) qid = askIdx;
    var q = CONTENT.QUESTIONS_100[qid] || '';
    var cur = answeredMap()[qid];
    A.modal({
      title: '第 ' + (qid + 1) + ' 问',
      body: '<p style="font-family:var(--serif);font-size:16px;line-height:1.7;margin-bottom:6px">' + esc(q) + '</p>' +
            '<textarea class="textarea" name="ans" rows="5" placeholder="慢慢写，不着急">' + esc(cur ? cur.text : '') + '</textarea>',
      foot: [
        { label: '取消' },
        {
          label: '保存', cls: 'btn-primary', onClick: function (card) {
            var text = card.querySelector('[name="ans"]').value.trim();
            if (!text) { A.toast('写一点点也好'); return false; }
            var arr = STORE.getList('answers').filter(function (x) { return x.qid !== qid; });
            arr.unshift({ qid: qid, text: text, date: U.isoToday(), createdAt: Date.now() });
            STORE.setList('answers', arr);
            renderAsk(true);
            A.toast('已保存');
          }
        }
      ]
    });
  }

  $('#askDraw').addEventListener('click', function (e) {
    e.stopPropagation();
    renderAsk(false);
  });
  $('#askAnswerBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    openAnswer();
  });
  $('#askCard').addEventListener('click', function () { openAnswer(); });
  A.register('ask', function () { renderAsk(true); });

  /* ==========================================================
     统计
     ========================================================== */
  function activityMap(photos, diary, events) {
    var m = {};
    function bump(d) {
      var k = typeof d === 'string' ? d.slice(0, 10) : U.isoOf(d);
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
    }
    photos.forEach(function (p) { bump(p.date || p.createdAt); });
    diary.forEach(function (d) { bump(d.date); });
    events.forEach(function (e) { bump(e.date); });
    return m;
  }

  function renderStats() {
    STORE.photoList().then(function (photos) {
      var diary = STORE.getList('diary');
      var events = STORE.getList('events');
      var wishes = STORE.getList('wishes');
      var answers = STORE.getList('answers');
      var d = U.duration(A.settings.since);
      var doneW = wishes.filter(function (w) { return w.done; }).length;

      var cards = [
        { k: rel().label + '的天数', v: d.totalDays, u: '天 · 约 ' + (d.totalDays / 365).toFixed(1) + ' 年' },
        { k: '照片', v: photos.length, u: photos.filter(function (p) { return p.fav; }).length + ' 张被收藏' },
        { k: '里程碑', v: events.length, u: '个值得记住的时刻' },
        { k: '日记', v: diary.length, u: diary.length ? '最近 ' + U.fmtShort(diary.slice().sort(function (a, b) { return U.toDate(b.date) - U.toDate(a.date); })[0].date) : '还没开始' },
        { k: '清单完成', v: doneW + '/' + wishes.length, u: wishes.length ? Math.round(doneW / wishes.length * 100) + '% 已完成' : '—' },
        { k: '已回答', v: answers.length, u: '共 100 个问题' }
      ];
      $('#statCards').innerHTML = cards.map(function (c) {
        return '<div class="stat-card"><div class="k">' + esc(c.k) + '</div><div class="v">' + c.v + '</div><div class="u">' + esc(c.u) + '</div></div>';
      }).join('');

      // 热力图（近 53 周）
      var act = activityMap(photos, diary, events);
      var today = U.startOfDay(new Date());
      var start = new Date(today); start.setDate(start.getDate() - 363);
      start.setDate(start.getDate() - start.getDay());
      var cells = [];
      var cursor = new Date(start);
      var maxV = 1;
      var days = [];
      while (cursor <= today) {
        var key = U.isoOf(cursor);
        var v = act[key] || 0;
        if (v > maxV) maxV = v;
        days.push({ key: key, v: v, d: new Date(cursor) });
        cursor.setDate(cursor.getDate() + 1);
      }
      days.forEach(function (x) {
        var lvl = x.v === 0 ? 0 : Math.min(4, Math.ceil(x.v / maxV * 4));
        cells.push('<i class="h' + lvl + '" title="' + x.key + ' · ' + x.v + ' 条记录"></i>');
      });
      $('#heatmap').innerHTML = cells.join('');
      var active = days.filter(function (x) { return x.v > 0; }).length;
      $('#heatTag').textContent = '记录 ' + active + ' 天 / 共 ' + days.length + ' 天';

      // 近 12 个月照片
      var months = [];
      for (var i = 11; i >= 0; i--) {
        var dt = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push({ y: dt.getFullYear(), m: dt.getMonth(), n: 0 });
      }
      photos.forEach(function (p) {
        var pd = U.toDate(p.date || p.createdAt);
        if (isNaN(pd)) return;
        months.forEach(function (mo) {
          if (pd.getFullYear() === mo.y && pd.getMonth() === mo.m) mo.n++;
        });
      });
      var maxM = Math.max.apply(null, months.map(function (m) { return m.n; }).concat([1]));
      $('#monthBars').innerHTML = months.map(function (mo) {
        var h = Math.round(mo.n / maxM * 100);
        return '<div class="bar-col" title="' + mo.y + '年' + (mo.m + 1) + '月 · ' + mo.n + ' 张">' +
          '<div class="bar" style="height:' + Math.max(h, 2) + '%"></div>' +
          '<div class="bar-lbl">' + (mo.m + 1) + '</div></div>';
      }).join('');

      // 内容分布
      var segs = [
        { n: '照片', v: photos.length, c: 'var(--accent)' },
        { n: '日记', v: diary.length, c: 'var(--accent-2)' },
        { n: '里程碑', v: events.length, c: 'color-mix(in srgb, var(--accent) 45%, var(--bg-2))' },
        { n: '问答', v: answers.length, c: 'color-mix(in srgb, var(--accent-2) 45%, var(--bg-2))' },
        { n: '清单完成', v: doneW, c: 'var(--line-strong)' }
      ];
      var total = segs.reduce(function (s, x) { return s + x.v; }, 0) || 1;
      var C = 2 * Math.PI * 45;
      var offset = 0;
      var arcs = segs.map(function (s) {
        var len = C * (s.v / total);
        var el = '<circle cx="60" cy="60" r="45" fill="none" stroke="' + s.c + '" stroke-width="16" ' +
          'stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" ' +
          'stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 60 60)"></circle>';
        offset += len;
        return el;
      }).join('');
      $('#donut').innerHTML =
        '<svg class="donut-svg" viewBox="0 0 120 120">' +
          '<circle cx="60" cy="60" r="45" fill="none" stroke="var(--bg-2)" stroke-width="16"></circle>' + arcs +
        '</svg>' +
        '<div class="donut-legend">' + segs.map(function (s) {
          return '<div><i style="background:' + s.c + '"></i>' + esc(s.n) + ' · ' + s.v + '</div>';
        }).join('') + '</div>';
    });
  }
  A.register('stats', renderStats);

  /* ==========================================================
     纪念卡（Canvas 导出）
     ========================================================== */
  var THEME_COLORS = {
    cream: { bg1: '#F6DCE0', bg2: '#EFE6DC', ink: '#2C2724', sub: '#6B5C55', accent: '#CE7F92', on: '#2C2724' },
    handmade: { bg1: '#EADFC2', bg2: '#DCCDBA', ink: '#352D22', sub: '#6B5A44', accent: '#B4654A', on: '#352D22' },
    fresh: { bg1: '#EDEFE9', bg2: '#F4F1E9', ink: '#1C1C1A', sub: '#5B5B54', accent: '#4C6B57', on: '#1C1C1A' },
    night: { bg1: '#2A2020', bg2: '#141010', ink: '#F3E9E1', sub: '#B7A79C', accent: '#E28E9C', on: '#F3E9E1' }
  };

  function wrapText(ctx, text, maxWidth) {
    var lines = [], line = '';
    for (var i = 0; i < text.length; i++) {
      var t = line + text[i];
      if (ctx.measureText(t).width > maxWidth && line) {
        lines.push(line); line = text[i];
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function buildPoster(photoId) {
    var S = A.settings;
    var T = THEME_COLORS[S.theme] || THEME_COLORS.cream;
    var W = 900, H = 1440;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');

    // 背景
    var g = ctx.createLinearGradient(0, 0, W * .4, H);
    g.addColorStop(0, T.bg1);
    g.addColorStop(1, T.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 照片
    if (photoId) {
      try {
        var rec = await STORE.photoGet(photoId);
        if (rec) {
          var url = await STORE.photoURL(photoId, 'full');
          var img = await new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = rej;
            im.src = url;
          });
          var ph = 1000;
          var sc = Math.max(W / img.width, ph / img.height);
          var dw = img.width * sc, dh = img.height * sc;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, W, ph);
          ctx.clip();
          ctx.drawImage(img, (W - dw) / 2, (ph - dh) / 2, dw, dh);
          ctx.restore();
          // 渐隐到背景
          var fade = ctx.createLinearGradient(0, ph - 420, 0, ph + 40);
          fade.addColorStop(0, 'rgba(0,0,0,0)');
          fade.addColorStop(1, T.bg2);
          ctx.fillStyle = fade;
          ctx.fillRect(0, ph - 420, W, 460);
        }
      } catch (e) { console.warn('海报照片加载失败', e); }
    } else {
      // 无照片时画一个大爱心
      ctx.save();
      ctx.globalAlpha = .12;
      ctx.fillStyle = T.accent;
      ctx.font = '500 420px "Songti SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText('♡', W / 2, 760);
      ctx.restore();
    }

    var d = U.duration(S.since);
    var r = rel();
    ctx.textAlign = 'center';

    // 标题
    ctx.fillStyle = T.ink;
    ctx.font = '600 40px "Songti SC", "PingFang SC", serif';
    ctx.fillText(A.pairTitle(), W / 2, 1075);

    // 标签
    ctx.fillStyle = T.sub;
    ctx.font = '400 22px "PingFang SC", sans-serif';
    ctx.fillText(r.label.toUpperCase ? r.label : r.label, W / 2, 1120);

    // 天数
    ctx.fillStyle = T.accent;
    ctx.font = '600 190px "Songti SC", "PingFang SC", serif';
    ctx.fillText(String(d.totalDays), W / 2, 1270);
    ctx.fillStyle = T.sub;
    ctx.font = '400 24px "PingFang SC", sans-serif';
    ctx.fillText('天', W / 2 + ctx.measureText(String(d.totalDays)).width / 2 + 34, 1262);

    // 日期区间
    ctx.fillStyle = T.sub;
    ctx.font = '400 19px "PingFang SC", sans-serif';
    ctx.fillText(U.fmtShort(S.since) + '  —  ' + U.fmtShort(new Date()), W / 2, 1310);

    // 底部：一句情话
    var quotes = CONTENT.QUOTES[S.relation] || CONTENT.QUOTES.lover;
    var q = quotes[Math.floor(Math.random() * quotes.length)];
    ctx.fillStyle = T.ink;
    ctx.font = '400 25px "Songti SC", "PingFang SC", serif';
    var lines = wrapText(ctx, q, W - 220);
    lines.slice(0, 2).forEach(function (ln, i) {
      ctx.fillText(ln, W / 2, 1380 + i * 40);
    });

    // 装饰线
    ctx.strokeStyle = T.accent;
    ctx.globalAlpha = .4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 40, 1200);
    ctx.lineTo(W / 2 + 40, 1200);
    ctx.stroke();
    ctx.globalAlpha = 1;

    return c;
  }

  async function openPoster() {
    var photos = await STORE.photoList();
    var pick = null;
    if (A.settings.cover) {
      // 封面是 dataURL，转成临时照片不划算，直接用最近一张
    }
    if (photos.length) {
      var sorted = photos.slice().sort(function (a, b) {
        return U.toDate(b.date || b.createdAt) - U.toDate(a.date || a.createdAt);
      });
      pick = sorted[0].id;
    }

    var wrap = A.modal({
      title: '生成纪念卡',
      body: '<div id="posterBox" style="display:grid;place-items:center;min-height:200px;color:var(--muted);font-size:12.5px">正在生成…</div>',
      foot: [
        { label: '换一张照片', cls: 'btn-ghost-solid' },
        { label: '下载图片', cls: 'btn-primary' }
      ]
    });

    var dataUrl = '';
    async function draw() {
      var box = $('#posterBox');
      if (!box) return;
      box.innerHTML = '<div style="color:var(--muted);font-size:12.5px">正在生成…</div>';
      var canvas = await buildPoster(pick);
      dataUrl = canvas.toDataURL('image/png');
      box.innerHTML = '<img src="' + dataUrl + '" style="width:100%;border-radius:14px;box-shadow:var(--shadow-lg)" alt="纪念卡预览">';
    }

    var footBtns = $$('.modal-foot button');
    footBtns[0].addEventListener('click', function (e) {
      e.stopPropagation();
      if (!photos.length) { A.toast('相册里还没有照片'); return; }
      A.modal({
        title: '选一张照片',
        body: '<div class="pick-grid">' + photos.slice(0, 40).map(function (p) {
          return '<button class="pick-item" data-pp="' + p.id + '"><img alt=""></button>';
        }).join('') + '</div>',
        onMount: function (card, close) {
          $$('[data-pp]', card).forEach(function (b) {
            STORE.photoURL(b.dataset.pp, 'thumb').then(function (u) { if (u) b.firstChild.src = u; });
            b.addEventListener('click', function () {
              pick = b.dataset.pp;
              close();
              draw();
            });
          });
        }
      });
    });
    footBtns[1].addEventListener('click', function (e) {
      e.stopPropagation();
      if (!dataUrl) return;
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = '纪念卡-' + U.isoToday() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      A.toast('已保存到下载文件夹');
    });

    draw();
    void wrap;
  }

  global.POSTER = { open: openPoster };
  A.POSTER = global.POSTER;

  /* 导出给其它模块 */
  A.openEventModal = openEventModal;
  A.openAnnivModal = openAnnivModal;
  A.openWishModal = openWishModal;
})(window);
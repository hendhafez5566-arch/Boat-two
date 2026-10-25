(function () {
  'use strict';
  var script = document.currentScript || document.querySelector('script[data-key][src*="widget.js"]');
  if (!script) return;
  var key = script.getAttribute('data-key');
  if (!key) return;
  var base = script.src.replace(/\/widget\.js.*$/, '');
  var STORE = 'cb_visitor_' + key;
  var st = { open: false, visitorId: null, token: null, lastSeq: 0, cfg: null, started: false, unread: 0, timer: null };

  function store(get, val) {
    try { return get ? localStorage.getItem(STORE) : localStorage.setItem(STORE, val); } catch { return null; }
  }
  function uid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function req(path, method, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (st.token) headers['x-visitor-token'] = st.token;
    return fetch(base + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.message || 'request failed');
          return d;
        });
      });
  }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var host = h('div');
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  var ui = {};
  var displayQueue = Promise.resolve();
  var historyBoundary = 0;

  function build(cfg) {
    var side = cfg.position === 'left' ? 'left' : 'right';
    var css =
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif}' +
      '.launcher{position:fixed;bottom:20px;' + side + ':20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;color:#fff;font-size:26px;background:' + cfg.color + ';box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:2147483646}' +
      '.badge{position:absolute;top:-4px;' + (side === 'left' ? 'right' : 'left') + ':-4px;background:#ef4444;color:#fff;border-radius:10px;font-size:12px;min-width:20px;height:20px;line-height:20px;text-align:center;display:none}' +
      '.panel{position:fixed;bottom:90px;' + side + ':20px;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 110px);background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483647}' +
      '.panel.open{display:flex}' +
      '.head{background:' + cfg.color + ';color:#fff;padding:14px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}' +
      '.close{background:none;border:0;color:#fff;font-size:20px;cursor:pointer}' +
      '.msgs{flex:1;overflow-y:auto;padding:12px;background:#f5f6f8;display:flex;flex-direction:column;gap:8px}' +
      '.m{max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}' +
      '.m.them{align-self:flex-start;background:#fff;color:#111;border:1px solid #e5e7eb}' +
      '.m.me{align-self:flex-end;background:' + cfg.color + ';color:#fff}' +
      '.m img{max-width:100%;border-radius:8px;display:block;margin-bottom:4px}' +
      '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.chip{border:1px solid ' + cfg.color + ';color:' + cfg.color + ';background:#fff;border-radius:16px;padding:5px 12px;font-size:13px;cursor:pointer}' +
      '.chip[disabled]{opacity:.45;cursor:default}' +
      '.sec{font-size:12px;color:#6b7280;width:100%;margin-top:4px}' +
      'form{display:flex;border-top:1px solid #e5e7eb;background:#fff}' +
      'input{flex:1;border:0;padding:14px;font-size:14px;outline:none;background:transparent}' +
      '.send{border:0;background:none;color:' + cfg.color + ';font-weight:700;padding:0 16px;cursor:pointer;font-size:14px}';
    var style = h('style');
    style.textContent = css;

    ui.launcher = h('button', 'launcher', '\uD83D\uDCAC');
    ui.launcher.setAttribute('aria-label', cfg.title);
    ui.badge = h('span', 'badge');
    ui.launcher.appendChild(ui.badge);

    ui.panel = h('div', 'panel');
    ui.panel.setAttribute('dir', cfg.direction || 'rtl');
    var head = h('div', 'head');
    head.appendChild(h('span', '', cfg.title));
    ui.close = h('button', 'close', '\u00D7');
    ui.close.setAttribute('aria-label', cfg.direction === 'rtl' ? 'إغلاق المحادثة' : 'Close conversation');
    head.appendChild(ui.close);
    ui.msgs = h('div', 'msgs');
    ui.form = h('form');
    ui.input = h('input');
    ui.input.setAttribute('aria-label', cfg.direction === 'rtl' ? 'اكتب رسالة' : 'Message');
    ui.input.setAttribute('maxlength', '2000');
    ui.input.setAttribute('autocomplete', 'off');
    ui.send = h('button', 'send', '\u27A4');
    ui.send.type = 'submit';
    ui.send.setAttribute('aria-label', cfg.direction === 'rtl' ? 'إرسال' : 'Send');
    ui.form.appendChild(ui.input);
    ui.form.appendChild(ui.send);
    ui.panel.appendChild(head);
    ui.panel.appendChild(ui.msgs);
    ui.panel.appendChild(ui.form);
    var optOut = h('button', 'chip', st.cfg.direction === 'rtl' ? 'إيقاف الرسائل التسويقية' : 'Stop marketing messages');
    optOut.type = 'button';
    optOut.onclick = function () {
      optOut.disabled = true;
      start().then(function () { return req('/widget/' + key + '/opt-out?visitorId=' + encodeURIComponent(st.visitorId), 'POST'); })
        .then(function () { addBubble('them', { text: st.cfg.direction === 'rtl' ? 'تم إيقاف الرسائل التسويقية لهذه القناة.' : 'Marketing messages for this channel have been stopped.' }); })
        .catch(function () { addBubble('them', { text: st.cfg.direction === 'rtl' ? 'تعذر الحفظ. حاول مرة أخرى.' : 'Could not save your preference. Please retry.' }); })
        .finally(function () { optOut.disabled = false; });
    };
    ui.panel.appendChild(optOut);


    root.appendChild(style);
    root.appendChild(ui.launcher);
    root.appendChild(ui.panel);

    ui.launcher.onclick = function () { toggle(!st.open); };
    ui.close.onclick = function () { toggle(false); };
    ui.form.onsubmit = function (e) {
      e.preventDefault();
      var t = ui.input.value.trim();
      if (!t) return;
      ui.input.value = '';
      send({ text: t });
    };
  }

  function disableChips() {
    var all = ui.msgs.querySelectorAll('.chip');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
  }

  function addBubble(who, content) {
    var b = h('div', 'm ' + who);
    content = content || {};
    if (content.media) {
      var u = content.media.url;
      if (u && /^https?:\/\//i.test(u)) {
        if (content.media.kind === 'image') {
          var img = h('img'); img.src = u; b.appendChild(img);
        } else {
          var a = h('a', '', content.media.filename || u); a.href = u; a.target = '_blank'; a.rel = 'noopener';
          b.appendChild(a);
        }
      }
      if (content.media.caption) b.appendChild(document.createTextNode(content.media.caption));
    }
    if (content.header && content.header.type === 'text') b.appendChild(h('strong', '', content.header.text));
    if (content.header && content.header.type === 'image' && /^https:\/\//i.test(content.header.url)) { var headerImage = h('img'); headerImage.src = content.header.url; b.appendChild(headerImage); }
    if (content.text) b.appendChild(document.createTextNode(content.text));
    if (content.footer) b.appendChild(h('small', '', content.footer));
    if (content.location) b.appendChild(document.createTextNode('\uD83D\uDCCD ' + (content.location.name || 'Location')));

    var options = [];
    if (content.buttons) options = options.concat(content.buttons.map(function (x) { return { id: x.id, title: x.title }; }));
    var chips = h('div', 'chips');
    if (content.list) {
      content.list.sections.forEach(function (s) {
        if (s.title) chips.appendChild(h('div', 'sec', s.title));
        s.rows.forEach(function (r) { options.push({ id: r.id, title: r.title }); });
      });
    }
    if (options.length) {
      disableChips();
      options.forEach(function (o) {
        var c = h('button', 'chip', o.title);
        c.type = 'button';
        c.onclick = function () { disableChips(); send({ reply: { id: o.id, title: o.title } }); };
        chips.appendChild(c);
      });
      b.appendChild(chips);
    }
    ui.msgs.appendChild(b);
    ui.msgs.scrollTop = ui.msgs.scrollHeight;
  }

  // Local display timing only: provider delivery status remains unchanged.
  function displayMessage(m) {
    var seconds = Math.min(5, Math.max(0, Number(m.content.typingSeconds) || 0));
    var recent = Date.now() - new Date(m.createdAt).getTime() < 30000;
    var typing = seconds && st.open && recent && m.seq > historyBoundary && m.senderType !== 'contact';
    displayQueue = displayQueue.then(function () {
      if (!typing) { addBubble(m.senderType === 'contact' ? 'me' : 'them', m.content); return; }
      var indicator = h('div', 'm them typing', st.cfg.direction === 'rtl' ? 'يكتب الآن…' : 'Typing…');
      indicator.setAttribute('role', 'status');
      ui.msgs.appendChild(indicator);
      ui.msgs.scrollTop = ui.msgs.scrollHeight;
      return new Promise(function (resolve) { setTimeout(function () {
        indicator.remove(); addBubble('them', m.content); resolve();
      }, seconds * 1000); });
    }).catch(function () {});
  }

  function poll() {
    if (!st.token) return Promise.resolve();
    return req('/widget/' + key + '/messages?visitorId=' + encodeURIComponent(st.visitorId) + '&after=' + st.lastSeq)
      .then(function (d) {
        var fresh = 0;
        (d.messages || []).forEach(function (m) {
          if (m.seq <= st.lastSeq) return;
          st.lastSeq = m.seq;
          displayMessage(m);
          if (m.senderType !== 'contact') fresh++;
        });
        if (fresh && !st.open) {
          st.unread += fresh;
          ui.badge.textContent = String(st.unread);
          ui.badge.style.display = 'block';
        }
      })
      .catch(function () {});
  }

  function send(payload) {
    payload.clientMsgId = uid();
    req('/widget/' + key + '/messages?visitorId=' + encodeURIComponent(st.visitorId), 'POST', payload).then(poll).catch(function () {
      addBubble('them', { text: '\u26A0 Message not sent, please try again.' });
    });
  }

  function start() {
    if (st.started) return Promise.resolve();
    st.started = true;
    return req('/widget/' + key + '/session', 'POST', { visitorId: store(true) || undefined }).then(function (d) {
      st.visitorId = d.visitorId;
      st.token = d.token;
      store(false, d.visitorId);
      return req('/widget/' + key + '/messages?visitorId=' + encodeURIComponent(st.visitorId)).then(function (r) {
        historyBoundary = Math.max.apply(null, [0].concat((r.messages || []).map(function(m) { return m.seq; })));
        if (!r.messages || !r.messages.length) addBubble('them', { text: st.cfg.welcomeMessage });
        return poll();
      });
    }).catch(function () { st.started = false; });
  }

  function schedule() {
    clearTimeout(st.timer);
    st.timer = setTimeout(function () { poll().then(schedule); }, st.open ? 3000 : 15000);
  }

  function toggle(open) {
    st.open = open;
    ui.panel.classList.toggle('open', open);
    if (open) {
      st.unread = 0;
      ui.badge.style.display = 'none';
      start().then(function () { ui.input.focus(); });
    }
    schedule();
  }

  fetch(base + '/widget/' + key + '/config')
    .then(function (r) { if (!r.ok) throw new Error('config'); return r.json(); })
    .then(function (cfg) {
      st.cfg = cfg;
      build(cfg);
      if (store(true)) { start().then(schedule); }
    })
    .catch(function () { host.remove(); });
})();

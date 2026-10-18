/*! Online Pitch Changer 2.0.0 (homepage tool) | onlinepitchchanger.com | uses opc-engine 1.0.0 unchanged
 * (pitch shift with the tempo kept or changed independently, formant preserve, key detection, WAV/MP3 export).
 * Replaces the 1.x mock (a non-functional "opc-fake-slider"). No meta description / og:title output anywhere in this file or the PHP. */
!function () {
	"use strict";
	/* ---------- opc-engine-lite 1.0.0, inlined (page-side helpers only, no DSP -- per README.md's build note:
	 * "opc-engine-lite.js: page-side helpers only (no DSP), inlined into each tool's page script"). Keeps this
	 * script self-sufficient on the main thread: the full engine (opc-engine.js) runs only in the Worker. ---------- */
	var Lite = (function () {
		var MAJ_T = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
		var MIN_T = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
		function mod12(v) { return ((v % 12) + 12) % 12; }
		function keyName(k) {
			var minor = k >= 12, pc = k % 12, tonic = minor ? MIN_T[pc] : MAJ_T[pc];
			return { k: k, pc: pc, minor: minor, tonic: tonic, name: tonic + (minor ? ' minor' : ' major'), short: tonic + (minor ? 'm' : '') };
		}
		function transposeKey(k, semi) { return mod12((k % 12) + Math.round(semi)) + (k >= 12 ? 12 : 0); }
		function fileKeyLabel(name) { return String(name).replace(/♯/g, '-sharp').replace(/♭/g, '-flat').replace(/\s+/g, '-'); }
		function fmtShift(semi, cents) { var s = Math.round(semi), c = Math.round(cents || 0), o = ''; if (s) o += (s > 0 ? '+' : '-') + Math.abs(s) + 'st'; if (c) o += (c > 0 ? '+' : '-') + Math.abs(c) + 'c'; return o || '0st'; }
		function fileName(base, keyNm, semi, cents, ext) {
			var b = String(base || 'song').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\\/:*?"<>|#%&{}$!'@+`=]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'song';
			return b + '_' + (keyNm ? fileKeyLabel(keyNm) + '_' : '') + fmtShift(semi, cents) + '.' + (ext || 'wav');
		}
		function sniffRate(ab) {
			var u = new Uint8Array(ab), n = u.length, i, dv = new DataView(ab);
			function s4(o) { return String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]); }
			if (n > 32 && s4(0) === 'RIFF' && s4(8) === 'WAVE') { for (i = 12; i + 8 < n && i < 1 << 20;) { var id = s4(i), sz = dv.getUint32(i + 4, true); if (id === 'fmt ') return dv.getUint32(i + 12, true); i += 8 + sz + (sz & 1); } }
			if (n > 42 && s4(0) === 'fLaC') return (u[18] << 12) | (u[19] << 4) | (u[20] >> 4);
			if (n > 60 && s4(0) === 'OggS') {
				for (i = 0; i < Math.min(n - 20, 400); i++) {
					if (u[i] === 1 && s4(i + 1) === 'vorb' && u[i + 5] === 105) return dv.getUint32(i + 12, true);
					if (s4(i) === 'Opus' && s4(i + 4) === 'Head') return 48000;
					if (u[i] === 0x7f && s4(i + 1) === 'FLAC') return (u[i + 27] << 12) | (u[i + 28] << 4) | (u[i + 29] >> 4);
				}
			}
			if (n > 12 && s4(4) === 'ftyp') { var lim = Math.min(n - 40, 64 << 20); for (i = 8; i < lim; i++) if (u[i] === 0x6d && u[i + 1] === 0x70 && u[i + 2] === 0x34 && u[i + 3] === 0x61) { var r = dv.getUint16(i + 28); if (r >= 8000 && r <= 192000) return r; } }
			if (n > 4 && u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) return 48000;
			i = 0;
			if (n > 10 && u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) i = 10 + ((u[6] & 127) << 21 | (u[7] & 127) << 14 | (u[8] & 127) << 7 | (u[9] & 127));
			for (var lim2 = Math.min(n - 4, i + 65536); i < lim2; i++) {
				if (u[i] === 0xff && (u[i + 1] & 0xe0) === 0xe0) {
					var ver = (u[i + 1] >> 3) & 3, layer = (u[i + 1] >> 1) & 3, sri = (u[i + 2] >> 2) & 3, bri = u[i + 2] >> 4;
					if (ver === 1 || layer === 0 || sri === 3 || bri === 15 || bri === 0) continue;
					var base = [44100, 48000, 32000][sri]; return ver === 3 ? base : ver === 2 ? base / 2 : base / 4;
				}
			}
			return 0;
		}
		function sniffType(ab) {
			var u = new Uint8Array(ab, 0, Math.min(64, ab.byteLength));
			function s(o, t) { for (var i = 0; i < t.length; i++) if (u[o + i] !== t.charCodeAt(i)) return false; return true; }
			if (s(0, 'RIFF') && s(8, 'WAVE')) return 'wav';
			if (s(0, 'fLaC')) return 'flac';
			if (s(0, 'OggS')) return 'ogg';
			if (s(4, 'ftyp')) return s(8, 'qt  ') ? 'mov' : (s(8, 'M4A ') || s(8, 'M4B ')) ? 'm4a' : 'mp4';
			if (u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) return 'webm';
			if (s(0, 'ID3')) return 'mp3';
			if (u[0] === 0xff && (u[1] & 0xe0) === 0xe0) return ((u[1] >> 1) & 3) === 0 ? 'aac' : 'mp3';
			return '';
		}
		return { keyName: keyName, transposeKey: transposeKey, fileName: fileName, sniffRate: sniffRate, sniffType: sniffType, MP3_RATES: [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] };
	})();

	var ACtx = window.AudioContext || window.webkitAudioContext;
	var OACtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;

	/* ---------- small helpers ---------- */
	function qs(root, sel) { return root.querySelector(sel); }
	function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
	function fmtTime(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; }
	function signed(n) { n = Math.round(n); return n > 0 ? '+' + n : n < 0 ? String(n) : '0'; }
	function plural(n, w) { return Math.abs(n) === 1 ? w : w + 's'; }
	function fmtSize(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }
	function fmtHz(sr) { return (sr / 1000).toFixed(sr % 1000 ? 1 : 0) + ' kHz'; }
	function shiftPhrase(semi, cents) {
		var parts = [];
		if (semi) parts.push(signed(semi) + ' ' + plural(semi, 'semitone'));
		if (cents) parts.push(signed(cents) + ' cents');
		return parts.length ? parts.join(', ') : '';
	}
	function audioBufferFrom(chs, sr, ctx) {
		var buf;
		try { buf = new AudioBuffer({ length: Math.max(1, chs[0].length), numberOfChannels: chs.length, sampleRate: sr }); }
		catch (e) { buf = ctx.createBuffer(chs.length, Math.max(1, chs[0].length), sr); }
		for (var i = 0; i < chs.length; i++) { if (buf.copyToChannel) buf.copyToChannel(chs[i], i); else buf.getChannelData(i).set(chs[i]); }
		return buf;
	}
	function renderOffline(octx) {
		return new Promise(function (resolve, reject) {
			octx.oncomplete = function (e) { resolve(e.renderedBuffer); };
			try { var p = octx.startRendering(); if (p && p.then) p.then(resolve, reject); } catch (e) { reject(e); }
		});
	}
	function loadScript(src, cb) {
		var s = document.createElement('script');
		s.src = src; s.async = true;
		s.onload = function () { cb(null); };
		s.onerror = function () { cb(new Error('load ' + src)); };
		document.head.appendChild(s);
	}
	function segGroup(buttons, attr, onPick) {
		function mark(i) { buttons.forEach(function (b, j) { b.setAttribute('aria-checked', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; }); }
		buttons.forEach(function (b, i) {
			b.addEventListener('click', function () { mark(i); onPick(b.getAttribute(attr)); });
			b.addEventListener('keydown', function (e) {
				var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
				if (d) { e.preventDefault(); var j = (i + d + buttons.length) % buttons.length; buttons[j].focus(); mark(j); onPick(buttons[j].getAttribute(attr)); }
			});
		});
		return function setActive(v) { buttons.forEach(function (b, i) { if (b.getAttribute(attr) === v) mark(i); }); };
	}
	function switchBtn(btn, textEl, onLabel, offLabel, onChange) {
		btn.addEventListener('click', function () {
			var on = btn.getAttribute('aria-checked') !== 'true';
			btn.setAttribute('aria-checked', on ? 'true' : 'false');
			textEl.textContent = on ? onLabel : offLabel;
			onChange(on);
		});
	}

	/* ---------- engine runner: Web Worker with an inline (same-thread) fallback ---------- */
	function Runner(cfg, onmsg, onreset) {
		var self = this;
		this.onmsg = onmsg; this.onreset = onreset; this.cfg = cfg; this.inline = null;
		try {
			if (!window.Worker || !cfg.worker) throw new Error('no worker');
			this.w = new Worker(cfg.worker);
			this.w.onmessage = function (e) { onmsg(e.data); };
			this.w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); self.toInline(true); };
		} catch (e) { this.w = null; this.toInline(false); }
	}
	Runner.prototype.toInline = function (reset) {
		var self = this, cfg = this.cfg;
		if (this.inline || this.loadingInline) return;
		if (this.w) { try { this.w.terminate(); } catch (e) {} this.w = null; }
		this.loadingInline = true; this.queue = [];
		function ready() {
			self.inline = window.OPCEngine.Host(function (m) { setTimeout(function () { self.onmsg(m); }, 0); }, function (cb) {
				window.lamejs ? cb(null) : loadScript(cfg.lame, cb);
			});
			self.loadingInline = false;
			if (reset && self.onreset) { self.queue = []; self.onreset(); }
			else { var q = self.queue; self.queue = []; q.forEach(function (m) { self.inline.handle(m); }); }
		}
		if (window.OPCEngine && window.OPCEngine.Host) ready();
		else loadScript(cfg.engine, function (err) { if (err) { self.loadingInline = false; self.onmsg({ type: 'fatal' }); } else ready(); });
	};
	Runner.prototype.post = function (msg, transfer) {
		if (this.inline) this.inline.handle(msg);
		else if (this.loadingInline) this.queue.push(msg);
		else { try { this.w.postMessage(msg, transfer || []); } catch (e) { this.toInline(true); } }
	};

	/* ---------- the tool ---------- */
	function PitchChanger(root) {
		var self = this;
		this.root = root; root.opcPc = this;
		try { this.cfg = JSON.parse(root.getAttribute('data-cfg') || '{}'); } catch (e) { this.cfg = {}; }
		this.maxMB = this.cfg.maxMB || 200; this.maxSec = this.cfg.maxSec || 600;
		function el(sel) { return qs(root, sel); }
		this.el = {
			file: el('[data-pc-file]'), droptitle: el('[data-pc-droptitle]'),
			loadbar: el('[data-pc-loadbar]'), status: el('[data-pc-status]'),
			target: el('[data-pc-target]'), keymeta: el('[data-pc-keymeta]'), detect: el('[data-pc-detect]'),
			len: el('[data-pc-len]'), fmtinfo: el('[data-pc-fmtinfo]'), fname: el('[data-pc-fname]'),
			now: el('[data-pc-now]'), wave: el('[data-pc-wave]'), cv: el('[data-pc-canvas]'), waveempty: el('[data-pc-waveempty]'),
			play: el('[data-pc-play]'), playicon: el('[data-pc-playicon]'), playtext: el('[data-pc-playtext]'),
			ab: qsa(root, '[data-pc-ab]'), time: el('[data-pc-time]'),
			semi: el('[data-pc-semi]'), semiout: el('[data-pc-semiout]'), steps: qsa(root, '[data-pc-step]'),
			speed: el('[data-pc-speed]'), speedout: el('[data-pc-speedout]'), speedtext: el('[data-pc-speedtext]'),
			reset: el('[data-pc-reset]'),
			fmts: qsa(root, '[data-pc-fmt]'), dl: el('[data-pc-dl]'), dltext: el('[data-pc-dltext]'), dlinfo: el('[data-pc-dlinfo]'),
			dlbar: el('[data-pc-dlbar]'), savewrap: el('[data-pc-savewrap]'), save: el('[data-pc-save]'),
			cents: el('[data-pc-cents]'), centsout: el('[data-pc-centsout]'),
			formant: el('[data-pc-formant]'), formanttext: el('[data-pc-formanttext]'),
			autokey: el('[data-pc-autokey]'), autokeytext: el('[data-pc-autokeytext]'),
			videoext: el('[data-pc-videoext]'), videoexttext: el('[data-pc-videoexttext]')
		};
		this.s = { semi: 0, cents: 0, tempo: 100 };
		this.formant = false; this.autoKey = true; this.videoExt = true;
		this.fmt = 'mp3'; this.origK = null; this.detK = null; this.an = null; this.analysing = false;
		this.gen = 0; this.seq = 0; this.pend = {}; this.rkey = ''; this.full = null; this.sec = null;
		this.which = 'b'; this.playing = false; this.pos = 0; this.cur = null;
		if (!ACtx || !OACtx || !window.Promise) {
			this.say('Your browser cannot process audio here. Use a current version of Chrome, Edge, Firefox or Safari.', 'error');
			this.el.file.disabled = true;
			return;
		}
		this.runner = null;
		this.bind();
		this.update();
		this.draw();
		var self2 = this;
		if (window.ResizeObserver) new ResizeObserver(function () { self2.draw(); }).observe(this.el.wave);
		else window.addEventListener('resize', function () { self2.draw(); });
	}
	var P = PitchChanger.prototype;

	P.say = function (msg, kind) { this.el.status.textContent = msg; if (kind) this.el.status.setAttribute('data-kind', kind); else this.el.status.removeAttribute('data-kind'); };
	P.bar = function (el, v) {
		if (v == null) { el.hidden = true; el.classList.remove('is-busy'); return; }
		el.hidden = false;
		if (v < 0) el.classList.add('is-busy');
		else { el.classList.remove('is-busy'); el.firstChild.style.width = Math.round(100 * v) + '%'; }
	};
	P.ac = function () { if (!this.ctx) this.ctx = new ACtx(); if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume(); return this.ctx; };
	P.engine = function () { var self = this; return this.runner || (this.runner = new Runner(this.cfg, function (m) { self.onMsg(m); }, function () { self.resync(); })); };
	P.keyOf = function () { return this.s.semi + '|' + this.s.cents + '|' + this.s.tempo + '|' + (this.formant ? 1 : 0); };
	P.isIdentity = function () { return !this.s.semi && !this.s.cents && this.s.tempo === 100; };

	/* ---------- controls ---------- */
	P.bind = function () {
		var self = this, el = this.el, root = this.root;
		el.file.addEventListener('change', function () { if (el.file.files && el.file.files[0]) self.openFile(el.file.files[0]); el.file.value = ''; });
		['dragenter', 'dragover'].forEach(function (ev) {
			root.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); root.classList.add('is-drag'); } });
		});
		['dragleave', 'drop'].forEach(function (ev) {
			root.addEventListener(ev, function (e) { if (ev === 'dragleave' && root.contains(e.relatedTarget)) return; root.classList.remove('is-drag'); });
		});
		root.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) { e.preventDefault(); self.openFile(e.dataTransfer.files[0]); } });

		el.play.addEventListener('click', function () { self.ac(); if (self.playing || self.waiting) self.stop(true); else self.play(); });
		segGroup(el.ab, 'data-pc-ab', function (v) { self.setWhich(v); });
		this.checkFmt = segGroup(el.fmts, 'data-pc-fmt', function (v) { self.fmt = v; self.updateExport(); });

		el.steps.forEach(function (b) { b.addEventListener('click', function () { self.set({ semi: self.s.semi + (+b.getAttribute('data-pc-step')) }); }); });
		el.semi.addEventListener('input', function () { self.set({ semi: +el.semi.value }); });
		el.speed.addEventListener('input', function () { self.set({ tempo: +el.speed.value }); });
		el.cents.addEventListener('input', function () { self.set({ cents: +el.cents.value }); });
		el.reset.addEventListener('click', function () { self.set({ semi: 0, cents: 0, tempo: 100 }); });
		el.detect.addEventListener('click', function () { if (self.buf && !self.analysing) self.analyse(self.gen); });

		switchBtn(el.formant, el.formanttext, 'On', 'Off', function (on) { self.formant = on; self.scheduleRender(); });
		switchBtn(el.autokey, el.autokeytext, 'On', 'Off', function (on) {
			self.autoKey = on; el.detect.hidden = !on ? false : true;
			if (on && self.buf && !self.an && !self.analysing) self.analyse(self.gen);
		});
		switchBtn(el.videoext, el.videoexttext, 'On', 'Off', function (on) { self.videoExt = on; });

		el.dl.addEventListener('click', function () { self.download(); });

		var wave = el.wave;
		wave.addEventListener('click', function (e) {
			if (!self.buf) return;
			var r = wave.getBoundingClientRect();
			self.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * self.dur);
		});
		wave.addEventListener('keydown', function (e) {
			if (!self.buf) return;
			var p = self.curPos();
			if (e.key === 'ArrowRight' || e.key === 'ArrowUp') self.seek(p + 5);
			else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') self.seek(p - 5);
			else if (e.key === 'Home') self.seek(0);
			else if (e.key === 'End') self.seek(Math.max(0, self.dur - 1));
			else { if (e.key !== ' ' && e.key !== 'Enter') return; self.ac(); if (self.playing || self.waiting) self.stop(true); else self.play(); }
			e.preventDefault();
		});
	};

	P.set = function (v) {
		var s = this.s;
		function clamp(n, a, b) { n = Math.round(+n); return isFinite(n) ? Math.max(a, Math.min(b, n)) : a; }
		if (v.semi !== undefined) s.semi = clamp(v.semi, -24, 24);
		if (v.cents !== undefined) s.cents = clamp(v.cents, -50, 50);
		if (v.tempo !== undefined) s.tempo = clamp(v.tempo, 25, 400);
		this.update();
		this.scheduleRender();
	};

	/* ---------- UI sync ---------- */
	P.update = function () {
		var s = this.s, el = this.el, known = this.origK != null;
		if (String(el.semi.value) !== String(s.semi)) el.semi.value = s.semi;
		if (+el.speed.value !== s.tempo) el.speed.value = s.tempo;
		if (+el.cents.value !== s.cents) el.cents.value = s.cents;
		el.semiout.textContent = signed(s.semi) + ' st' + (s.cents ? ' ' + signed(s.cents) + 'c' : '');
		el.centsout.textContent = signed(s.cents) + ' cents';

		if (known) {
			var newK = Lite.transposeKey(this.origK, s.semi);
			var kn = Lite.keyName;
			var origName = kn(this.origK).name, newName = kn(newK).name;
			if (s.semi || s.cents) { el.target.textContent = origName + ' → ' + newName + ' (' + shiftPhrase(s.semi, s.cents) + ')'; el.target.parentNode.setAttribute('data-kind', 'changed'); }
			else { el.target.textContent = 'Same key (' + origName + ')'; el.target.parentNode.setAttribute('data-kind', 'same'); }
		} else {
			el.target.textContent = s.semi || s.cents ? shiftPhrase(s.semi, s.cents) : (this.buf ? 'Key not detected' : 'Open a song to detect its key');
			el.target.parentNode.setAttribute('data-kind', 'empty');
		}

		this.updateSpeedText();
		this.nowLine();
		this.updateExport();
		this.draw();
	};
	P.updateSpeedText = function () {
		var el = this.el, s = this.s;
		el.speedout.textContent = s.tempo + '%' + (s.tempo === 100 ? ' (original speed)' : '');
		if (s.tempo === 100) { el.speedtext.textContent = '100% keeps the original length. Changing the tempo does not change the pitch.'; return; }
		var faster = s.tempo > 100;
		var txt = s.tempo + '% ' + (faster ? 'is faster' : 'is slower') + ' and does not change the pitch.';
		if (this.dur) txt += ' New length: ' + fmtTime(this.dur * 100 / s.tempo) + ' (was ' + fmtTime(this.dur) + ').';
		el.speedtext.textContent = txt;
	};
	P.nowLine = function () {
		var el = this.el;
		if (!this.buf) { el.now.textContent = 'Open a song to listen to it here.'; el.now.removeAttribute('data-which'); return; }
		var label;
		if (this.which === 'a') label = 'A: Before (the original)';
		else label = 'B: After' + (this.isIdentity() ? ' (no change yet)' : ' (' + this.keyLabel() + ')');
		el.now.innerHTML = '';
		el.now.appendChild(document.createTextNode(this.playing ? 'Playing: ' : this.waiting ? 'Preparing: ' : 'Selected: '));
		var b = document.createElement('b'); b.textContent = label; el.now.appendChild(b);
		if (!this.playing && !this.waiting) el.now.appendChild(document.createTextNode('. Press Play to listen.'));
		el.now.setAttribute('data-which', this.which);
	};
	P.keyLabel = function () {
		var s = this.s, parts = [];
		if (s.semi || s.cents) parts.push(shiftPhrase(s.semi, s.cents));
		if (s.tempo !== 100) parts.push(s.tempo + '% tempo');
		return parts.length ? parts.join(', ') : 'no change';
	};

	/* ---------- open / decode ---------- */
	function isVideoFile(sniffed, mime, name) {
		return /^(mp4|mov|webm)$/.test(sniffed) && /video|\.(mp4|m4v|mov|webm)$/i.test((mime || '') + ' ' + (name || ''));
	}
	P.openFile = function (file) {
		var self = this, gen = ++this.gen;
		this.stop(false);
		if (file.size > 1048576 * this.maxMB) { this.say('This file is ' + fmtSize(file.size) + '. The limit is ' + this.maxMB + ' MB: use a shorter or more compressed file.', 'error'); return; }
		if (/^image\/|^text\/|pdf$/.test(file.type || '')) { this.say('This is not an audio or video file. Open an MP3, WAV, M4A, OGG, FLAC, MP4, MOV or WebM file.', 'error'); return; }
		this.engine();
		this.say('Reading ' + file.name + '…', 'busy');
		this.bar(this.el.loadbar, 0);
		var reader = new FileReader();
		reader.onprogress = function (e) { if (gen === self.gen && e.lengthComputable) { self.bar(self.el.loadbar, 0.3 * e.loaded / e.total); } };
		reader.onerror = function () { if (gen === self.gen) { self.bar(self.el.loadbar, null); self.say('This file could not be read. Try again or choose another file.', 'error'); } };
		reader.onload = function () { if (gen === self.gen) self.decode(reader.result, file, gen); };
		reader.readAsArrayBuffer(file);
	};
	P.decode = function (ab, file, gen) {
		var self = this, rate = 0, type = '';
		try { rate = Lite.sniffRate(ab); type = Lite.sniffType(ab); } catch (e) {}
		var video = isVideoFile(type, file.type, file.name);
		if (video && !this.videoExt) {
			this.say('This tool works with audio. Turn on "Video-audio extraction" in More options to use this video’s audio track, or use the Video Pitch Changer for a shifted video file.', 'error');
			return;
		}
		function decodeAt(ctx, buf) { return new Promise(function (resolve, reject) { var p; try { p = ctx.decodeAudioData(buf, resolve, reject); } catch (e) { reject(e); return; } if (p && p.then) p.then(resolve, reject); }); }
		this.say('Decoding ' + (video ? 'the audio track of ' : '') + file.name + '…', 'busy');
		this.bar(this.el.loadbar, -1);
		var first;
		if (rate >= 8000 && rate <= 192000) { try { first = decodeAt(new OACtx(1, 1, rate), ab); } catch (e) { first = null; } }
		(first || Promise.reject(new Error('skip'))).catch(function () {
			return (file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); })).then(function (buf) { return decodeAt(self.ac(), buf); });
		}).then(function (buf) {
			if (gen !== self.gen) return;
			if (!buf || !buf.length || buf.duration < 0.5) throw new Error('empty');
			if (buf.duration > self.maxSec + 1) { self.bar(self.el.loadbar, null); self.say('This file is ' + fmtTime(buf.duration) + ' long. The limit is ' + Math.round(self.maxSec / 60) + ' minutes: cut it first.', 'error'); return; }
			self.setBuffer(buf, file.name, gen, video, type);
		}).catch(function () {
			if (gen !== self.gen) return;
			self.bar(self.el.loadbar, null);
			self.say(video ? 'The audio of this video could not be read in this browser. Try Chrome or Edge, or convert it to MP3 first.' : 'This file could not be decoded. Use an MP3, WAV, M4A, OGG or FLAC file (some browsers cannot open every format, e.g. OGG in older Safari).', 'error');
		});
	};
	P.setBuffer = function (buf, name, gen, fromVideo, type) {
		this.stop(false); this.cancelAll();
		this.buf = buf; this.sr = buf.sampleRate; this.C = buf.numberOfChannels; this.dur = buf.duration;
		this.name = String(name || 'song').replace(/\.[a-z0-9]{2,5}$/i, '');
		this.chs = []; for (var i = 0; i < this.C; i++) this.chs.push(buf.getChannelData(i));
		this.peaks = null; this.full = null; this.sec = null; this.rkey = ''; this.pos = 0;
		this.an = null; this.detK = null; this.origK = null;
		var el = this.el;
		this.root.classList.add('is-loaded');
		el.droptitle.textContent = 'Open another song';
		el.waveempty.hidden = true; el.play.disabled = false;
		el.fname.textContent = this.name; el.fname.title = this.name;
		el.len.textContent = fmtTime(this.dur);
		el.fmtinfo.textContent = (type ? type.toUpperCase() : 'Audio') + (fromVideo ? ' (video audio)' : '') + ' · ' + fmtHz(this.sr) + ' · ' + (this.C === 1 ? 'mono' : 'stereo');
		el.wave.setAttribute('aria-valuemax', String(Math.round(this.dur)));
		el.keymeta.textContent = this.autoKey ? 'Finding the key…' : 'Key detection is off. Turn it on in More options, or press "Detect key now".';
		el.detect.hidden = this.autoKey;
		this.sendSource();
		if (this.autoKey) this.analyse(gen);
		this.say('Loaded ' + this.name + (fromVideo ? ' (audio track of the video)' : '') + ' · ' + fmtTime(this.dur) + '. Now set the pitch and tempo, then play or download.', 'ok');
		this.update(); this.ui(); this.draw();
		this.requestRender();
	};
	P.sendSource = function () {
		if (!this.buf) return;
		if (this.engine().inline) this.engine().post({ cmd: 'load', chs: this.chs, sr: this.sr });
		else { var chs = this.chs.map(function (c) { return c.slice(0); }); this.engine().post({ cmd: 'load', chs: chs, sr: this.sr }, chs.map(function (c) { return c.buffer; })); }
	};
	P.resync = function () { if (this.buf) { this.pend = {}; this.sendSource(); if (!this.an && this.autoKey) this.analyse(this.gen); this.rkey = ''; this.requestRender(); } };

	/* ---------- key detection ---------- */
	P.analyse = function (gen) {
		var self = this, n = Math.max(1, Math.ceil(22050 * this.dur)), octx;
		this.analysing = true;
		try { octx = new OACtx(1, n, 22050); } catch (e) { octx = null; }
		var p;
		if (octx) { var src = octx.createBufferSource(); src.buffer = this.buf; src.connect(octx.destination); src.start(0); p = renderOffline(octx).then(function (b) { return b.getChannelData(0); }); }
		else p = Promise.reject(new Error('no offline context'));
		p.then(function (mono) {
			if (gen !== self.gen) return;
			var id = 'an' + (++self.seq), copy = mono.slice(0);
			self.pend[id] = { kind: 'analyse', gen: gen };
			self.engine().post({ cmd: 'analyse', id: id, pri: 1, mono: copy, sr: 22050, bpm: false }, self.engine().inline ? [] : [copy.buffer]);
		}).catch(function () {
			if (gen !== self.gen) return;
			self.analysing = false;
			self.el.keymeta.textContent = 'The key could not be detected in this browser. Turn on "Auto key-detect" is unavailable here; the pitch shift still works.';
			self.bar(self.el.loadbar, null);
		});
	};
	P.showAnalysis = function (r) {
		var el = this.el; this.an = r; this.analysing = false; this.bar(el.loadbar, null);
		var known = r.key && !/^(unclear|silent|short)$/.test(r.keyNone || '');
		this.detK = known ? r.key.k : null; this.origK = this.detK;
		if (known) {
			var conf = r.keyConfidence >= 70 ? 'high' : r.keyConfidence >= 40 ? 'medium' : 'low';
			el.keymeta.textContent = 'Detected with ' + r.keyConfidence + '% confidence (' + conf + ').' + (r.keyChange ? ' The key seems to change at ' + fmtTime(r.keyChange.start) + '.' : '');
		} else {
			el.keymeta.textContent = r.keyNone === 'silent' ? 'The song is almost silent, so the key could not be detected. The pitch shift still works.' : 'Not enough clear notes to name the key (drums, speech or noise). The pitch shift still works either way.';
		}
		this.say('Ready: ' + (known ? r.key.name : 'key unclear') + '. Set the pitch and tempo, then play or download.', 'ok');
		this.update();
	};

	/* ---------- worker messages ---------- */
	P.onMsg = function (msg) {
		if (msg.type === 'fatal') { this.say('The audio engine could not be loaded. Check your connection and reload the page.', 'error'); this.bar(this.el.loadbar, null); return; }
		var job = this.pend[msg.id];
		if (msg.type === 'loaded' || !job) return;
		if (msg.type === 'progress') {
			if (job.gen !== this.gen) return;
			if (job.kind === 'analyse') { this.bar(this.el.loadbar, 0.3 + 0.7 * msg.p); this.el.keymeta.textContent = 'Finding the key… ' + Math.round(100 * msg.p) + '%'; }
			else if (job.kind === 'render' && job.full && job.key === this.rkey) { this.fullProg = msg.p; this.updateExport(); if (this.waiting) this.say('Preparing the change… ' + Math.round(100 * msg.p) + '%', 'busy'); }
			else if (job.kind === 'export') { this.bar(this.el.dlbar, msg.p); this.el.dlinfo.textContent = 'Encoding the MP3… ' + Math.round(100 * msg.p) + '%'; }
			return;
		}
		delete this.pend[msg.id];
		if (job.gen !== this.gen) return;
		if (msg.type === 'error') {
			if (job.kind === 'export') { this.bar(this.el.dlbar, null); this.busyExport = false; this.updateExport(); this.say(job.fmt === 'mp3' ? 'The MP3 could not be created (' + msg.message + '). Choose WAV instead.' : 'The WAV file could not be written (' + msg.message + ').', 'error'); }
			else if (job.kind === 'analyse') { this.analysing = false; this.el.keymeta.textContent = 'The key could not be detected. The pitch shift still works.'; this.bar(this.el.loadbar, null); }
			else this.say('Processing failed: ' + msg.message + '. Reload the page and try again.', 'error');
			return;
		}
		if (job.kind === 'analyse') this.showAnalysis(msg.result);
		else if (job.kind === 'render') this.onRender(msg, job);
		else if (job.kind === 'export') this.onExport(msg, job);
	};
	P.cancelAll = function () { var ids = Object.keys(this.pend); if (ids.length) this.engine().post({ cmd: 'cancel', ids: ids }); this.pend = {}; };
	P.cancelRenders = function () { var self = this, ids = Object.keys(this.pend).filter(function (id) { return self.pend[id].kind === 'render'; }); if (ids.length) this.engine().post({ cmd: 'cancel', ids: ids }); ids.forEach(function (id) { delete self.pend[id]; }); };
	P.scheduleRender = function () { var self = this; clearTimeout(this.rt); this.rt = setTimeout(function () { self.requestRender(); }, 150); };
	P.jobOpts = function () { var s = this.s; return { semi: s.semi, cents: s.cents, tempo: s.tempo / 100, mode: 'keep', formant: this.formant, quality: 'music' }; };
	P.requestRender = function (force) {
		if (!this.buf) return;
		var key = this.keyOf();
		if (this.isIdentity()) { this.cancelRenders(); this.rkey = key; this.full = null; this.sec = null; this.updateExport(); this.bReady(); return; }
		if (!force && this.rkey === key) return;
		if (force) {
			var self = this, partial = Object.keys(this.pend).filter(function (id) { var j = self.pend[id]; return j.kind === 'render' && !j.full; });
			if (partial.length) { this.engine().post({ cmd: 'cancel', ids: partial }); partial.forEach(function (id) { delete self.pend[id]; }); }
		} else { this.cancelRenders(); this.rkey = key; this.full = null; this.sec = null; this.fullProg = 0; }
		var opts = this.jobOpts();
		if (this.dur > 40) {
			var from = Math.max(0, (this.waiting ? this.pos : this.curPos()) - 0.05), to = Math.min(this.dur, from + 25);
			if (to - from < 25) from = Math.max(0, to - 25);
			var po = this.jobOpts(); po.from = from; po.to = to;
			this.post('render', po, 0, { key: key, full: false });
		}
		if (!force) this.post('render', opts, 2, { key: key, full: true });
		this.updateExport();
	};
	P.post = function (kind, opts, pri, extra) {
		var id = kind[0] + (++this.seq);
		this.pend[id] = { kind: kind, gen: this.gen, key: extra.key, full: extra.full };
		this.engine().post({ cmd: 'render', id: id, pri: pri, opts: opts });
		return id;
	};
	P.onRender = function (msg, job) {
		if (job.key !== this.rkey) return;
		var buf = audioBufferFrom(msg.chs, msg.sr, this.ctx || this.ac());
		if (job.full) { this.full = { key: job.key, buf: buf, chs: msg.chs, gain: msg.gain, peak: msg.peak }; this.sec = null; this.fullProg = 1; }
		else this.sec = { key: job.key, from: msg.from, to: msg.to, buf: buf };
		this.bReady(); this.updateExport();
		if (job.full && this.pendingExport) { this.pendingExport = false; this.download(); }
	};

	/* ---------- transport (A/B playback) ---------- */
	P.bReady = function () {
		if (this.which !== 'b') return;
		if (this.waiting) { if (this.srcB(this.pos)) { this.waiting = false; this.start(this.pos); this.ui(); this.say('Playing the changed audio.', 'ok'); } }
		else if (this.playing && this.cur && this.cur.stale !== this.bstamp()) this.start(this.curPos());
	};
	P.bstamp = function () { return this.isIdentity() ? 'id' : (this.full && this.full.key === this.rkey ? 'f' + this.rkey : (this.sec && this.sec.key === this.rkey ? 's' + this.rkey + this.sec.from : 'none')); };
	P.srcB = function (t) {
		if (this.isIdentity()) return { buf: this.buf, t0: 0, end: this.dur, full: true };
		if (this.full && this.full.key === this.rkey) return { buf: this.full.buf, t0: 0, end: this.dur, full: true };
		if (this.sec && this.sec.key === this.rkey && t >= this.sec.from - 0.02 && t < this.sec.to - 0.25) return { buf: this.sec.buf, t0: this.sec.from, end: this.sec.to, full: false };
		return null;
	};
	P.curPos = function () { return this.playing && this.cur ? Math.min(this.cur.pos0 + (this.ctx.currentTime - this.cur.t0), this.dur) : this.pos; };
	P.start = function (t) {
		if (this.which === 'b' && this.buf && this.rkey !== this.keyOf()) { clearTimeout(this.rt); this.requestRender(); }
		var self = this, ctx = this.ac();
		var src = this.which === 'a' ? { buf: this.buf, t0: 0, end: this.dur, full: true } : this.srcB(t);
		if (t >= this.dur - 0.05) t = 0;
		if (this.which === 'b' && !src) src = this.srcB(t);
		var prev = this.cur;
		if (!src) {
			if (prev) this.stopSrc(prev, true);
			this.cur = null; this.playing = false; this.waiting = true; this.pos = t;
			this.requestRender(true);
			this.say('Preparing the changed audio from ' + fmtTime(t) + '…', 'busy'); this.ui();
			return false;
		}
		var node = ctx.createBufferSource(), gain = ctx.createGain(), t0 = ctx.currentTime;
		node.buffer = src.buf; node.connect(gain); gain.connect(ctx.destination);
		gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + 0.04);
		node.start(t0, Math.max(0, t - src.t0));
		var cur = { node: node, g: gain, pos0: t, t0: t0, full: src.full, end: src.end, stale: this.which === 'a' ? 'a' : this.bstamp() };
		node.onended = function () {
			if (self.cur !== cur) return;
			self.cur = null;
			if (!cur.full && cur.end < self.dur - 0.3) {
				self.playing = false; self.waiting = true; self.pos = cur.end;
				if (self.srcB(self.pos)) { self.waiting = false; self.start(self.pos); return; }
				self.say('Preparing the rest of the song… ' + Math.round(100 * (self.fullProg || 0)) + '%', 'busy');
			} else { self.playing = false; self.pos = 0; }
			self.ui(); self.draw();
		};
		if (prev) this.stopSrc(prev, true);
		this.cur = cur; this.playing = true; this.waiting = false; this.ui(); this.tick();
		return true;
	};
	P.stopSrc = function (cur, fade) {
		cur.node.onended = null;
		try {
			if (fade) { var t = this.ctx.currentTime; cur.g.gain.cancelScheduledValues(t); cur.g.gain.setValueAtTime(cur.g.gain.value, t); cur.g.gain.linearRampToValueAtTime(0, t + 0.04); cur.node.stop(t + 0.05); }
			else cur.node.stop();
		} catch (e) {}
	};
	P.play = function () { if (this.buf) { this.ac(); this.start(this.pos); } };
	P.stop = function (keepPos) {
		var self = this;
		if (this.playing && this.cur) { this.pos = keepPos ? this.curPos() : 0; this.stopSrc(this.cur, true); }
		else if (!keepPos) this.pos = 0;
		this.cur = null; this.playing = false; this.waiting = false; this.ui(); this.draw();
		clearTimeout(this.idleT);
		this.idleT = setTimeout(function () { if (!self.playing && self.ctx && self.ctx.state === 'running' && self.ctx.suspend) self.ctx.suspend(); }, 3000);
	};
	P.seek = function (t) {
		this.pos = Math.max(0, Math.min(this.dur || 0, t));
		if (this.playing) this.start(this.pos);
		else if (this.which === 'b' && !this.srcB(this.pos) && !this.isIdentity() && this.full === null) this.requestRender(true);
		this.ui(); this.draw();
	};
	P.setWhich = function (v) {
		if (v === this.which) return;
		var t = this.curPos(); this.which = v;
		if (this.playing || this.waiting) { this.pos = t; this.start(t); }
		this.ui(); this.draw();
	};
	P.ui = function () {
		var el = this.el, busy = this.playing || this.waiting, t = this.curPos();
		el.playtext.textContent = busy ? 'Pause' : 'Play';
		el.playicon.innerHTML = busy ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
		this.nowLine();
		el.time.textContent = fmtTime(t) + ' / ' + fmtTime(this.dur || 0);
		el.wave.setAttribute('aria-valuenow', String(Math.round(t)));
		el.wave.setAttribute('aria-valuetext', fmtTime(t) + ' of ' + fmtTime(this.dur || 0));
	};
	P.tick = function () {
		var self = this;
		if (this.raf) return;
		(function step() { if (self.playing) { self.el.time.textContent = fmtTime(self.curPos()) + ' / ' + fmtTime(self.dur); self.draw(); self.raf = requestAnimationFrame(step); } else self.raf = 0; })();
	};

	/* ---------- waveform ---------- */
	P.peaksFor = function (cols) {
		if (this.peaks && this.peaks.cols === cols) return this.peaks;
		var total = this.buf.length, mn = new Float32Array(cols), mx = new Float32Array(cols), C = this.C, chs = this.chs;
		for (var i = 0; i < cols; i++) {
			var a = Math.floor(i * total / cols), b = Math.max(a + 1, Math.floor((i + 1) * total / cols)), lo = 0, hi = 0, step = Math.max(1, Math.floor((b - a) / 300));
			for (var j = a; j < b; j += step) { var v = 0; for (var c = 0; c < C; c++) v += chs[c][j]; v /= C; if (v < lo) lo = v; if (v > hi) hi = v; }
			mn[i] = lo; mx[i] = hi;
		}
		this.peaks = { cols: cols, mn: mn, mx: mx };
		return this.peaks;
	};
	P.draw = function () {
		var canvas = this.el.cv, w = this.el.wave.clientWidth, h = this.el.wave.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
		if (!w || !h) return;
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
		var ctx = canvas.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
		if (!this.buf) return;
		var cols = Math.max(40, Math.floor(w)), pk = this.peaksFor(cols), x = this.dur ? this.curPos() / this.dur * w : 0;
		var midY = h / 2, halfH = h / 2 - 3, colA = this.which === 'a' ? '#ffffff' : '#e0f7ff', colB = this.which === 'a' ? '#94a3b8' : '#22b8f0';
		for (var i = 0; i < cols; i++) {
			var top = midY - pk.mx[i] * halfH, bot = midY - pk.mn[i] * halfH;
			ctx.fillStyle = i * (w / cols) < x ? colA : colB;
			ctx.fillRect(i * w / cols, top, Math.max(1, w / cols - 0.3), Math.max(1, bot - top));
		}
		ctx.fillStyle = '#fbbf24'; ctx.fillRect(Math.round(x) - 1, 0, 3, h);
	};

	/* ---------- export ---------- */
	P.exportReady = function () { return this.buf && (this.isIdentity() || (this.full && this.full.key === this.rkey && this.rkey === this.keyOf())); };
	P.fileName = function (ext) {
		var keyNm = this.origK != null ? Lite.keyName(Lite.transposeKey(this.origK, this.s.semi)).name : '';
		var base = Lite.fileName(this.name || 'song', keyNm, this.s.semi, this.s.cents, ext);
		if (this.s.tempo !== 100) base = base.replace(/\.[a-z0-9]+$/i, function (m) { return '_' + this.s.tempo + 'pct' + m; }.bind(this));
		return base;
	};
	P.updateExport = function () {
		var el = this.el, fmt = this.fmt;
		el.dltext.textContent = 'Download ' + fmt.toUpperCase();
		if (!this.buf) { el.dl.disabled = true; el.dlinfo.textContent = 'Open a song first. The file name gets the key and shift.'; return; }
		if (this.busyExport) return;
		var ready = this.exportReady(), dur = this.s.tempo !== 100 ? this.dur * 100 / this.s.tempo : this.dur;
		var bytes = fmt === 'mp3' ? 192000 * dur / 8 : dur * this.sr * Math.min(this.C, fmt === 'mp3' ? 2 : 8) * 2;
		el.dl.disabled = false;
		el.dlinfo.innerHTML = ''; el.dlinfo.appendChild(document.createTextNode('File: '));
		var b = document.createElement('b'); b.textContent = this.fileName(fmt); el.dlinfo.appendChild(b);
		el.dlinfo.appendChild(document.createTextNode(' · File size ≈ ' + fmtSize(bytes) + ' · Length ' + fmtTime(dur) + (this.isIdentity() ? ' · No change chosen yet.' : ready ? ' · Ready to download.' : ' · Preparing: ' + Math.round(100 * (this.fullProg || 0)) + '%')));
	};
	P.download = function () {
		var self = this, el = this.el, tag = this.keyOf() + '|' + this.fmt + '|' + this.gen;
		if (!this.buf || this.busyExport) return;
		if (this.lastExport && this.lastExport.tag === tag && Date.now() - this.lastExport.t < 1500) return;
		if (!this.exportReady()) { this.pendingExport = true; if (this.rkey !== this.keyOf()) { clearTimeout(this.rt); this.requestRender(); } this.say('Preparing the whole file for download… it starts by itself when ready.', 'busy'); return; }
		var chs = this.isIdentity() ? this.chs : this.full.chs, name = this.fileName(this.fmt), sr = this.sr, fmt = this.fmt;
		this.busyExport = true; el.dl.disabled = true; this.bar(el.dlbar, fmt === 'mp3' ? 0 : -1);
		el.dlinfo.textContent = fmt === 'mp3' ? 'Encoding the MP3… 0%' : 'Writing the WAV file…';
		function send(chans, rate) {
			var id = fmt[0] + (++self.seq), msg = { cmd: fmt, id: id, pri: 3, chs: chans, sr: rate };
			if (fmt === 'mp3') { msg.kbps = 192; msg.gain = -0.891; }
			self.pend[id] = { kind: 'export', gen: self.gen, name: name, fmt: fmt, tag: tag };
			self.engine().post(msg, self.engine().inline ? [] : chans.map(function (c) { return c.buffer; }));
		}
		if (fmt === 'wav' || Lite.MP3_RATES.indexOf(sr) >= 0) send(chs.map(function (c) { return c.slice(0); }), sr);
		else {
			var target = sr > 48000 ? 48000 : 44100, octx = new OACtx(Math.min(2, chs.length), Math.ceil(chs[0].length * target / sr), target);
			var node = octx.createBufferSource(); node.buffer = audioBufferFrom(chs, sr, this.ac()); node.connect(octx.destination); node.start(0);
			renderOffline(octx).then(function (buf) {
				var out = []; for (var i = 0; i < buf.numberOfChannels; i++) out.push(buf.getChannelData(i).slice(0));
				send(out, target);
			}).catch(function () { self.busyExport = false; self.bar(el.dlbar, null); self.updateExport(); self.say('This sample rate cannot be saved as MP3 here. Choose WAV.', 'error'); });
		}
	};
	P.onExport = function (msg, job) {
		this.busyExport = false; this.bar(this.el.dlbar, null);
		this.saveBlob(new Blob([msg.data], { type: job.fmt === 'mp3' ? 'audio/mpeg' : 'audio/wav' }), job.name, job.tag);
	};
	P.saveBlob = function (blob, name, tag) {
		var el = this.el;
		if (this.saveUrl) URL.revokeObjectURL(this.saveUrl);
		var url = this.saveUrl = URL.createObjectURL(blob);
		var a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
		document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 2000);
		el.save.href = url; el.save.setAttribute('download', name);
		el.save.textContent = 'Save ' + name + ' (' + fmtSize(blob.size) + ')';
		el.savewrap.hidden = false;
		this.lastExport = { name: name, bytes: blob.size, t: Date.now(), tag: tag };
		this.updateExport();
		this.say('Downloaded ' + name + ' (' + fmtSize(blob.size) + '). If nothing happened, use the Save link under the button.', 'ok');
	};

	/* ---------- boot ---------- */
	function initAll() { qsa(document, '[data-opc-pc]').forEach(function (el) { if (!el.opcPc) new PitchChanger(el); }); }
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll); else initAll();
	window.OPCPitchChanger = { version: '2.0.0', init: initAll };
}();

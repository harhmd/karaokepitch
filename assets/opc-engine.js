/*! opc-engine 1.0.0 | onlinepitchchanger.com | pitch shift ±24 semitones + cents with the tempo kept, independent tempo, formant correction, key + tuning + BPM detection, WAV and MP3 export | GPL-2.0-or-later.
 * Pitch shift, key detection and BPM detection derive from the tested pitchdetector.com engines (Pitch Shifter 2.0.0, Song Key Finder 2.0.0, BPM Detector 2.0.0). MP3 encoding uses lamejs 1.2.1 (LGPL-3.0), loaded separately from vendor/. */
(function (root) {
/* ---------- opc-engine lite: the small part the page itself needs (key names, semitone maths, file names, format sniffing).
 * No DSP here: pitch shifting, key/BPM detection and encoding run in the worker (opc-engine.js). ---------- */
var OPCLite = (function () {
	var VERSION = '1.0.0';
	var IV = ['unison', 'half step', 'whole step', 'minor third', 'major third', 'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh', 'octave'];
	/* conventional key names (fewest accidentals; F♯ major and E♭ minor for the 6-accidental ties) — same tables as the key detector */
	var MAJ_T = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'], MIN_T = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
	var MAJ_ALT = { 1: 'C♯', 6: 'G♭', 11: 'C♭' }, MIN_ALT = { 3: 'D♯', 8: 'A♭', 10: 'A♯' };
	/* key signature of the spelled key: + sharps, − flats (index = pitch class of the tonic) */
	var SIG_MAJ = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5], SIG_MIN = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];
	function mod12(v) { return ((v % 12) + 12) % 12; }
	/** k: 0–11 major, 12–23 minor → { name, short, minor, relative, alt, sharps, flats } */
	function keyName(k) {
		var minor = k >= 12, pc = k % 12, tonic = minor ? MIN_T[pc] : MAJ_T[pc], alt = minor ? MIN_ALT[pc] : MAJ_ALT[pc], sig = minor ? SIG_MIN[pc] : SIG_MAJ[pc];
		return { k: k, pc: pc, minor: minor, tonic: tonic, name: tonic + (minor ? ' minor' : ' major'), short: tonic + (minor ? 'm' : ''), alt: alt ? alt + (minor ? ' minor' : ' major') : '',
			relative: minor ? mod12(pc + 3) : mod12(pc + 9) + 12, sharps: sig > 0 ? sig : 0, flats: sig < 0 ? -sig : 0 };
	}
	/** Relative key spelled like the key itself (E♭ minor → G♭ major, F♯ major → D♯ minor). */
	function relativeName(k) { var ki = keyName(k), r = keyName(ki.relative); return r.alt && ((ki.flats && r.sharps) || (ki.sharps && r.flats)) ? r.alt : r.name; }
	/** Key index moved by whole semitones; the mode stays. */
	function transposeKey(k, semi) { return mod12((k % 12) + Math.round(semi)) + (k >= 12 ? 12 : 0); }
	/** Semitones from one pitch class to another: 'near' (−6…+5; the tritone goes down), 'up' (0…11) or 'down' (−11…0). */
	function shiftBetween(fromPc, toPc, dir) { var d = mod12(toPc - fromPc); if (dir === 'up') return d; if (dir === 'down') return d ? d - 12 : 0; return d >= 6 ? d - 12 : d; }
	/** "up a whole step", "down an octave and a minor third", "same key". */
	function intervalText(semi) {
		var a = Math.abs(Math.round(semi)); if (!a) return 'same key';
		var oct = Math.floor(a / 12), r = a % 12, parts = [];
		if (oct) parts.push(oct === 1 ? 'an octave' : oct + ' octaves');
		if (r) parts.push((/^[aeiou]/.test(IV[r]) ? 'an ' : 'a ') + IV[r]);
		return (semi > 0 ? 'up ' : 'down ') + parts.join(' and ');
	}
	function fileKeyLabel(name) { return String(name).replace(/♯/g, '-sharp').replace(/♭/g, '-flat').replace(/\s+/g, '-'); }
	function fmtShift(semi, cents) { var s = Math.round(semi), c = Math.round(cents || 0), o = ''; if (s) o += (s > 0 ? '+' : '-') + Math.abs(s) + 'st'; if (c) o += (c > 0 ? '+' : '-') + Math.abs(c) + 'c'; return o || '0st'; }
	/** song_F-major_-2st.mp3 (key part only when the key is known). */
	function fileName(base, keyNm, semi, cents, ext) {
		var b = String(base || 'song').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\\/:*?"<>|#%&{}$!'@+`=]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'song';
		return b + '_' + (keyNm ? fileKeyLabel(keyNm) + '_' : '') + fmtShift(semi, cents) + '.' + (ext || 'wav');
	}
	/* Sample rate from the file header (browsers decode to their own rate; the export keeps the file's real rate). */
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
		if (n > 4 && u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) return 48000; /* WebM audio is almost always Opus at 48 kHz */
		i = 0; /* MP3: skip ID3, read the first frame header */
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
	/** Container/codec by content, not by file name. */
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
	return { version: VERSION, INTERVALS: IV, keyName: keyName, relativeName: relativeName, transposeKey: transposeKey, shiftBetween: shiftBetween, intervalText: intervalText,
		fileKeyLabel: fileKeyLabel, fmtShift: fmtShift, fileName: fileName, sniffRate: sniffRate, sniffType: sniffType, MP3_RATES: [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] };
})();

/* ---------- opc-engine: pitch shift / time stretch core ----------
 * Based on the tested pitchdetector.com Pitch Shifter 2.0.0 DSP (75/75 tests), copied and extended for opc-engine 1.0.0:
 *  - range ±24 semitones + cents: below −12 (stretch factor < 0.49) the phase vocoder uses 8× overlap instead of 4×,
 *    so the analysis hop never reaches the window length (±12 behaves exactly like the tested engine);
 *  - optional formant correction (cepstral envelope, per frame) for voices;
 *  - render a time range (preview sections) with pre/post-roll that is trimmed, aligned sample-for-sample with a full render;
 *  - configurable peak ceiling (0.985 = −0.13 dBFS for WAV, 0.891 = −1 dBFS for MP3) so the output never clips.
 * Keep speed:   pitch by resampling + phase-vocoder time stretch (stereo-linked, identity phase locking, transient reset).
 * Pitch+speed:  windowed-sinc resampling only (varispeed / "record" mode).
 * Jobs are resumable: job.run(deadlineMs) works until the deadline, so long songs never block a thread. */
var OPCShift = (function () {
	'use strict';
	var TAU = Math.PI * 2;
	var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

	function makeFFT(n) {
		var levels = Math.round(Math.log(n) / Math.LN2), rev = new Uint32Array(n), cs = new Float64Array(n / 2), sn = new Float64Array(n / 2), i, j, sw = [];
		for (i = 0; i < n; i++) { var r = 0, x = i; for (j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; if (r > i) sw.push(i, r); }
		for (i = 0; i < n / 2; i++) { cs[i] = Math.cos(TAU * i / n); sn[i] = Math.sin(TAU * i / n); }
		var swaps = new Uint32Array(sw), ns = swaps.length;
		/* in-place complex FFT (radix 2, first two stages unrolled); inv = true gives the unscaled inverse */
		return function (re, im, inv) {
			var k, t, a, b, l, m, c, s, tr, ti, sg = inv ? -1 : 1, size, half, step;
			for (k = 0; k < ns; k += 2) { a = swaps[k]; b = swaps[k + 1]; t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; }
			for (a = 0; a < n; a += 2) { tr = re[a + 1]; ti = im[a + 1]; re[a + 1] = re[a] - tr; im[a + 1] = im[a] - ti; re[a] += tr; im[a] += ti; }
			for (a = 0; a < n; a += 4) {
				tr = re[a + 2]; ti = im[a + 2]; re[a + 2] = re[a] - tr; im[a + 2] = im[a] - ti; re[a] += tr; im[a] += ti;
				tr = sg * im[a + 3]; ti = -sg * re[a + 3]; re[a + 3] = re[a + 1] - tr; im[a + 3] = im[a + 1] - ti; re[a + 1] += tr; im[a + 1] += ti;
			}
			for (size = 8; size <= n; size <<= 1) {
				half = size >> 1; step = n / size;
				for (b = 0; b < half; b++) {
					c = cs[b * step]; s = sg * sn[b * step];
					for (m = b; m < n; m += size) {
						l = m + half;
						tr = re[l] * c + im[l] * s; ti = im[l] * c - re[l] * s;
						re[l] = re[m] - tr; im[l] = im[m] - ti; re[m] += tr; im[m] += ti;
					}
				}
			}
		};
	}

	function ratioOf(semi, cents) { return Math.pow(2, ((semi || 0) + (cents || 0) / 100) / 12); }

	/* FFT size for the phase vocoder: ~85 ms (music), ~43 ms (voice), ~21 ms (beats). */
	function fftSize(sr, quality) {
		var ms = quality === 'voice' ? 0.043 : quality === 'beats' ? 0.0215 : 0.085, n = 256;
		while (n * 2 <= sr * ms * 1.25) n *= 2;
		return n;
	}

	/* ---------- Phase vocoder time stretcher (streaming, all channels share one phase rotation) ----------
	 * fw: formant warp (pitch ratio) or 0 = off. */
	function Stretcher(inp, sr, s, quality, fw) {
		var N = fftSize(sr, quality), O = s < 0.49 ? 8 : 4, H = N / O, nb = N / 2 + 1, C = inp.length, i;
		this.inp = inp; this.C = C; this.N = N; this.H = H; this.nb = nb; this.s = s; this.Ha = H / s;
		this.L = inp[0].length; this.Ls = Math.round(this.L * s);
		this.win = new Float64Array(N);
		for (i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(TAU * i / N);
		this.norm = 1 / (0.375 * O); /* sum of Hann^2 at the chosen overlap (1.5 at 4×, 3 at 8×) */
		this.fft = makeFFT(N);
		this.re = new Float64Array(N); this.im = new Float64Array(N);
		this.Xr = []; this.Xi = []; this.acc = [];
		for (i = 0; i < C; i++) { this.Xr.push(new Float64Array(nb)); this.Xi.push(new Float64Array(nb)); this.acc.push(new Float64Array(N * 2)); }
		this.rr = new Float64Array(nb); this.ri = new Float64Array(nb); this.pr = new Float64Array(nb); this.pi = new Float64Array(nb);
		this.mag = new Float64Array(nb); this.rot = new Float64Array(nb); this.prot = new Float64Array(nb);
		this.rc = new Float64Array(nb); this.rs = new Float64Array(nb); this.peaks = new Int32Array(nb);
		this.pmag = new Float64Array(nb); this.pfrac = 1; this.transients = true; this.onsets = 0;
		this.m = 0; this.prevC = 0; this.emitted = 0; /* stretched samples already emitted */
		this.frames = Math.ceil((this.Ls + N / 2) / H) + 1;
		this.fw = fw && Math.abs(fw - 1) > 1e-6 ? fw : 0;
		if (this.fw) {
			this.fM = N >= 2048 ? N / 2 : N; this.efft = this.fM === N ? this.fft : makeFFT(this.fM);
			this.gain = new Float64Array(nb); this.env = new Float64Array(nb); this.cre = new Float64Array(this.fM); this.cim = new Float64Array(this.fM);
			this.lm = new Float64Array(this.fM / 2 + 1); this.e2 = new Float64Array(this.fM / 2 + 1);
			/* "true envelope": liftered cepstrum (1.8 ms: keeps formants, drops harmonics of voices up to ~500 Hz), iterated 4× so it
			 * rides on the harmonic peaks instead of averaging peaks and valleys (tested on vowels: envelope error 7–10 dB → 1.6–3 dB) */
			this.Q = Math.max(8, Math.round(sr * 0.0018)); this.TE = 2;
		}
	}
	/* Spectral envelope (log amplitude, liftered real cepstrum) of the reference spectrum → per-bin gain env(k·fw) / env(k). */
	Stretcher.prototype.formantGain = function (mag, mx) {
		/* the envelope is computed on the spectrum max-pooled by 2 (half-size FFTs; cepstral aliasing only at f0 ≈ 21 Hz) */
		var nb = this.nb, M = this.fM, mb = M / 2 + 1, D = (nb - 1) / (mb - 1), cre = this.cre, cim = this.cim, lm = this.lm, e2 = this.e2, env = this.env, g = this.gain, Q = this.Q, fw = this.fw, k, it, v, fl = mx * 1e-9 + 1e-30;
		for (k = 0; k < mb; k++) {
			var a = mag[k * D], b = D > 1 && k * D + 1 < nb ? mag[k * D + 1] : a, m = a > b ? a : b;
			lm[k] = 0.5 * Math.log(m > fl ? m : fl);
		}
		for (it = 0; it <= this.TE; it++) {
			for (k = 0; k < mb; k++) { v = it ? Math.max(lm[k], e2[k]) : lm[k]; cre[k] = v; cim[k] = 0; if (k > 0 && k < M / 2) { cre[M - k] = v; cim[M - k] = 0; } }
			this.efft(cre, cim, true);
			for (k = Q + 1; k < M - Q; k++) { cre[k] = 0; cim[k] = 0; }
			this.efft(cre, cim, false);
			for (k = 0; k < mb; k++) e2[k] = cre[k] / M;
		}
		for (k = 0; k < nb; k++) { var y = k / D, j0 = Math.floor(y); env[k] = j0 >= mb - 1 ? e2[mb - 1] : e2[j0] + (e2[j0 + 1] - e2[j0]) * (y - j0); }
		for (k = 0; k < nb; k++) {
			var x = k * fw, i0 = Math.floor(x), e;
			if (i0 >= nb - 1) e = env[nb - 1]; else { var f = x - i0; e = env[i0] * (1 - f) + env[i0 + 1] * f; }
			var gg = Math.exp(e - env[k]);
			g[k] = gg > 4 ? 4 : gg < 0.25 ? 0.25 : gg; /* at most ±12 dB per bin */
		}
		return g;
	};
	/* Process one frame; returns emitted block (array of Float32Array per channel) or null at the end. */
	Stretcher.prototype.frame = function () {
		var N = this.N, H = this.H, nb = this.nb, C = this.C, m = this.m, re = this.re, im = this.im, w = this.win, inp = this.inp, L = this.L;
		if (this.emitted >= this.Ls) return null;
		var c = Math.round(m * this.Ha), start = c - N / 2, ha = m ? c - this.prevC : 0, ch, k, n, idx;
		/* analysis: channel pairs packed into one complex FFT */
		for (ch = 0; ch < C; ch += 2) {
			var a = inp[ch], b = ch + 1 < C ? inp[ch + 1] : null;
			if (start >= 0 && start + N <= L) {
				if (b) { for (n = 0; n < N; n++) { re[n] = a[start + n] * w[n]; im[n] = b[start + n] * w[n]; } }
				else { for (n = 0; n < N; n++) { re[n] = a[start + n] * w[n]; im[n] = 0; } }
			} else for (n = 0; n < N; n++) {
				idx = start + n;
				if (idx >= 0 && idx < L) { re[n] = a[idx] * w[n]; im[n] = b ? b[idx] * w[n] : 0; } else { re[n] = 0; im[n] = 0; }
			}
			this.fft(re, im, false);
			var Ar = this.Xr[ch], Ai = this.Xi[ch], Br = b ? this.Xr[ch + 1] : null, Bi = b ? this.Xi[ch + 1] : null;
			for (k = 0; k < nb; k++) {
				var j = (N - k) & (N - 1), zr = re[k], zi = im[k], yr = re[j], yi = im[j];
				Ar[k] = 0.5 * (zr + yr); Ai[k] = 0.5 * (zi - yi);
				if (b) { Br[k] = 0.5 * (zi + yi); Bi[k] = -0.5 * (zr - yr); }
			}
		}
		/* reference spectrum = sum of channels (keeps the stereo image: every channel gets the same rotation) */
		var rr = this.rr, ri = this.ri, mag = this.mag, rot = this.rot, prot = this.prot, rc = this.rc, rs = this.rs, mx = 0;
		for (k = 0; k < nb; k++) {
			var sr_ = 0, si_ = 0;
			for (ch = 0; ch < C; ch++) { sr_ += this.Xr[ch][k]; si_ += this.Xi[ch][k]; }
			rr[k] = sr_; ri[k] = si_; mag[k] = sr_ * sr_ + si_ * si_;
			if (mag[k] > mx) mx = mag[k];
		}
		if (m === 0) {
			for (k = 0; k < nb; k++) { rot[k] = 0; rc[k] = 1; rs[k] = 0; }
		} else {
			/* peaks of the magnitude spectrum */
			var np = 0, peaks = this.peaks;
			var floor = mx * 1e-12, pm = this.pmag, hot = 0, live = 0, onset = false;
			if (this.transients) {
				for (k = 4; k < nb; k++) if (mag[k] > mx * 1e-6) { live++; if (mag[k] > 4 * pm[k]) hot++; }
				var frac = live ? hot / live : 0;
				onset = frac > 0.3 && frac > this.pfrac && mx > 1e-9;
				this.pfrac = frac;
				if (onset) this.onsets++;
			}
			for (k = 2; k < nb - 2; k++) {
				var v = mag[k];
				if (v > floor && v > mag[k - 1] && v >= mag[k + 1] && v > mag[k - 2] && v >= mag[k + 2]) peaks[np++] = k;
			}
			if (!np) { for (k = 0; k < nb; k++) { rot[k] = 0; rc[k] = 1; rs[k] = 0; } }
			else {
				var pr = this.pr, pi = this.pi, lo = 0;
				for (var q = 0; q < np; q++) {
					var p = peaks[q], om = TAU * p / N;
					var ph = Math.atan2(ri[p], rr[p]), php = Math.atan2(pi[p], pr[p]);
					var d = ph - php - om * ha; d -= TAU * Math.round(d / TAU);
					var inst = om + d / ha, psi = php + prot[p] + inst * H, r = psi - ph;
					r -= TAU * Math.round(r / TAU);
					if (onset && mag[p] > 4 * pm[p]) r = 0; /* transient: new energy keeps its original phase (crisp attacks) */
					var cr = Math.cos(r), sr2 = Math.sin(r);
					/* region of influence: up to the lowest bin between this peak and the next */
					var hi;
					if (q + 1 < np) { var nx = peaks[q + 1], best = p, bm = Infinity; for (k = p + 1; k < nx; k++) if (mag[k] < bm) { bm = mag[k]; best = k; } hi = best; }
					else hi = nb - 1;
					for (k = lo; k <= hi; k++) { rot[k] = r; rc[k] = cr; rs[k] = sr2; }
					lo = hi + 1;
				}
			}
		}
		var fg = this.fw ? this.formantGain(mag, mx) : null;
		/* synthesis: rotate (and scale for formants), inverse FFT (pairs packed), overlap-add */
		var pos = m * H - N / 2; /* output index of window start */
		for (ch = 0; ch < C; ch += 2) {
			var hasB = ch + 1 < C, xr = this.Xr[ch], xi = this.Xi[ch], yr2 = hasB ? this.Xr[ch + 1] : null, yi2 = hasB ? this.Xi[ch + 1] : null;
			for (k = 0; k < nb; k++) {
				var cc = rc[k], ss = rs[k];
				if (fg) { cc *= fg[k]; ss *= fg[k]; }
				var ar = xr[k] * cc - xi[k] * ss, ai = xr[k] * ss + xi[k] * cc, br = 0, bi = 0;
				if (hasB) { br = yr2[k] * cc - yi2[k] * ss; bi = yr2[k] * ss + yi2[k] * cc; }
				re[k] = ar - bi; im[k] = ai + br;
				if (k > 0 && k < N / 2) { re[N - k] = ar + bi; im[N - k] = -ai + br; }
			}
			this.fft(re, im, true);
			var accA = this.acc[ch], accB = hasB ? this.acc[ch + 1] : null, g = this.norm / N, M2 = N * 2;
			var n0 = pos < 0 ? -pos : 0, ri2 = (pos + n0) % M2, wg;
			for (n = n0; n < N; n++) {
				wg = w[n] * g;
				accA[ri2] += re[n] * wg;
				if (hasB) accB[ri2] += im[n] * wg;
				if (++ri2 === M2) ri2 = 0;
			}
		}
		/* samples before the next window start are final */
		var finalEnd = Math.min(this.Ls, (m + 1) * H - N / 2), cnt = finalEnd - this.emitted, out = [];
		if (cnt < 0) cnt = 0;
		for (ch = 0; ch < C; ch++) {
			var blk = new Float32Array(cnt), acc = this.acc[ch];
			for (n = 0; n < cnt; n++) { var ix = (this.emitted + n) % (N * 2); blk[n] = acc[ix]; acc[ix] = 0; }
			out.push(blk);
		}
		this.emitted += cnt;
		/* keep this frame's reference spectrum and rotation for the next one */
		var t;
		t = this.pr; this.pr = this.rr; this.rr = t; t = this.pi; this.pi = this.ri; this.ri = t;
		t = this.prot; this.prot = this.rot; this.rot = t;
		this.pmag.set(mag);
		this.prevC = c; this.m++;
		return out;
	};

	/* ---------- Streaming windowed-sinc resampler: output j reads input position j*p ---------- */
	function Resampler(C, p, outLen) {
		/* polyphase bank: OS phases x T taps, Blackman-windowed sinc, cutoff below the new Nyquist when shifting up */
		var fc = 0.94 / Math.max(1, p), Z = 16, W = Z / fc, OS = 4096, Wi = Math.ceil(W), T = 2 * Wi, i, t;
		this.C = C; this.p = p; this.Wi = Wi; this.T = T; this.OS = OS; this.outLen = outLen;
		this.bank = new Float32Array((OS + 1) * T);
		for (i = 0; i <= OS; i++) for (t = 0; t < T; t++) {
			var x = i / OS + Wi - 1 - t, ax = Math.abs(x), u = ax / W, v = 0;
			if (u < 1) v = fc * (ax === 0 ? 1 : Math.sin(Math.PI * fc * x) / (Math.PI * fc * x)) * (0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u));
			this.bank[i * T + t] = v;
		}
		this.buf = []; for (i = 0; i < C; i++) this.buf.push(new Float32Array(1 << 16));
		this.base = 0; this.len = 0; this.ended = false; this.j = 0;
		this.out = []; for (i = 0; i < C; i++) this.out.push(new Float32Array(outLen));
	}
	Resampler.prototype.push = function (blocks) {
		var n = blocks[0].length, ch, need = this.len + n;
		if (need > this.buf[0].length) {
			/* drop samples no longer needed, grow if necessary */
			var keepFrom = Math.max(0, Math.floor(this.j * this.p) - this.Wi - 2 - this.base);
			var size = this.buf[0].length; while (size < this.len - keepFrom + n) size *= 2;
			for (ch = 0; ch < this.C; ch++) {
				var nbuf = size === this.buf[ch].length ? this.buf[ch] : new Float32Array(size);
				nbuf.set(this.buf[ch].subarray(keepFrom, this.len));
				this.buf[ch] = nbuf;
			}
			this.base += keepFrom; this.len -= keepFrom;
		}
		for (ch = 0; ch < this.C; ch++) this.buf[ch].set(blocks[ch], this.len);
		this.len += n;
		this.produce();
	};
	Resampler.prototype.end = function () { this.ended = true; this.produce(); };
	Resampler.prototype.produce = function () {
		var p = this.p, Wi = this.Wi, T = this.T, OS = this.OS, bank = this.bank, C = this.C, base = this.base, len = this.len, avail = base + len, ch;
		var b0 = this.buf[0], b1 = C > 1 ? this.buf[1] : null, o0 = this.out[0], o1 = C > 1 ? this.out[1] : null, acc = new Float64Array(C);
		while (this.j < this.outLen) {
			var pos = this.j * p, i0 = Math.floor(pos);
			if (!this.ended && i0 + Wi + 1 >= avail) break;
			var off = Math.round((pos - i0) * OS) * T, lo = i0 - Wi + 1, li = lo - base, s0 = 0, s1 = 0, t, v, h;
			if (li >= 0 && li + T <= len && C <= 2) {
				if (b1) { for (t = 0; t < T; t++) { h = bank[off + t]; s0 += b0[li + t] * h; s1 += b1[li + t] * h; } }
				else { for (t = 0; t < T; t++) s0 += b0[li + t] * bank[off + t]; }
				o0[this.j] = s0; if (o1) o1[this.j] = s1;
			} else {
				for (ch = 0; ch < C; ch++) acc[ch] = 0;
				for (t = 0; t < T; t++) {
					v = li + t; if (v < 0 || v >= len) continue;
					h = bank[off + t];
					for (ch = 0; ch < C; ch++) acc[ch] += this.buf[ch][v] * h;
				}
				for (ch = 0; ch < C; ch++) this.out[ch][this.j] = acc[ch];
			}
			this.j++;
		}
	};

	/* ---------- Job: a whole render (or a time range) in resumable chunks ----------
	 * o: { semi, cents, tempo (1 = same speed), mode 'keep' | 'linked', quality 'music' | 'voice' | 'beats', formant (bool),
	 *      from, to (seconds, optional: render only this range; pre/post-roll is added and trimmed), ceiling (peak limit, default 0.985),
	 *      normalize (default true: lower the whole render when it would exceed the ceiling) }
	 * keep speed, shift up:   resample by p (shorter, band-limited) -> stretch by p/t  (cost follows the output length)
	 * keep speed, shift down: stretch by p/t -> streaming resample by p
	 * pitch + speed together: resample by p only */
	function Job(channels, sr, o) {
		o = o || {};
		var p = ratioOf(o.semi || 0, o.cents || 0), t = o.mode === 'linked' ? 1 : (o.tempo || 1), C = channels.length, Lfull = channels[0].length, i;
		this.ceiling = o.ceiling || 0.985; /* −0.13 dBFS: stays below −0.1 dBFS after 16-bit dither */ this.normalize = o.normalize !== false;
		/* optional range with 0.35 s pre/post-roll (covers window fade-in and phase settling), trimmed in finish() */
		this.trim = null;
		if (o.from != null || o.to != null) {
			var a = Math.max(0, Math.round((o.from || 0) * sr)), b = Math.min(Lfull, Math.round((o.to == null ? Lfull / sr : o.to) * sr));
			if (b <= a) b = Math.min(Lfull, a + 1);
			var pad = Math.round(0.35 * sr), s0 = Math.max(0, a - pad), s1 = Math.min(Lfull, b + pad);
			channels = channels.map(function (x) { return x.subarray(s0, s1); });
			this.trim = { a: a - s0, b: b - s0, s0: s0, from: a / sr, to: b / sr };
		}
		var L = channels[0].length;
		this.p = p; this.t = t; this.C = C; this.sr = sr; this.q = o.quality; this.mode = o.mode === 'linked' ? 'linked' : 'keep';
		this.fw = this.mode === 'keep' && o.formant ? p : 0;
		this.outLen = this.mode === 'linked' ? Math.round(L / p) : Math.round(L / t);
		this.done = false; this.progress = 0; this.inp = channels; this.rsPos = 0;
		var one = Math.abs(p - 1) < 1e-9;
		if (this.mode === 'linked') this.kind = one ? 'copy' : 'resample';
		else if (one && Math.abs(t - 1) < 1e-9) this.kind = 'copy';
		else if (one) this.kind = 'stretch';
		else this.kind = p > 1 ? 'up' : 'down';
		if (this.kind === 'copy') { this.out = channels.map(function (x) { return new Float32Array(x); }); this.finish(); return; }
		if (this.kind === 'resample') this.rs = new Resampler(C, p, this.outLen);
		else if (this.kind === 'up') { this.rs = new Resampler(C, p, Math.round(L / p)); this.w0 = 0.25; }
		else if (this.kind === 'down') { this.st = new Stretcher(channels, sr, p / t, o.quality, this.fw); this.rs = new Resampler(C, p, this.outLen); }
		else this.st = new Stretcher(channels, sr, 1 / t, o.quality, 0);
		if (this.kind === 'stretch' || this.kind === 'up') { this.out = []; for (i = 0; i < C; i++) this.out.push(new Float32Array(this.outLen)); this.w = 0; }
	}
	Job.prototype.run = function (deadline) {
		if (this.done) return true;
		var k = 0, ch, n, b, m;
		while (!this.done) {
			if (this.rs && !this.st) {
				/* feeding the input into the resampler (linked mode, or first stage of a shift up) */
				n = Math.min(16384, this.inp[0].length - this.rsPos);
				if (n > 0) { b = []; for (ch = 0; ch < this.C; ch++) b.push(this.inp[ch].subarray(this.rsPos, this.rsPos + n)); this.rs.push(b); this.rsPos += n; }
				else this.rs.end();
				var fr = this.rs.j / this.rs.outLen;
				if (this.kind === 'resample') {
					this.progress = fr;
					if (fr >= 1) { this.out = this.rs.out; this.rs = null; this.finish(); }
				} else {
					this.progress = fr * this.w0;
					if (fr >= 1) { this.st = new Stretcher(this.rs.out, this.sr, this.p / this.t, this.q, this.fw); this.rs = null; }
				}
			} else {
				b = this.st.frame();
				if (b) {
					if (this.rs) this.rs.push(b);
					else {
						m = Math.min(b[0].length, this.outLen - this.w);
						if (m > 0) for (ch = 0; ch < this.C; ch++) this.out[ch].set(m === b[ch].length ? b[ch] : b[ch].subarray(0, m), this.w);
						this.w += b[0].length;
					}
					var sp = Math.min(0.999, this.st.m / this.st.frames);
					this.progress = this.kind === 'up' ? this.w0 + (1 - this.w0) * sp : sp;
				} else {
					if (this.rs) { this.rs.end(); this.out = this.rs.out; }
					this.finish();
				}
			}
			if ((++k & 3) === 0 && now() > deadline) break;
		}
		return this.done;
	};
	Job.prototype.finish = function () {
		var ch, i, bad = 0, peak = 0;
		if (this.trim) {
			/* keep only the requested range (output time = input time / speed) */
			var sp = this.mode === 'linked' ? this.p : this.t, a = Math.round(this.trim.a / sp), b = Math.min(this.out[0].length, Math.round(this.trim.b / sp));
			this.out = this.out.map(function (x) { return x.slice(a, Math.max(a, b)); });
		}
		for (ch = 0; ch < this.C; ch++) { var x = this.out[ch]; for (i = 0; i < x.length; i++) { var v = x[i]; if (v !== v) { x[i] = 0; bad++; } else if (v > peak) peak = v; else if (-v > peak) peak = -v; } }
		this.gain = 1; this.rawPeak = peak;
		if (this.normalize && peak > this.ceiling) { this.gain = this.ceiling / peak; scale(this.out, this.gain); }
		this.peak = peak * this.gain; this.nan = bad; this.done = true; this.progress = 1;
	};
	function scale(chs, g) { for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var i = 0; i < x.length; i++) x[i] *= g; } }
	function peakOf(chs) { var pk = 0; for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var i = 0; i < x.length; i++) { var v = x[i] < 0 ? -x[i] : x[i]; if (v > pk) pk = v; } } return pk; }

	/* Convenience (tests, small files): render synchronously. */
	function renderSync(channels, sr, o) { var j = new Job(channels, sr, o); while (!j.run(now() + 1e9)) { /* run */ } return j; }

	return { makeFFT: makeFFT, ratioOf: ratioOf, fftSize: fftSize, Stretcher: Stretcher, Resampler: Resampler, Job: Job, renderSync: renderSync, scale: scale, peakOf: peakOf };
})();

	/* ===================== Song Key Finder core (pure maths, no DOM) =====================
	 * Audio → spectral peaks (Hann FFT, parabolic interpolation) → tuning offset (weighted circular mean of peak
	 * deviations) → tuned semitone spectrum → harmonic removal (overtones of lower notes) → 12-bin pitch-class profile
	 * (A1–C7 only) → Pearson correlation with three key profiles (Krumhansl–Kessler, Temperley, Albrecht–Shanahan)
	 * for all 24 keys, whole song and time windows. */
	var PKF = (function () {
		var LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], LETPC = [0, 2, 4, 5, 7, 9, 11];
		var SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
		// Conventional key names (fewest accidentals; F♯ major and E♭ minor for the 6-accidental ties).
		var MAJ_T = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
		var MIN_T = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
		var MAJ_ALT = { 1: 'C♯', 6: 'G♭', 11: 'C♭' }, MIN_ALT = { 3: 'D♯', 8: 'A♭', 10: 'A♯' };
		var P = {
			kk: [[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]],
			tp: [[0.748, 0.060, 0.488, 0.082, 0.670, 0.460, 0.096, 0.715, 0.104, 0.366, 0.057, 0.400], [0.712, 0.084, 0.474, 0.618, 0.049, 0.460, 0.105, 0.747, 0.404, 0.067, 0.133, 0.330]],
			as: [[0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.080, 0.008, 0.081], [0.220, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052]]
		};
		var MAJ_STEPS = [0, 2, 4, 5, 7, 9, 11], MIN_STEPS = [0, 2, 3, 5, 7, 8, 10];
		var HARM = [12, 19, 24, 28, 31, 34, 36], HW = [0.55, 0.35, 0.25, 0.18, 0.14, 0.1, 0.08];

		function makeFFT(n) {
			var lv = Math.round(Math.log(n) / Math.LN2), rev = new Uint32Array(n), cs = new Float64Array(n / 2), sn = new Float64Array(n / 2), i;
			for (i = 0; i < n; i++) { var r = 0, x = i; for (var b = 0; b < lv; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
			for (i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
			return function (re, im) {
				var i, j, t;
				for (i = 0; i < n; i++) { j = rev[i]; if (j > i) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
				for (var size = 2; size <= n; size <<= 1) {
					var half = size >> 1, step = n / size;
					for (i = 0; i < n; i += size) for (j = 0; j < half; j++) {
						var k = j * step, a = i + j, bb = a + half, tr = re[bb] * cs[k] + im[bb] * sn[k], ti = -re[bb] * sn[k] + im[bb] * cs[k];
						re[bb] = re[a] - tr; im[bb] = im[a] - ti; re[a] += tr; im[a] += ti;
					}
				}
			};
		}
		function fftSizeFor(sr) { var n = 4096; while (sr / n > 1.5 && n < 32768) n *= 2; return n; }

		/** Analyser: feed frames of n samples; keeps each frame's spectral peaks + level for the key maths. */
		function Analyser(sr, n) {
			this.sr = sr; this.n = n || fftSizeFor(sr); this.fft = makeFFT(this.n);
			this.re = new Float64Array(this.n); this.im = new Float64Array(this.n); this.win = new Float64Array(this.n);
			for (var i = 0; i < this.n; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (this.n - 1));
			this.db = new Float64Array(this.n / 2); this.frames = [];
			this.kLo = Math.max(3, Math.floor(50 * this.n / sr)); this.kHi = Math.min(this.n / 2 - 3, Math.ceil(5000 * this.n / sr));
		}
		/** x: array, off: start index, t: time in s. Returns the frame (or null when silent). */
		Analyser.prototype.frame = function (x, off, t, gate) {
			var n = this.n, re = this.re, im = this.im, w = this.win, db = this.db, i, s2 = 0, v;
			for (i = 0; i < n; i++) { v = x[off + i] || 0; s2 += v * v; re[i] = v * w[i]; im[i] = 0; }
			var rms = Math.sqrt(s2 / n), fr = { t: t, rms: rms, f: [], a: [] };
			if (rms < (gate || 0.0015)) { fr.silent = true; this.frames.push(fr); return null; }
			this.fft(re, im);
			var mx = -1e9;
			for (i = this.kLo - 2; i <= this.kHi + 2; i++) { v = 10 * Math.log10(re[i] * re[i] + im[i] * im[i] + 1e-20); db[i] = v; if (v > mx) mx = v; }
			var floor = mx - 50, pk = [], bin = this.sr / n;
			for (i = this.kLo; i <= this.kHi; i++) {
				var b = db[i];
				if (b < floor || b <= db[i - 1] || b < db[i + 1] || b <= db[i - 2] || b < db[i + 2]) continue;
				var a = db[i - 1], c = db[i + 1], den = a - 2 * b + c, d = den ? 0.5 * (a - c) / den : 0;
				pk.push([(i + d) * bin, b - 0.25 * (a - c) * d]);
			}
			pk.sort(function (p, q) { return q[1] - p[1]; });
			if (pk.length > 80) pk.length = 80;
			for (i = 0; i < pk.length; i++) { fr.f.push(pk[i][0]); fr.a.push(Math.pow(10, (pk[i][1] - mx) / 20)); }
			this.frames.push(fr);
			return fr;
		};

		/** Tuning offset in cents (−50…+50) from all peaks 80–2000 Hz: weighted circular mean of their deviation. */
		function tuning(frames) {
			var sx = 0, sy = 0, sw = 0;
			for (var i = 0; i < frames.length; i++) {
				var fr = frames[i];
				for (var j = 0; j < fr.f.length; j++) {
					var f = fr.f[j]; if (f < 80 || f > 2000) continue;
					var c = 1200 * Math.log2(f / 440), d = c - 100 * Math.round(c / 100), w = fr.a[j] * fr.a[j], ang = 2 * Math.PI * d / 100;
					sx += w * Math.cos(ang); sy += w * Math.sin(ang); sw += w;
				}
			}
			if (!sw) return { cents: 0, strength: 0 };
			return { cents: Math.atan2(sy, sx) / (2 * Math.PI) * 100, strength: Math.sqrt(sx * sx + sy * sy) / sw };
		}

		/** 12-bin pitch-class profile of one frame (tuned semitone spectrum, overtones of lower notes removed, A1–C7). */
		function frameChroma(fr, tune) {
			var L = new Float64Array(128), i, m, out = new Float64Array(12);
			for (i = 0; i < fr.f.length; i++) {
				var mf = 69 + 12 * Math.log2(fr.f[i] / 440) - tune / 100; m = Math.round(mf);
				if (m < 24 || m > 120) continue;
				var d = mf - m, w = Math.cos(Math.PI * d); w *= w;
				L[m] += fr.a[i] * w;
			}
			for (m = 24; m < 110; m++) {
				if (L[m] <= 0) continue;
				for (var h = 0; h < HARM.length; h++) { var t = m + HARM[h]; if (t < 128) L[t] = Math.max(0, L[t] - L[m] * HW[h]); }
			}
			var mx = 0, bass = new Float64Array(12), bm = 0;
			for (m = 33; m <= 96; m++) { var v = Math.sqrt(L[m]) * (m < 52 ? 1.25 : 1); out[m % 12] += v; if (m < 52) bass[m % 12] += v; }
			for (i = 0; i < 12; i++) { if (out[i] > mx) mx = out[i]; if (bass[i] > bm) bm = bass[i]; }
			if (mx > 0) for (i = 0; i < 12; i++) out[i] /= mx;
			if (bm > 0) for (i = 0; i < 12; i++) bass[i] /= bm;
			out.bass = bass;
			return out;
		}

		function pearson(x, p, rot) {
			var mx = 0, mp = 0, i, n = 12;
			for (i = 0; i < n; i++) { mx += x[i]; mp += p[i]; }
			mx /= n; mp /= n;
			var sxy = 0, sxx = 0, spp = 0;
			for (i = 0; i < n; i++) { var a = x[(i + rot) % 12] - mx, b = p[i] - mp; sxy += a * b; sxx += a * a; spp += b * b; }
			return sxx && spp ? sxy / Math.sqrt(sxx * spp) : 0;
		}
		/** Scores of the 24 keys (index = tonic + 12·minor), averaged over the chosen profiles. */
		function keyScores(ch, profiles) {
			profiles = profiles || ['kk', 'tp', 'as'];
			var s = new Float64Array(24);
			for (var k = 0; k < 24; k++) {
				var sum = 0;
				for (var j = 0; j < profiles.length; j++) sum += pearson(ch, P[profiles[j]][k >= 12 ? 1 : 0], k % 12);
				s[k] = sum / profiles.length;
			}
			return s;
		}
		function rank(s) { var idx = []; for (var k = 0; k < 24; k++) idx.push(k); idx.sort(function (a, b) { return s[b] - s[a]; }); return idx; }

		/** Everything a key result needs: names, Camelot, Open Key, signature, scale, chords. */
		function keyInfo(k) {
			var minor = k >= 12, pc = k % 12, tonic = minor ? MIN_T[pc] : MAJ_T[pc];
			var steps = minor ? MIN_STEPS : MAJ_STEPS, li = LET.indexOf(tonic[0]), scale = [], sharps = 0, flats = 0, i;
			for (i = 0; i < 7; i++) {
				var L = LET[(li + i) % 7], want = (pc + steps[i]) % 12, acc = ((want - LETPC[LET.indexOf(L)]) % 12 + 12) % 12;
				if (acc > 6) acc -= 12;
				scale.push(L + (acc === 1 ? '♯' : acc === 2 ? '𝄪' : acc === -1 ? '♭' : acc === -2 ? '𝄫' : ''));
				if (acc > 0) sharps += acc; else flats -= acc;
			}
			var majPc = minor ? (pc + 3) % 12 : pc, num = ((7 * majPc) % 12 + 7) % 12 + 1, ok = (7 * majPc) % 12 + 1;
			var qual7 = minor ? ['m', '°', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', '°'];
			var rom = minor ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
			var chords = [], chordPcs = [];
			for (i = 0; i < 7; i++) {
				var qual = qual7[i];
				chords.push(scale[i] + qual);
				var r = (pc + steps[i]) % 12, third = qual === '' ? 4 : 3, fifth = qual === '°' ? 6 : 7;
				chordPcs.push([r, (r + third) % 12, (r + fifth) % 12]);
			}
			var sigNotes = sharps ? ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'].slice(0, sharps) : ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭'].slice(0, flats);
			var rel = minor ? (pc + 3) % 12 : (pc + 9) % 12 + 12;
			var alt = minor ? MIN_ALT[pc] : MAJ_ALT[pc];
			return {
				k: k, pc: pc, minor: minor, tonic: tonic, name: tonic + (minor ? ' minor' : ' major'), short: tonic + (minor ? 'm' : ''),
				alt: alt ? alt + (minor ? ' minor' : ' major') : '', camelot: num + (minor ? 'A' : 'B'), openKey: ok + (minor ? 'm' : 'd'),
				sharps: sharps, flats: flats, signature: sharps ? sharps + ' sharp' + (sharps > 1 ? 's' : '') : flats ? flats + ' flat' + (flats > 1 ? 's' : '') : 'no sharps or flats',
				sigNotes: sigNotes, scale: scale, steps: steps.map(function (s) { return (pc + s) % 12; }), chords: chords, chordPcs: chordPcs, roman: rom, relative: rel,
				harmonicV: minor ? scale[4] : ''
			};
		}

		function sumChroma(per, t0, t1) {
			var W = new Float64Array(12), B = new Float64Array(12), n = 0, j;
			for (var i = 0; i < per.length; i++) { var q = per[i]; if (q && q.t >= t0 && q.t < t1) { for (j = 0; j < 12; j++) { W[j] += q.c[j] * q.w; B[j] += q.c.bass[j] * q.w; } n++; } }
			if (!n) return null;
			var bm = 0; for (j = 0; j < 12; j++) if (B[j] > bm) bm = B[j];
			if (bm) for (j = 0; j < 12; j++) B[j] /= bm;
			W.bass = B;
			return W;
		}
		function triadFit(ch, k) {
			if (!ch) return 0;
			var t = [], pc = k % 12, th = k >= 12 ? 3 : 4;
			for (var i = 0; i < 12; i++) t.push(i === pc || i === (pc + th) % 12 || i === (pc + 7) % 12 ? 1 : 0);
			return 0.5 * pearson(ch, t, 0) + ch.bass[pc];
		}

		/** Final result from a list of analysed frames. opt.window (s) for the key-over-time strip. */
		function analyse(frames, opt) {
			opt = opt || {};
			var tun = tuning(frames), tune = opt.tune != null ? opt.tune : (tun.strength > 0.15 ? tun.cents : 0);
			var G = new Float64Array(12), used = 0, i, j, maxRms = 0, per = [], firstT = -1, lastT = 0;
			for (i = 0; i < frames.length; i++) if (!frames[i].silent && frames[i].rms > maxRms) maxRms = frames[i].rms;
			for (i = 0; i < frames.length; i++) {
				var fr = frames[i];
				if (fr.silent || fr.rms < maxRms * 0.03 || !fr.f.length) { per.push(null); continue; }
				var c = frameChroma(fr, tune), w = Math.sqrt(fr.rms / maxRms);
				for (j = 0; j < 12; j++) G[j] += c[j] * w;
				per.push({ c: c, w: w, t: fr.t }); used++;
				if (firstT < 0) firstT = fr.t; lastT = fr.t;
			}
			var dur = frames.length ? frames[frames.length - 1].t + (frames[1] ? frames[1].t - frames[0].t : 0) / 2 : 0;
			var res = { frames: frames.length, used: used, tune: tune, tuneStrength: tun.strength, a4: 440 * Math.pow(2, tune / 1200), duration: dur, segments: [], change: null };
			var gm = 0; for (j = 0; j < 12; j++) if (G[j] > gm) gm = G[j];
			res.chroma = Array.prototype.map.call(G, function (v) { return gm ? v / gm : 0; });
			if (used < 3 || !gm) { res.none = 'silent'; res.confidence = 0; return res; }
			var s = keyScores(res.chroma, opt.profiles), r = rank(s), main = r[0];
			res.scores = Array.prototype.slice.call(s);
			// Relative major/minor share the same notes: when both fit, the chords at the start and the end decide.
			var relOf = keyInfo(main).relative, swap = false;
			if (s[main] - s[relOf] < 0.25 && lastT - firstT > 3) {
				var edge = Math.min(2, (lastT - firstT) / 6), A = sumChroma(per, firstT, firstT + edge), B = sumChroma(per, lastT - edge + 0.001, lastT + 1);
				var fa = triadFit(A, main) + triadFit(B, main), fb = triadFit(A, relOf) + triadFit(B, relOf);
				res.edgeFit = [fa, fb];
				if (fb > fa + 0.4) { swap = true; main = relOf; }
			}
			// flatness: very even profiles (noise, drums) have no key
			var mean = 0, sd = 0; for (j = 0; j < 12; j++) mean += res.chroma[j]; mean /= 12;
			for (j = 0; j < 12; j++) sd += (res.chroma[j] - mean) * (res.chroma[j] - mean); sd = Math.sqrt(sd / 12);
			res.contrast = sd / (mean || 1);
			// key over time (windows); a small bonus for the main key keeps the strip from flickering
			var win = opt.window || 12, hop = win / 2;
			if (dur >= (opt.minStrip || 40)) {
				var wins = [];
				for (var t0 = 0; t0 < dur - hop * 0.5; t0 += hop) {
					var W = sumChroma(per, t0, t0 + win);
					if (!W) { wins.push({ t0: t0, k: -1 }); continue; }
					var ws = keyScores(W, opt.profiles); ws[main] += 0.04;
					var wr = rank(ws);
					wins.push({ t0: t0, k: ws[wr[0]] > 0.35 ? wr[0] : -1 });
				}
				var segs = [];
				for (i = 0; i < wins.length; i++) {
					var st = i ? wins[i].t0 + hop / 2 : 0, en = i === wins.length - 1 ? dur : wins[i].t0 + hop * 1.5, last = segs[segs.length - 1];
					if (last && last.k === wins[i].k) last.end = en; else segs.push({ k: wins[i].k, start: st, end: en });
				}
				// a one-window island between two different keys is a transition: give it to the longer neighbour
				for (i = 0; i < segs.length; i++) if (segs.length > 1 && segs[i].end - segs[i].start < win * 0.8) {
					var pv = segs[i - 1], nx = segs[i + 1], to = !pv ? nx : !nx ? pv : (pv.end - pv.start >= nx.end - nx.start ? pv : nx);
					if (to === pv) pv.end = segs[i].end; else nx.start = segs[i].start;
					segs.splice(i, 1); i = -1;
					for (j = segs.length - 1; j > 0; j--) if (segs[j].k === segs[j - 1].k) { segs[j - 1].end = segs[j].end; segs.splice(j, 1); }
				}
				var cover = {};
				segs.forEach(function (sg) { cover[sg.k] = (cover[sg.k] || 0) + sg.end - sg.start; });
				var bestK = main; for (var kk in cover) if (+kk >= 0 && cover[kk] > (cover[bestK] || 0)) bestK = +kk;
				if ((cover[main] || 0) < dur * 0.25 && cover[bestK] >= dur * 0.4) { main = bestK; res.byTime = true; }
				segs.forEach(function (sg) { sg.name = sg.k >= 0 ? keyInfo(sg.k).name : 'No clear key'; sg.short = sg.k >= 0 ? keyInfo(sg.k).short : '–'; });
				res.segments = segs;
				var ch = segs.filter(function (sg) { return sg.k >= 0 && sg.k !== main && sg.end - sg.start >= Math.max(20, dur * 0.2); });
				res.change = ch.length ? ch[0] : null;
			}
			var others = r.filter(function (k) { return k !== main; }), top = s[main], second = s[others[0]];
			var conf = (top - 0.35) * 1.1 + Math.max(0, top - second) * 3.2;
			if (swap || res.byTime) conf = Math.min(0.75, (top - 0.35) * 1.1 + 0.25);
			if (res.change) conf = Math.min(conf, 0.7);
			conf = Math.max(0, Math.min(0.99, conf));
			var strong = 0; for (j = 0; j < 12; j++) if (res.chroma[j] > 0.3) strong++;
			res.notesHeard = strong;
			if (tun.strength < 0.1 || res.contrast < 0.25 || top < 0.45) { res.none = 'unclear'; conf = Math.min(conf, 0.2); }
			else if (strong < 4) { res.none = 'few'; conf = Math.min(conf, 0.3); }
			res.confidence = Math.round(conf * 100);
			res.swapped = swap;
			res.key = keyInfo(main);
			res.candidates = others.slice(0, 3).map(function (k) { var ki = keyInfo(k); return { name: ki.name, short: ki.short, camelot: ki.camelot, score: s[k], k: k, relative: k === res.key.relative }; });
			res.mainScore = top;
			res.relScore = s[res.key.relative];
			return res;
		}

		/** Convenience: analyse a whole mono signal. */
		function analyseSignal(x, sr, opt) {
			var A = new Analyser(sr), n = A.n, hop = Math.max(n / 4, Math.ceil((x.length - n) / 1500));
			for (var off = 0; off + n <= x.length || off === 0; off += hop) { A.frame(x, off, (off + n / 2) / sr, opt && opt.gate); if (off + n > x.length) break; }
			return analyse(A.frames, opt);
		}

		return { Analyser: Analyser, analyse: analyse, analyseSignal: analyseSignal, keyInfo: keyInfo, keyScores: keyScores, tuning: tuning, frameChroma: frameChroma, fftSizeFor: fftSizeFor, SHARP: SHARP, P: P };
	})();

	/* ============================== BPM Detector core (pure JS, also runs in Node for tests) ==============================
	 * 1. Onset strength: STFT (Hann, ~46 ms window, 11.6 ms hop), log-compressed magnitudes, SuperFlux-style positive
	 *    spectral flux in 4 bands (kick / bass-snare / mid / hats), each band normalised, summed, detrended.
	 * 2. Tempo candidates: autocorrelation of the onset envelope with harmonic enhancement (comb over 1–4 periods) and a
	 *    weak log-normal prior (120 BPM, 1.2 octaves).
	 * 3. Metrical level (octave): per 8-s window, a phase-aligned comb measures the onsets on the beats, on the half-beats
	 *    and on the third-beats; the tempo goes up an octave only when the half-beats are (nearly) as strong as the beats.
	 * 4. Local tempo curve (8-s windows) → dynamic-programming beat tracker with a time-varying period (Ellis 2007).
	 * 5. Sections of steady tempo; BPM of each by least-squares regression over its beats (0.1 BPM precision).
	 */
	var PBD = (function () {
		var BANDS = [[30, 160], [160, 800], [800, 4000], [4000, 11000]];
		var LATENCY = -0.0045; // s: flux peaks come 4.5 ms before the true onset (calibrated on click tracks)

		function FFT(n) {
			var lev = Math.round(Math.log(n) / Math.LN2), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n), i, j;
			for (i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
			for (i = 0; i < n; i++) { var r = 0, x = i; for (j = 0; j < lev; j++) { r = (r << 1) | (x & 1); x >>>= 1; } rev[i] = r; }
			var re = new Float64Array(n), im = new Float64Array(n);
			/** magnitudes of a real frame (length n) → out (length n/2+1) */
			this.mag = function (inp, out) {
				for (var i = 0; i < n; i++) { re[rev[i]] = inp[i]; im[rev[i]] = 0; }
				for (var size = 2; size <= n; size <<= 1) {
					var half = size >> 1, step = n / size;
					for (var s = 0; s < n; s += size) {
						for (var k = 0, t = 0; k < half; k++, t += step) {
							var a = s + k, b = a + half, tr = re[b] * cos[t] + im[b] * sin[t], ti = im[b] * cos[t] - re[b] * sin[t];
							re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
						}
					}
				}
				for (i = 0; i <= n / 2; i++) out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
			};
		}

		/** Mono mix + decimation to ~22–24 kHz (box filter; aliasing is harmless for onset detection). */
		function prepare(channels, sr, maxSec) {
			var len = channels[0].length, d = Math.max(1, Math.round(sr / 22050)), n = Math.floor(Math.min(len, maxSec ? maxSec * sr : len) / d), out = new Float32Array(n), ch = channels.length;
			for (var c = 0; c < ch; c++) {
				var x = channels[c], g = 1 / (ch * d);
				for (var i = 0; i < n; i++) { var s = 0, o = i * d; for (var j = 0; j < d; j++) s += x[o + j]; out[i] += s * g; }
			}
			return { x: out, sr: sr / d };
		}

		function Grow() { this.a = new Float32Array(4096); this.n = 0; }
		Grow.prototype.push = function (v) { if (this.n === this.a.length) { var b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; };
		Grow.prototype.view = function () { return this.a.subarray(0, this.n); };

		/** Streaming onset-strength extractor. push() any number of samples; frame t is centred on t·hop/sr. */
		function Onsets(sr) {
			this.sr = sr; this.n = sr > 32000 ? 2048 : 1024; this.hop = Math.max(64, Math.round(sr * 0.0116)); this.fps = sr / this.hop;
			this.fft = new FFT(this.n); this.win = new Float32Array(this.n); this.frame = new Float32Array(this.n); this.m = new Float32Array(this.n / 2 + 1);
			for (var i = 0; i < this.n; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / this.n);
			var bin = sr / this.n, self = this;
			this.bands = BANDS.map(function (b) { return [Math.max(1, Math.round(b[0] / bin)), Math.min(self.n / 2, Math.round(Math.min(b[1], sr / 2 - 200) / bin))]; });
			this.prev = [new Float32Array(this.n / 2 + 1), new Float32Array(this.n / 2 + 1), new Float32Array(this.n / 2 + 1)]; this.count = 0;
			this.flux = this.bands.map(function () { return new Grow(); });
			this.peak = new Grow(); this.low = new Grow(); this.high = new Grow();
			this.tail = new Float32Array(this.n / 2); // leading zeros: frame 0 is centred on sample 0
			this.samples = 0;
		}
		Onsets.prototype.push = function (x) {
			var t = new Float32Array(this.tail.length + x.length); t.set(this.tail); t.set(x, this.tail.length);
			var pos = 0, n = this.n, hop = this.hop;
			while (pos + n <= t.length) { this.doFrame(t, pos); pos += hop; }
			this.tail = t.slice(pos); this.samples += x.length;
		};
		Onsets.prototype.doFrame = function (t, pos) {
			var n = this.n, f = this.frame, w = this.win, m = this.m, pk = 0, i, c = pos + n / 2 - this.hop / 2;
			for (i = 0; i < n; i++) f[i] = t[pos + i] * w[i];
			for (i = 0; i < this.hop; i++) { var v = Math.abs(t[c + i] || 0); if (v > pk) pk = v; }
			this.fft.mag(f, m);
			var sc = 200 / n, cur = this.prev[this.count % 3], ref = this.prev[(this.count + 1) % 3], nb = m.length, lo = 0, hi = 0;
			for (i = 0; i < nb; i++) { var e = m[i] * sc; cur[i] = Math.log(1 + 100 * e); if (i < this.bands[0][1] * 2) lo += e * e; else if (i > this.bands[2][0]) hi += e * e; }
			for (var b = 0; b < this.bands.length; b++) {
				var s = 0, a0 = this.bands[b][0], a1 = this.bands[b][1];
				if (this.count >= 2) for (i = a0; i <= a1; i++) { var r = Math.max(ref[i - 1] || 0, ref[i], ref[i + 1] || 0), d = cur[i] - r; if (d > 0) s += d; }
				this.flux[b].push(s / (a1 - a0 + 1));
			}
			// cur becomes the reference two frames later (lag 2 = 23 ms)
			this.count++;
			this.peak.push(pk); this.low.push(lo); this.high.push(hi);
		};
		Onsets.prototype.frames = function () { return this.peak.n; };

		/* ---------- helpers ---------- */
		function mean(a, s, e) { s = s || 0; e = e == null ? a.length : e; var t = 0; for (var i = s; i < e; i++) t += a[i]; return e > s ? t / (e - s) : 0; }
		function median(arr) { var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; }), n = a.length; return n ? (n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; }
		function quant(arr, q) { var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; }); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; }
		function at(o, x) { if (x < 0 || x > o.length - 1) return 0; var i = Math.floor(x), f = x - i; return f ? o[i] * (1 - f) + o[i + 1] * f : o[i]; }

		/** Combined, detrended onset envelope (and a max-filtered copy for comb strengths). */
		function detrend(o, fps) {
			var N = o.length, W = Math.round(0.3 * fps), cs = new Float64Array(N + 1), od = new Float32Array(N), i;
			for (i = 0; i < N; i++) cs[i + 1] = cs[i] + o[i];
			for (i = 0; i < N; i++) { var a = Math.max(0, i - W), z = Math.min(N, i + W + 1), m = (cs[z] - cs[a]) / (z - a); od[i] = Math.max(0, o[i] - m); }
			var sd = 0; for (i = 0; i < N; i++) sd += od[i] * od[i]; sd = Math.sqrt(sd / Math.max(1, N)) || 1;
			for (i = 0; i < N; i++) od[i] /= sd;
			return od;
		}
		function maxf(od) { var N = od.length, mx = new Float32Array(N); for (var i = 0; i < N; i++) mx[i] = Math.max(od[i - 2] || 0, od[i - 1] || 0, od[i], od[i + 1] || 0, od[i + 2] || 0); return mx; }
		/** Combined, detrended onset envelope, a max-filtered copy (comb strengths) and a low/mid-band copy (no hi-hats). */
		function envelope(on) {
			var N = on.frames(), B = on.flux.length, means = on.flux.map(function (g) { return mean(g.view()); }), top = Math.max.apply(null, means) || 1e-9;
			var o = new Float32Array(N), lm = new Float32Array(N), i, b;
			for (b = 0; b < B; b++) { var v = on.flux[b].view(), nrm = Math.max(means[b], 0.15 * top) * B; for (i = 0; i < N; i++) { o[i] += v[i] / nrm; if (b < B - 1) lm[i] += v[i] / nrm; } }
			var od = detrend(o, on.fps);
			return { o: od, mx: maxf(od), lm: maxf(detrend(lm, on.fps)), raw: o };
		}

		function acf(o, s, e, maxLag) {
			var A = new Float32Array(maxLag + 1), n = e - s;
			for (var L = 0; L <= maxLag && L < n; L++) { var t = 0; for (var i = s; i + L < e; i++) t += o[i] * o[i + L]; A[L] = t / (n - L); }
			return A;
		}
		function salience(A, fps, bpm) {
			var L = 60 * fps / bpm, h = 0, w = [1, 0.5, 0.33, 0.25];
			for (var k = 1; k <= 4; k++) { if (k * L < A.length - 1) h += w[k - 1] * at(A, k * L); }
			return h;
		}
		function oct(b) { return Math.abs(Math.log(b / 120) / Math.LN2); }
		function prior(bpm, c, sig) { var z = Math.log(bpm / (c || 120)) / Math.LN2 / (sig || 1.2); return Math.exp(-0.5 * z * z); }

		/** Best-phase comb over frames [s,e) at period P: {B, M (half-beats), T (third-beats), phi} */
		function comb(mx, s, e, P, ms) {
			var best = -1, phi = 0, k, x;
			ms = ms || mx;
			for (var p = 0; p < P; p += 0.5) {
				var t = 0, n = 0;
				for (x = s + p; x < e; x += P) { t += at(mx, x); n++; }
				if (n && t / n > best) { best = t / n; phi = p; }
			}
			var M = 0, nM = 0, T = 0, nT = 0, Bm = 0, nB = 0;
			for (x = s + phi; x < e; x += P) { Bm += at(ms, x); nB++; }
			for (x = s + phi + P / 2; x < e; x += P) { M += at(ms, x); nM++; }
			for (x = s + phi + P / 3; x < e; x += P) { T += Math.min(at(ms, x), at(ms, x + P / 3)); nT++; }
			return { B: nB ? Bm / nB : 0, M: nM ? M / nM : 0, T: nT ? T / nT : 0, phi: s + phi };
		}

		/** Local tempo per window (bpm within [lo, hi]) */
		function localTempo(o, fps, s, e, lo, hi) {
			var maxLag = Math.min(e - s - 1, Math.ceil(2 * 60 * fps / lo) + 2), A = acf(o, s, e, maxLag), best = -1, bb = 0;
			if (A[0] <= 1e-9) return null;
			for (var b = lo; b <= hi; b += 0.25) {
				var L = 60 * fps / b, v = at(A, L) + (2 * L < maxLag ? 0.5 * at(A, 2 * L) : 0);
				if (v > best) { best = v; bb = b; }
			}
			return { bpm: bb, strength: best / A[0] };
		}

		/** Dynamic-programming beat tracker with time-varying period Pf[t] (frames). */
		function track(o, Pf, alpha) {
			var N = o.length, score = new Float32Array(N), back = new Int32Array(N), t, j;
			for (t = 0; t < N; t++) {
				var P = Pf[t], j0 = Math.max(0, Math.round(t - 2 * P)), j1 = Math.round(t - P / 2), bv = 0, bj = -1;
				for (j = j0; j <= j1; j++) { var l = Math.log((t - j) / P), v = score[j] - alpha * l * l; if (bj < 0 || v > bv) { bv = v; bj = j; } }
				score[t] = o[t] + (bj >= 0 && bv > 0 ? bv : 0); back[t] = bj >= 0 && bv > 0 ? bj : -1;
			}
			// best end among the last period
			var P = Pf[N - 1], end = N - 1, bs = -1;
			for (t = Math.max(0, Math.round(N - 1 - P)); t < N; t++) if (score[t] > bs) { bs = score[t]; end = t; }
			var beats = [];
			for (t = end; t >= 0; t = back[t]) beats.push(t);
			return beats.reverse();
		}

		/** Sub-frame peak refinement around each beat (±2 frames) */
		function refine(o, beats) {
			return beats.map(function (b) {
				var bi = b, v = o[b];
				for (var d = -2; d <= 2; d++) if (o[b + d] > v) { v = o[b + d]; bi = b + d; }
				var y0 = o[bi - 1] || 0, y1 = o[bi], y2 = o[bi + 1] || 0, den = y0 - 2 * y1 + y2, off = den < 0 ? 0.5 * (y0 - y2) / den : 0;
				return v > 0 ? bi + Math.max(-0.5, Math.min(0.5, off)) : b;
			});
		}

		/** Least-squares period over beats (frames) with beat indices from rounded intervals; robust to 1 skipped beat. */
		function fitPeriod(bt, P0) {
			if (bt.length < 3) return { P: P0, t0: bt[0] || 0, n: bt.length };
			var idx = [0];
			for (var i = 1; i < bt.length; i++) idx.push(idx[i - 1] + Math.max(1, Math.round((bt[i] - bt[i - 1]) / P0)));
			function fit(use) {
				var n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
				for (var i = 0; i < bt.length; i++) if (use[i]) { n++; sx += idx[i]; sy += bt[i]; sxx += idx[i] * idx[i]; sxy += idx[i] * bt[i]; }
				var P = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), t0 = (sy - P * sx) / (n || 1);
				return { P: P, t0: t0, n: n };
			}
			var use = bt.map(function () { return true; }), f = fit(use);
			for (var it = 0; it < 2; it++) {
				var res = bt.map(function (b, i) { return Math.abs(b - (f.t0 + f.P * idx[i])); });
				use = res.map(function (r) { return r < 0.2 * f.P; });
				if (use.filter(Boolean).length >= 3) f = fit(use);
			}
			return f;
		}

		function feel(bpm) {
			var T = [[40, 'Grave'], [60, 'Largo'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [1e9, 'Prestissimo']];
			for (var i = 0; i < T.length; i++) if (bpm < T[i][0]) return T[i][1];
			return 'Prestissimo';
		}

		/**
		 * Full analysis of an onset stream. opts: {live: bool}
		 * returns {none:'silent'|'nobeat'|'short'|null, bpm, confidence, beats (s), sections, curve, alts, ...}
		 */
		function analyse(on, opts) {
			opts = opts || {};
			var fps = on.fps, N = on.frames(), dur = N / fps, i, w;
			var res = { duration: dur, fps: fps, none: null };
			if (dur < 4) { res.none = 'short'; return res; }
			var pk = on.peak.view(), loud = quant(pk, 0.998);
			if (loud < 0.003) { res.none = 'silent'; return res; }
			var E = envelope(on), o = E.o, mx = E.mx;
			res.env = o;
			// 1. global tempo candidate
			var maxLag = Math.min(N - 2, Math.ceil(4 * 60 * fps / 40)), A = acf(o, 0, N, maxLag), best = -1, c0 = 120;
			for (var b = 40; b <= 240; b += 0.25) { var v = salience(A, fps, b) * prior(b); if (v > best) { best = v; c0 = b; } }
			// 2. windows
			var WL = Math.min(N, Math.round(8 * fps)), hop = Math.round((opts.live ? 1 : 2) * fps), wins = [];
			for (var s = 0; s + WL <= N; s += hop) wins.push(s);
			if (!wins.length || wins[wins.length - 1] + WL < N - hop / 2) wins.push(Math.max(0, N - WL));
			var lt = wins.map(function (s) { return localTempo(o, fps, s, s + WL, Math.max(30, c0 / 1.3), Math.min(300, c0 * 1.3)); });
			// 3. metrical level: start at the slowest octave ≥ 40, climb while half-beats (or third-beats) are strong
			var f = 1;
			while (c0 * f / 2 >= 40) f /= 2;
			var trace = [];
			function ratios(fac) {
				var rM = [], rT = [], rL = [];
				wins.forEach(function (s, k) {
					if (!lt[k]) return;
					var P = 60 * fps / (lt[k].bpm * fac), mu = median(mx.subarray(s, s + WL)), c = comb(mx, s, s + WL, P), d = c.B - mu;
					if (d <= 0.05) return;
					rM.push(Math.max(0, Math.min(1.2, (c.M - mu) / d))); rT.push(Math.max(0, Math.min(1.2, (c.T - mu) / d)));
					var ml = median(E.lm.subarray(s, s + WL)), cl = comb(mx, s, s + WL, P, E.lm), dl = cl.B - ml;
					rL.push(dl > 0.05 ? Math.max(0, Math.min(1.2, (cl.M - ml) / dl)) : 0);
				});
				return { M: rM.length ? median(rM) : 0, T: rT.length ? median(rT) : 0, L: rL.length ? median(rL) : 0, n: rM.length };
			}
			for (var guard = 0; guard < 4; guard++) {
				var c = c0 * f, r = ratios(f), dd = oct(2 * c) - oct(c);
				trace.push([Math.round(c * 10) / 10, +r.M.toFixed(2), +r.L.toFixed(2), +r.T.toFixed(2)]);
				// up an octave when the half-beats carry onsets and the faster tempo is at least as plausible
				if (2 * c <= 250 && r.M >= 0.2 && dd < 0.4 * (r.M - 0.3)) { f *= 2; continue; }
				if (3 * c <= 200 && c < 80 && r.T >= 0.6 && r.M < 0.35) { f *= 3; continue; }
				break;
			}
			res.trace = trace; res.c0 = c0;
			var base = c0 * f;
			// 4. period curve (frames) per window centre, interpolated
			var cen = [], per = [];
			wins.forEach(function (s, k) { if (lt[k] && lt[k].strength > 0.02) { cen.push(s + WL / 2); per.push(60 * fps / (lt[k].bpm * f)); } });
			if (!per.length) { cen = [N / 2]; per = [60 * fps / base]; }
			// smooth the period curve (median of 3), keep octave-consistent
			var sm = per.map(function (p, k) { return median(per.slice(Math.max(0, k - 1), k + 2)); });
			var Pf = new Float32Array(N), k2 = 0;
			for (i = 0; i < N; i++) {
				while (k2 < cen.length - 1 && cen[k2 + 1] <= i) k2++;
				if (i <= cen[0]) Pf[i] = sm[0]; else if (k2 >= cen.length - 1) Pf[i] = sm[sm.length - 1];
				else { var a = (i - cen[k2]) / (cen[k2 + 1] - cen[k2]); Pf[i] = sm[k2] * (1 - a) + sm[k2 + 1] * a; }
			}
			// 5. beats
			var raw = track(o, Pf, 60), bt = refine(o, raw);
			// trim weak leading/trailing beats
			var bv = bt.map(function (b) { return at(mx, b); }), thr = 0.25 * quant(bv, 0.5);
			while (bt.length > 2 && bv[0] < thr) { bt.shift(); bv.shift(); }
			while (bt.length > 2 && bv[bv.length - 1] < thr) { bt.pop(); bv.pop(); }
			// 6. local BPM from beat intervals → sections
			var loc = [];
			for (i = 1; i < bt.length; i++) {
				var iv = bt[i] - bt[i - 1], P = Pf[Math.round(bt[i])], m = Math.max(1, Math.round(iv / P));
				loc.push({ t: (bt[i] + bt[i - 1]) / 2 / fps, bpm: 60 * fps * m / iv });
			}
			var smooth = loc.map(function (p, k) { return { t: p.t, bpm: median(loc.slice(Math.max(0, k - 4), k + 5).map(function (q) { return q.bpm; })) }; });
			res.curve = smooth;
			var sections = [], cur = null;
			smooth.forEach(function (p, k) {
				if (!cur) { cur = { i0: k, i1: k, vals: [p.bpm] }; return; }
				var md = median(cur.vals);
				if (Math.abs(p.bpm / md - 1) > 0.04) {
					// need 4 consecutive points away from the current section to split
					var run = smooth.slice(k, k + 4).filter(function (q) { return Math.abs(q.bpm / md - 1) > 0.04; }).length;
					if (run >= 4 || k + 4 > smooth.length && run >= smooth.length - k) { sections.push(cur); cur = { i0: k, i1: k, vals: [p.bpm] }; return; }
				}
				cur.i1 = k; cur.vals.push(p.bpm);
			});
			if (cur) sections.push(cur);
			// fit each section; merge short sections (< 6 s) into neighbours
			var secs = sections.map(function (sc) {
				var b0 = sc.i0, b1 = sc.i1 + 1, sub = bt.slice(b0, b1 + 1), P0 = 60 * fps / median(sc.vals), fp = fitPeriod(sub, P0);
				return { start: bt[b0] / fps, end: bt[b1] / fps, bpm: 60 * fps / fp.P, beats: sub.length };
			}).filter(function (sc) { return sc.end - sc.start >= Math.min(6, dur / 3); });
			if (!secs.length) { var fpa = fitPeriod(bt, 60 * fps / base); secs = [{ start: (bt[0] || 0) / fps, end: (bt[bt.length - 1] || 0) / fps, bpm: 60 * fps / fpa.P, beats: bt.length }]; }
			// merge neighbours within 2.5 %
			var merged = [secs[0]];
			for (i = 1; i < secs.length; i++) {
				var L2 = merged[merged.length - 1];
				if (Math.abs(secs[i].bpm / L2.bpm - 1) < 0.025) {
					var w1 = L2.end - L2.start, w2 = secs[i].end - secs[i].start;
					L2.bpm = (L2.bpm * w1 + secs[i].bpm * w2) / (w1 + w2); L2.end = secs[i].end; L2.beats += secs[i].beats;
				} else merged.push(secs[i]);
			}
			var dom = merged.reduce(function (a, x) { return x.end - x.start > a.end - a.start ? x : a; }, merged[0]);
			if (merged.length === 1) {
				var fa = fitPeriod(bt, 60 * fps / dom.bpm); dom.bpm = 60 * fps / fa.P;
			}
			res.sections = merged; res.bpm = dom.bpm; res.change = merged.length > 1;
			var bpmVals = smooth.map(function (p) { return p.bpm; });
			res.range = bpmVals.length ? [quant(bpmVals, 0.05), quant(bpmVals, 0.95)] : [res.bpm, res.bpm];
			// beat times in seconds (latency-compensated)
			res.beats = bt.map(function (b) { return b / fps - LATENCY; });
			// downbeat guess: strongest low-band accent among 4 phases
			var low = on.flux[0].view(), acc = [0, 0, 0, 0];
			bt.forEach(function (b, k) { acc[k % 4] += at(low, b) + 0.5 * at(on.flux[1].view(), b); });
			res.downbeat = acc.indexOf(Math.max.apply(null, acc));
			// 7. confidence
			var Lb = 60 * fps / res.bpm, om = mean(o), m2 = om * om, per0 = A[0] > m2 ? Math.max(at(A, Lb) - m2, 0.5 * (at(A, 2 * Lb) - m2)) / (A[0] - m2) : 0;
			var onB = mean(bt.map(function (b) { return at(mx, b); })), all = mean(mx), contrast = all > 0 ? onB / all : 0;
			var agree = lt.filter(function (x) { return x; }).map(function (x) { var q = x.bpm * f, rr = q / res.bpm; return Math.abs(rr - 1) < 0.04 || res.change; }), cons = agree.length ? agree.filter(Boolean).length / agree.length : 0;
			res.metrics = { periodicity: +per0.toFixed(3), contrast: +contrast.toFixed(2), consistency: +cons.toFixed(2) };
			var sc1 = Math.max(0, Math.min(1, (per0 - 0.05) / 0.3)), sc2 = Math.max(0, Math.min(1, (contrast - 1.6) / 2.4));
			res.confidence = Math.round(100 * Math.pow(sc1 * sc2, 0.5) * (0.6 + 0.4 * cons));
			if (res.confidence < 18 || bt.length < 4) res.none = 'nobeat';
			// alternatives
			var r1 = ratios(f / 2), rUp = ratios(f * 2);
			res.alts = [
				{ bpm: res.bpm / 2, kind: 'half', fit: 1 },
				{ bpm: res.bpm * 2, kind: 'double', fit: +(rUp.M || 0).toFixed(2) }
			];
			if (f && res.trace.length) res.halfFit = +r1.M.toFixed(2);
			res.feel = feel(res.bpm);
			return res;
		}

		/** Beat list for another metrical level: factor 2 inserts half-beats, 0.5 keeps the stronger of the two interleaved grids. */
		function rescale(beats, env, fps, factor) {
			if (factor === 2) { var out = []; for (var i = 0; i < beats.length; i++) { out.push(beats[i]); if (i + 1 < beats.length) out.push((beats[i] + beats[i + 1]) / 2); } return out; }
			if (factor === 0.5) {
				var s = [0, 0]; beats.forEach(function (b, k) { s[k % 2] += at(env, (b + LATENCY) * fps); });
				var p = s[1] > s[0] ? 1 : 0; return beats.filter(function (b, k) { return k % 2 === p; });
			}
			return beats.slice();
		}

		return { FFT: FFT, prepare: prepare, Onsets: Onsets, analyse: analyse, rescale: rescale, feel: feel, median: median, BANDS: BANDS, setLatency: function (v) { LATENCY = v; }, latency: function () { return LATENCY; } };
	})();

/* ---------- opc-engine public API ---------- */
var OPCEngine = (function () {
	var VERSION = '1.0.0';
	var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

	var L = OPCLite, relativeName = L.relativeName;

	/* ---------- encoders ---------- */
	function Dither(seed) { this.s = seed || 22222; }
	Dither.prototype.tpdf = function () {
		var s = this.s;
		s = (s * 1103515245 + 12345) & 0x7fffffff; var r1 = s / 0x7fffffff;
		s = (s * 1103515245 + 12345) & 0x7fffffff; var r2 = s / 0x7fffffff;
		this.s = s; return r1 - r2;
	};
	/** 16-bit PCM WAV (TPDF dither), any channel count, the given sample rate. */
	function encodeWav(channels, sr) {
		var C = channels.length, L = channels[0].length, bytes = 44 + L * C * 2, buf = new ArrayBuffer(bytes), v = new DataView(buf), o = 0, i, ch, d = new Dither();
		function str(s) { for (var k = 0; k < s.length; k++) v.setUint8(o++, s.charCodeAt(k)); }
		str('RIFF'); v.setUint32(o, bytes - 8, true); o += 4; str('WAVE'); str('fmt '); v.setUint32(o, 16, true); o += 4;
		v.setUint16(o, 1, true); o += 2; v.setUint16(o, C, true); o += 2; v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * C * 2, true); o += 4;
		v.setUint16(o, C * 2, true); o += 2; v.setUint16(o, 16, true); o += 2; str('data'); v.setUint32(o, L * C * 2, true); o += 4;
		var pcm = new Int16Array(buf, 44, L * C);
		for (i = 0; i < L; i++) for (ch = 0; ch < C; ch++) {
			var s = Math.round(channels[ch][i] * 32767 + d.tpdf());
			pcm[i * C + ch] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
		}
		return buf;
	}
	/** Read a 16-bit PCM WAV back (tests / fixtures). */
	function decodeWav(ab) {
		var v = new DataView(ab), s4 = function (o) { return String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)); };
		if (s4(0) !== 'RIFF' || s4(8) !== 'WAVE') throw new Error('not a WAV file');
		var o = 12, C = 0, sr = 0, bits = 0, fmt = 0, data = -1, len = 0;
		while (o + 8 <= ab.byteLength) {
			var id = s4(o), sz = v.getUint32(o + 4, true);
			if (id === 'fmt ') { fmt = v.getUint16(o + 8, true); C = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
			if (id === 'data') { data = o + 8; len = Math.min(sz, ab.byteLength - data); break; }
			o += 8 + sz + (sz & 1);
		}
		if (fmt !== 1 || bits !== 16 || data < 0) throw new Error('only 16-bit PCM WAV');
		var n = Math.floor(len / 2 / C), pcm = new Int16Array(ab.slice(data, data + n * C * 2)), chs = [];
		for (var c = 0; c < C; c++) { var a = new Float32Array(n); for (var i = 0; i < n; i++) a[i] = pcm[i * C + c] / 32768; chs.push(a); }
		return { channels: chs, sampleRate: sr };
	}
	var MP3_RATES = L.MP3_RATES;
	/** MP3 encoder job (needs lamejs, LGPL-3.0). Resumable: run(deadline). Mono or stereo (more channels are mixed to stereo). */
	function Mp3Job(channels, sr, kbps, lame, gain) {
		if (!lame || !lame.Mp3Encoder) throw new Error('lamejs is not loaded');
		if (MP3_RATES.indexOf(sr) < 0) throw new Error('MP3 needs 8–48 kHz (got ' + sr + ' Hz)');
		var C = Math.min(2, channels.length);
		this.L = channels[0].length; this.C = C; this.pos = 0; this.parts = []; this.bytes = 0; this.done = false; this.progress = 0;
		if (channels.length > 2) { var l = new Float32Array(this.L), r = new Float32Array(this.L); for (var c = 0; c < channels.length; c++) { var x = channels[c], t = c % 2 ? r : l; for (var i = 0; i < this.L; i++) t[i] += x[i] / Math.ceil(channels.length / 2); } channels = [l, r]; }
		this.ch = channels; this.enc = new lame.Mp3Encoder(C, sr, kbps || 192); this.d = new Dither(4242); this.g = 32767 * (gain > 0 ? gain : 1); /* gain > 0: fixed factor; gain < 0: ceiling |gain| (e.g. −0.891 = −1 dBFS, peak measured here) */
		if (gain < 0) { var pk = OPCShift.peakOf(channels); this.g = 32767 * (pk > -gain ? -gain / pk : 1); }
		this.block = 1152 * 16; this.l16 = new Int16Array(this.block); this.r16 = C > 1 ? new Int16Array(this.block) : null;
	}
	Mp3Job.prototype.run = function (deadline) {
		var k = 0;
		while (!this.done) {
			var n = Math.min(this.block, this.L - this.pos);
			if (n <= 0) { var tail = this.enc.flush(); if (tail.length) { this.parts.push(new Uint8Array(tail)); this.bytes += tail.length; } this.done = true; this.progress = 1; break; }
			var a = this.ch[0], b = this.C > 1 ? this.ch[1] : null, l = n === this.block ? this.l16 : new Int16Array(n), r = b ? (n === this.block ? this.r16 : new Int16Array(n)) : null, i, s;
			for (i = 0; i < n; i++) {
				s = Math.round(a[this.pos + i] * this.g + this.d.tpdf()); l[i] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
				if (b) { s = Math.round(b[this.pos + i] * this.g + this.d.tpdf()); r[i] = s > 32767 ? 32767 : s < -32768 ? -32768 : s; }
			}
			var out = b ? this.enc.encodeBuffer(l, r) : this.enc.encodeBuffer(l);
			if (out.length) { this.parts.push(new Uint8Array(out)); this.bytes += out.length; }
			this.pos += n; this.progress = this.pos / this.L;
			if ((++k & 1) === 0 && now() > deadline) break;
		}
		return this.done;
	};
	Mp3Job.prototype.result = function () { var u = new Uint8Array(this.bytes), o = 0; for (var i = 0; i < this.parts.length; i++) { u.set(this.parts[i], o); o += this.parts[i].length; } return u; };

	/* ---------- analysis: key (+ tuning) and tempo, resumable ---------- */
	/** mono: Float32Array (22050 Hz recommended, the rate the key detector was tested at). */
	function AnalysisJob(mono, sr, opt) {
		opt = opt || {};
		this.sr = sr; this.dur = mono.length / sr; this.done = false; this.progress = 0;
		this.A = new PKF.Analyser(sr); var n = this.A.n;
		this.x = mono.length < n ? (function () { var p = new Float32Array(n); p.set(mono); return p; })() : mono;
		this.hop = Math.max(n / 4, Math.ceil((this.x.length - n) / 1500)); this.off = 0;
		this.total = Math.max(1, Math.ceil((this.x.length - n) / this.hop) + 1);
		this.wantBpm = opt.bpm !== false;
		if (this.wantBpm) { this.p = PBD.prepare([mono], sr, opt.maxSec || 900); this.on = new PBD.Onsets(this.p.sr); this.bpos = 0; this.bstep = Math.round(this.p.sr * 4); }
	}
	AnalysisJob.prototype.run = function (deadline) {
		var n = this.A.n, k = 0;
		while (!this.done) {
			if (this.off + n <= this.x.length) { this.A.frame(this.x, this.off, (this.off + n / 2) / this.sr, 0.0004); this.off += this.hop; }
			else if (this.wantBpm && this.bpos < this.p.x.length) { this.on.push(this.p.x.subarray(this.bpos, this.bpos + this.bstep)); this.bpos += this.bstep; }
			else { this.finish(); break; }
			var kp = Math.min(1, this.off / Math.max(1, this.x.length - n + this.hop)), bp = this.wantBpm ? this.bpos / Math.max(1, this.p.x.length) : 1;
			this.progress = Math.min(0.99, this.wantBpm ? 0.7 * kp + 0.28 * bp : 0.99 * kp);
			if ((++k & 1) === 0 && now() > deadline) break;
		}
		return this.done;
	};
	AnalysisJob.prototype.finish = function () {
		var res = PKF.analyse(this.A.frames), out = { duration: this.dur, key: null, bpm: null };
		if (this.dur < 3) res.none = res.none || 'short';
		out.tune = res.tune || 0; out.tuneStrength = res.tuneStrength || 0; out.a4 = res.a4 || 440;
		out.keyConfidence = res.confidence || 0; out.keyNone = res.none || '';
		if (res.key) {
			out.key = { k: res.key.k, name: res.key.name, short: res.key.short, minor: res.key.minor, relative: res.key.relative, relativeName: relativeName(res.key.k), camelot: res.key.camelot, alt: res.key.alt };
			out.candidates = (res.candidates || []).map(function (c) { return { k: c.k, name: c.name, relative: c.relative }; });
			out.keyChange = res.change ? { name: res.change.name, start: res.change.start, end: res.change.end } : null;
		}
		if (this.wantBpm) {
			if (this.p.x.length / this.p.sr >= 4) {
				this.on.push(new Float32Array(this.on.n / 2));
				var b = PBD.analyse(this.on, {});
				out.bpm = { bpm: b.bpm || 0, confidence: b.confidence || 0, none: b.none || '', change: !!b.change, sections: (b.sections || []).map(function (s) { return { start: s.start, end: s.end, bpm: s.bpm }; }) };
			} else out.bpm = { bpm: 0, confidence: 0, none: 'short' };
		}
		this.result = out; this.done = true; this.progress = 1;
	};

	return {
		version: VERSION,
		shift: OPCShift, key: PKF, bpm: PBD,
		Job: OPCShift.Job, renderSync: OPCShift.renderSync, ratioOf: OPCShift.ratioOf,
		AnalysisJob: AnalysisJob, Mp3Job: Mp3Job, MP3_RATES: MP3_RATES,
		encodeWav: encodeWav, decodeWav: decodeWav, sniffRate: L.sniffRate, sniffType: L.sniffType, lite: L,
		keyInfo: PKF.keyInfo, keyName: L.keyName, relativeName: L.relativeName, transposeKey: L.transposeKey, shiftBetween: L.shiftBetween, intervalText: L.intervalText,
		fileKeyLabel: L.fileKeyLabel, fileName: L.fileName, fmtShift: L.fmtShift, INTERVALS: L.INTERVALS
	};
})();

/* ---------- opc-engine job host: the same message protocol in a Web Worker or on the main thread ----------
 * in:  {cmd:'load', chs:[Float32Array], sr}            keeps the source channels (renders read them)
 *      {cmd:'render', id, pri, opts:{semi,cents,tempo,formant,quality,from,to,ceiling}}
 *      {cmd:'analyse', id, pri, mono:Float32Array, sr, bpm:true}
 *      {cmd:'mp3', id, pri, chs, sr, kbps, gain}   {cmd:'wav', id, chs, sr}
 *      {cmd:'cancel', ids:[...]} | {cmd:'cancel', all:true} | {cmd:'unload'}
 * out: {type:'progress', id, p} · {type:'done', id, kind, ...} · {type:'error', id, message}
 * Lower pri runs first (0 = preview sections, 1 = analysis, 2 = full render, 3 = encoding); each slice ≈ 20 ms. */
OPCEngine.Host = function (post, loadLame) {
	var chs = null, sr = 0, jobs = [], timer = 0, seq = 0, E = OPCEngine;
	function schedule() { if (!timer && jobs.length) timer = setTimeout(loop, 0); }
	function fail(j, e) { post({ type: 'error', id: j.id, kind: j.kind, message: String(e && e.message || e) }); }
	function loop() {
		timer = 0;
		if (!jobs.length) return;
		jobs.sort(function (a, b) { return a.pri - b.pri || a.seq - b.seq; });
		var j = jobs[0], t0 = Date.now(), done = false;
		try { done = j.job.run((typeof performance !== 'undefined' ? performance.now() : Date.now()) + 20); }
		catch (e) { jobs.shift(); fail(j, e); schedule(); return; }
		if (!done) {
			if (Date.now() - (j.lastP || 0) > 120) { j.lastP = Date.now(); post({ type: 'progress', id: j.id, kind: j.kind, p: j.job.progress }); }
		} else {
			jobs.shift();
			var msg = { type: 'done', id: j.id, kind: j.kind, ms: Date.now() - j.t0 }, tr = [];
			if (j.kind === 'render') {
				var tm = j.job.trim;
				msg.chs = j.job.out; msg.gain = j.job.gain; msg.peak = j.job.peak; msg.rawPeak = j.job.rawPeak; msg.nan = j.job.nan; msg.sr = sr;
				msg.from = tm ? tm.from : 0; msg.to = tm ? tm.to : chs[0].length / sr; msg.full = !tm; msg.opts = j.opts;
				msg.chs.forEach(function (a) { tr.push(a.buffer); });
			} else if (j.kind === 'analyse') msg.result = j.job.result;
			else if (j.kind === 'mp3') { msg.data = j.job.result(); tr.push(msg.data.buffer); msg.chs = j.src; j.src.forEach(function (a) { tr.push(a.buffer); }); }
			post(msg, tr);
		}
		void t0;
		schedule();
	}
	function add(kind, m, job, extra) {
		var j = { id: m.id, kind: kind, pri: m.pri == null ? 2 : m.pri, seq: ++seq, job: job, t0: Date.now(), opts: m.opts };
		if (extra) for (var k in extra) j[k] = extra[k];
		jobs.push(j); schedule();
	}
	return {
		handle: function (m) {
			try {
				if (m.cmd === 'load') { chs = m.chs; sr = m.sr; jobs = jobs.filter(function (j) { return j.kind === 'analyse'; }); post({ type: 'loaded', id: m.id, sr: sr, len: chs[0].length }); }
				else if (m.cmd === 'unload') { chs = null; jobs = []; }
				else if (m.cmd === 'render') { if (!chs) throw new Error('no audio loaded'); add('render', m, new E.Job(chs, sr, m.opts || {})); }
				else if (m.cmd === 'analyse') add('analyse', m, new E.AnalysisJob(m.mono, m.sr, { bpm: m.bpm !== false }));
				else if (m.cmd === 'mp3') {
					var go = function (lame) { add('mp3', m, new E.Mp3Job(m.chs, m.sr, m.kbps || 192, lame, m.gain), { src: m.chs }); };
					if (typeof lamejs !== 'undefined') go(lamejs);
					else loadLame(function (err) { if (err || typeof lamejs === 'undefined') post({ type: 'error', id: m.id, kind: 'mp3', message: 'The MP3 encoder could not be loaded.' }); else go(lamejs); });
				}
				else if (m.cmd === 'wav') { var ab = E.encodeWav(m.chs, m.sr); post({ type: 'done', id: m.id, kind: 'wav', data: new Uint8Array(ab), chs: m.chs }, [ab].concat(m.chs.map(function (a) { return a.buffer; }))); }
				else if (m.cmd === 'cancel') { jobs = m.all ? [] : jobs.filter(function (j) { return m.ids.indexOf(j.id) < 0; }); }
			} catch (e) { post({ type: 'error', id: m.id, kind: m.cmd, message: String(e && e.message || e) }); }
		},
		busy: function () { return jobs.length; }
	};
};

if (typeof module !== "undefined" && module.exports) module.exports = OPCEngine; else { root.OPCEngine = OPCEngine; root.OPCLite = OPCLite; }
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);

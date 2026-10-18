/*! opc-engine worker 1.0.0 | onlinepitchchanger.com | runs pitch-shift renders, key/tempo analysis and MP3 encoding off the page's main thread */
var q = (self.location && self.location.search) || '';
importScripts('opc-engine.js' + q);
var host = OPCEngine.Host(function (m, tr) { self.postMessage(m, tr || []); }, function (cb) {
	try { importScripts('vendor/lame.min.js' + q); cb(null); } catch (e) { cb(e); }
});
self.onmessage = function (e) { host.handle(e.data); };

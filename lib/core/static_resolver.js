/** Default handler, serves up files statically. */
var myutils	= require("myutils"),
	mime	= require("mime"),
	fs		= require("fs");

module.exports = function(server) {
	var statCache = {};
	var mimeCache = {};
	var fileCache = {};

	var responder = function(req, res) {
		res.writeHead(200, {
			"Content-Type": req.ctx.mimeType,
			"Content-Length": req.ctx.resourceStats.size
		});

		if(fileCache[req.ctx.resource])
			res.end(fileCache[req.ctx.resource]);
		else
			fs.readFile(req.ctx.resource, function(err, data) { fileCache[req.ctx.resource] = data; res.end(data); });
	};
	
	var getMIME = function(file) {
		if(mimeCache[file]) return mimeCache[file];
		
		return mimeCache[file] = mime.lookup(file) || "text/plain";
	};

	var attemptResolution = function(req) {
		var path = req.ctx.url.pathname;
		var file = server.config.document_root + path;

		if(statCache[file]) {
			req.ctx.resourceStats = statCache[file];
			req.ctx.resource = file;
			req.ctx.responder = responder;
			req.ctx.mimeType = getMIME(file);

			return true;
		}

		var callback = this.deferHandler();
		var success = function(stats) {
			statCache[file] = stats;
			req.ctx.resourceStats = stats;
			req.ctx.resource = file;
			req.ctx.mimeType = getMIME(file);

			req.ctx.responder = responder;
			callback(true);
		}.bind(this);

		fs.stat(file, function(err, stats) {
			err ? callback() : success(stats);
		});
	};

	server.on("request_resolve", function(req) {
		(req.ctx.url.pathname.charAt(-1) != "/") && attemptResolution.call(this, req);
	});
};

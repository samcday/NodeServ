/** Default handler, serves up files statically. */
var myutils	= require("myutils"),
	mime	= require("mime"),
	fs		= require("fs");

module.exports = function(server) {
	var responder = function(req, res) {
		res.writeHead(200, {
			"Content-Type": req.ctx.mimeType,
			"Content-Length": req.ctx.resourceStats.size
		});

		fs.readFile(req.ctx.resource, function(err, data) { res.end(data); });
	};

	var attemptResolution = function(req) {
		var path = req.ctx.url.pathname;
		var file = server.config.document_root + path;

		var callback = this.deferHandler();
		var success = function(stats) {
			req.ctx.resourceStats = stats;
			req.ctx.resource = file;
			req.ctx.mimeType = mime.lookup(file) || "text/plain";

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

var myutils = require("myutils"),
	fs		= require("fs"),
	async	= require("async"),
	path	= require("path");

module.exports = function(server) {
	if(!Array.isArray(server.config.index_files)) {
		server.config.index_files = myutils.cleanArray((server.config.index_files || "").split(";"));
	};

	var searchForIndexes = function(req) {
		var callback = this.deferHandler();
		var indexes = server.config.index_files.map(function(index) { return path.join(server.config.document_root, req.ctx.url.pathname, index); });
		async.detectSeries(indexes, path.exists, function(result) {
			result && (req.ctx.url.pathname += path.basename(result));
			callback(!!result);
		});
	};

	server.on("request_filter", function(req) {
		(req.ctx.url.pathname.charAt(-1) == "/") && searchForIndexes.call(this, req);
	});
};

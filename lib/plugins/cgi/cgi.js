var util	= require("util"),
	events	= require("asyncevents"),
	path	= require("path"),
	net		= require("net"),
	dns		= require("dns"),
	async 	= require("async");
	cgiCommon = require("./common");

module.exports = function(server) {
	var mappings = new Array();

	var createCGIHandler = function(bin) {
		return function(matches, req, res) {
			var headerParsed = false;

			var scriptInfo = {
				requestUri: req.ctx.url.pathname + (req.ctx.url.search || ""),
				scriptPath: matches.shift(),
				scriptName: matches.shift(),
				pathInfo: matches.shift()
			};

			scriptInfo.scriptUri = scriptInfo.scriptPath + scriptInfo.scriptName;
			var cgiParams = cgiCommon.buildCGIParams(req, scriptInfo);

			// Spawn CGI process.
			var cgiProcess = require("child_process").spawn(bin, [], {
				env: cgiParams
			});

			// Handle POST situations.
			if(req.method == "POST") {
				req.on("data", function(data) {
					cgiProcess.stdin.write(data);
				});
			}

			cgiProcess.on("exit", function() {
				console.log("bai.");
				res.end();
			});
			cgiProcess.stdout.on("data", function(data) { console.log("^_^" + data); });
			// Parse results.
			var reader = new cgiCommon.CGIResponseStreamReader(cgiProcess.stdout);
			reader.on("headers", function(headers) {
				console.log(headers);
				res.writeHead(200, headers);
			});

			reader.on("data", function(data) {
				res.write(data);
			});

			// TODO:
			cgiProcess.stderr.on('data', function(data) { console.log("stderr." + data);});
		};
	};

	server.config.cgi && Object.keys(server.config.cgi).forEach(function(ext) {
		mappings.push({
			ext: ext,
			regex: new RegExp("(.*?/)(.+?" + ext.replace(".", "\\.") + ")(?=$|/)(.*)", "i"),
			handler: createCGIHandler(server.config.cgi[ext])
		});
	});

	var attemptResolution = function(req) {
		var handler = null;

		mappings.forEach(function(mapping) {
			/*mapping.regex.test(req.ctx.url.pathname) && (handler = mapping.handler.bind(mapping));*/
			var result;
			if(result = mapping.regex.exec(req.ctx.url.pathname)) {
				handler = mapping.handler.bind(mapping, result.slice(1));
			}
		});

		if(handler) req.ctx.responder = handler;
		return !!handler;
	}.bind(server);

	server.on("request_resolve", function(req) {
		return attemptResolution(req); /* : false;*/
	});
};

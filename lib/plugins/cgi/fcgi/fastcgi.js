var util	= require("util"),
	events	= require("asyncevents"),
	cgiCommon = require("../common"),
	net		= require("net"),
	fs		= require("fs"),
	FCGISessionManager = require("./session_manager"),
	FCGIProcessManager = require("./process_manager");

module.exports = function(server) {
	var mappings = new Array();

	var createFCGIHandler = function(mapping) {
		return function(matches, req, res) {
			var scriptInfo = {
				requestUri: req.ctx.url.pathname + (req.ctx.url.search || ""),
				scriptPath: matches.shift(),
				scriptName: matches.shift(),
				pathInfo: matches.shift()
			}
			scriptInfo.scriptUri = scriptInfo.scriptPath + scriptInfo.scriptName;
			var cgiParams = cgiCommon.buildCGIParams(req, scriptInfo);

			// Array-ify the cgi params.
			var cgiParamsArray = [];
			Object.keys(cgiParams).forEach(function(key) {
				cgiParamsArray.push([key, (cgiParams[key] || "")+""]);
			});

			mapping.sessionManager.getSession(function(session) {
				// Begin conversation.
				session.beginRequest();
				
				// Relay facts.
				session.params(cgiParamsArray);

				// Provide speculation.
				var dataSent = 0;
				if(req.headers["content-length"]) {
					req.on("data", function(data) {
						session.input(data);
						dataSent += data.length;
						if(dataSent >= req.headers["content-length"])
							session.input("");
					});
				}
				else
					session.input("");
				
				// Use ears.
				var headerWritten = false;
				session.on("response_headers", function(headers) {
					headerWritten = true;
					res.writeHead(200, headers);
				});
				
				session.on("response_data", function(data) {
					res.write(data);
				});
				
				session.on("response_end", function() {
					res.end();
				});
				
				session.on("abort", function() {
					// TODO:
					console.log("??");
					if(!headerWritten) res.writeHead(500, {});
					res.end("Server error.");
				});
			});
		};
	};
	
	server.config.fcgi && Object.keys(server.config.fcgi).forEach(function(ext) {
		var mappingData = server.config.fcgi[ext];
		var mapping = {
			ext: ext,
			regex: new RegExp("(.*?/)(.+?" + ext.replace(".", "\\.") + ")(?=$|/)(.*)", "i"),
			binary: mappingData.binary
		};
		mapping.handler = createFCGIHandler(mapping);
		
		var manager = null;
		if(mappingData.binary) {
			manager = mapping.processManager = new FCGIProcessManager(mapping.binary, mappingData.processes || 3, mappingData.env || {});
		}
		else {
			// TODO:
		}
		mapping.sessionManager = new FCGISessionManager(manager);

		mappings.push(mapping);
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
		return attemptResolution(req)/* : false;*/
	});
	
	server.on("stop", function() {
		mappings.forEach(function(mapping) {
			mapping.sessionManager.stop();
		});
	});
};

// Common stuff between fastcgi and cgi.
var util	= require("util"),
	events	= require("asyncevents"),
	path	= require("path");

module.exports = {};

// A wrapper around a readable Stream. This is unique in that as data comes in it will first
// sense either CGI parsed headers or nonparsed headers, and will not try and scan through
// the response body (as it could be binary data).
// Emits two different events:
// 	- headers: when all http headers are fully parsed. Returned as keyed array ready to be
//			   passed into response.writeHead().
//  - data: as data chunks come in after the header is parsed.
var CGIResponseStreamReader = module.exports.CGIResponseStreamReader = function(stream) {
	this.headersParsed = false;
	this.headersRaw = "";

	var processHeaders = function() {
		var headerLines = this.headersRaw.split("\n");
		var headers = {};
		
		headerLines.forEach(function(line) {
			var headerParts = line.split(":");
			(headerParts.length == 2) && (headers[headerParts[0].trim()] = headerParts[1].trim());
		});

		this.emit("headers", headers);
		this.headersParsed = true;
	}.bind(this);

	var parseForHeaders = function(buffer) {
		// Loop through buffer and grab as many complete lines as we can.
		// Once we hit an empty line, we're done with headers.
		while(!this.headersParsed)
		{
			// TODO: Support for non-parsed headers (NPH).
			if(buffer.toString("utf8", 0, 4) == "HTTP") {
				throw new Error("NPH is not yet supported.");
			}

			var line = null;

			for(var i = 0; i < buffer.length; i++) {
				if(buffer[i] == 0x0A) {
					line = buffer.toString("utf8", 0, i).replace("\r", "");
					break;
				}
			}

			if(line === null) break;

			buffer = buffer.slice(Math.min(i + 1, buffer.length));
			this.headersRaw += line + "\n";

			// If there's two newlines in raw headers, it means headers are finished.
			if((this.headersRaw.charAt(this.headersRaw.length - 1) == "\n")
					&& (this.headersRaw.charAt(this.headersRaw.length - 2) == "\n"))
				processHeaders();
		}

		this.headersParsed ? this.emit("data", buffer) : (this.headersRaw += buffer.toString("utf8"));
	}.bind(this);

	process.nextTick(function() {
		stream.on("data", function(data) {
			!this.headersParsed ? parseForHeaders(data) : this.emit("data", data); 
		}.bind(this));
	}.bind(this));
};
util.inherits(CGIResponseStreamReader, events.EventEmitter);

// Processes a request, creates a set of parameters to pass to CGI application, either thru FCGI_PARAMS or CGI environment vars.
module.exports.buildCGIParams = function(req, scriptInfo) {
	// Setup environment.
	var env = {
		GATEWAY_INTERFACE: "CGI/1.1",
		REMOTE_ADDR: req.connection.remoteAddress,
		REMOTE_HOST: req.ctx.remoteHost,	// TODO:
		REQUEST_METHOD: req.method,
		SCRIPT_FILENAME: path.join(req.ctx.server.config.document_root, scriptInfo.scriptPath, scriptInfo.scriptName),
		REQUEST_URI: scriptInfo.requestUri,
		SCRIPT_NAME: scriptInfo.scriptUri,
		SERVER_NAME: req.ctx.url.hostname,
		SERVER_ADDR: "",						// TODO: !!
		SERVER_PORT: req.ctx.port,				// TODO: !!
		SERVER_PROTOCOL: "HTTP/1.1",
		SERVER_SOFTWARE: "NodeServ",
		REDIRECT_STATUS: "200",
		QUERY_STRING: req.ctx.url.query || ""
	};

	if(scriptInfo.pathInfo) {
		env.PATH_INFO = scriptInfo.pathInfo;
		env.PATH_TRANSLATED = path.join(req.ctx.server.config.document_root, scriptInfo.pathInfo);
	}

	if(req.method == "POST") {
		env.CONTENT_LENGTH = req.headers["content-length"];
		env.CONTENT_TYPE = req.headers["content-type"];
	}

	// Add in all the request headers.
	Object.keys(req.headers).forEach(function(headerName) {
		env["HTTP_" + headerName.replace("-", "_").toUpperCase()] = req.headers[headerName];
	});
	
	return env;
};

module.exports.setupCGIResolver = function() {
	return function(req) {
		
	}
};

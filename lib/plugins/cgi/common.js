// Common stuff between fastcgi and cgi.
var util	= require("util"),
	events	= require("asyncevents"),
	path	= require("path"),
	Stream	= require("stream").Stream;

module.exports = {};

// A wrapper around a readable Stream. This is unique in that as data comes in it will first
// sense either CGI parsed headers or nonparsed headers, and will not try and scan through
// the response body as a string (as it could be binary data).
// Emits two different events:
// 	- headers: when all http headers are fully parsed. Returned as keyed array ready to be
//			   passed into response.writeHead().
//  - data: as data chunks come in after the header is parsed.
var CGIResponseStreamReader = module.exports.CGIResponseStreamReader = function() {
	this._headersParsed = false;
	this._headersRaw = [];
	this._headerLine = "";
	
	arguments[0] && arguments[0] instanceof Stream && this.processStream(arguments[0]);
};
util.inherits(CGIResponseStreamReader, events.EventEmitter);

CGIResponseStreamReader.prototype. _processHeaders = function() {
	var headers = {};
	
	this._headersRaw.forEach(function(line) {
		var headerParts = line.split(":");
		(headerParts.length == 2) && (headers[headerParts[0].trim()] = headerParts[1].trim());
	});

	this.emit("headers", headers);
	this.headersParsed = true;
};

CGIResponseStreamReader.prototype.parseForHeaders = function(buffer) {
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
				line = buffer.toString("utf8", 0, i);
				break;
			}
		}

		if(line === null) {
			// Haven't gotten ourselves a complete line yet.
			this._headerLine += buffer.toString();
			return;
		}

		buffer = buffer.slice(Math.min(i + 1, buffer.length));
		this._headerLine += line + "\n";
		
		// If this line is empty, then we're done with headers.
		if(this._headerLine.length == 2) {
			this._processHeaders();
		}
		else {
			this._headersRaw.push(this._headerLine.replace("\r", "").replace("\n", ""));
			this._headerLine = "";
		}
	}

	this.emit("data", buffer);
};

CGIResponseStreamReader.prototype.parse = function(data) {
	!this.headersParsed ? this.parseForHeaders(data) : this.emit("data", data); 
};

CGIResponseStreamReader.prototype.processStream = function(stream) {
	stream.on("data", this.parse.bind(this));
	stream.on("end", function() {
		this.emit("end");
	}.bind(this));
};

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
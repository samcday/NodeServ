var util	= require("util"),
	events	= require("asyncevents"),
	cgiCommon = require("./common"),
	net		= require("net"),
	fastcgi	= require("./fcgi-parser/fastcgi"),
	child_process = require("child_process"),
	fs		= require("fs"),
	stream	= require("stream");

var binding = process.binding('net'),
	socket = binding.socket,
	bind = binding.bind,
	listen = binding.listen,
	accept = binding.accept;

var FCGISession = function(requestId, socket) {
	this.socket = socket;
	this.requestId = requestId;

	this.socket.setNoDelay(true);
	this.socket.setTimeout(0);

	this.writer = new fastcgi.writer();

	// Setup FCGI parser.
	this.parser = new fastcgi.parser();
	this.parser.onRecord = function(record) {
		if(record.header.type == fastcgi.constants.record.FCGI_STDOUT) {
			this.stdoutProxy.emit("data", new Buffer(record.body));
		};
		if(record.header.type == fastcgi.constants.record.FCGI_END_REQUEST) {
			this.emit("response_end");
		}
	}.bind(this);
	this.parser.onError = function(err) {
		sys.puts(JSON.stringify(err, null, "\t"));
	};

	// Funnel incoming data through socket into the parser.
	this.socket.on("data", function (buffer, start, end) {
		this.parser.execute(buffer);
	}.bind(this));
	
	// Setup a fake stream to proxy fcgi stdout to cgistreamreader.
	var proxy = function() {
		events.EventEmitter.call(this);
	};
	util.inherits(proxy, stream.Stream);
	this.stdoutProxy = new proxy();
	this.cgiStreamReader = new cgiCommon.CGIResponseStreamReader(this.stdoutProxy);
	this.cgiStreamReader.on("headers", function(headers) {
		this.emit("response_headers", headers);
	}.bind(this));

	this.cgiStreamReader.on("data", function(data) {
		this.emit("response_data", data);
	}.bind(this));
};
util.inherits(FCGISession, events.EventEmitter);

FCGISession.prototype._writeRecordHeader = function(type, length) {
	this.writer.writeHeader({
		"version": fastcgi.constants.version,
		"type": type,
		"recordId": this.requestId,
		"contentLength": length,
		"paddingLength": 0
	});
};

FCGISession.prototype.beginRequest = function() {
	this._writeRecordHeader(fastcgi.constants.record.FCGI_BEGIN_REQUEST, 8);
	this.writer.writeBegin({
		"role": fastcgi.constants.role.FCGI_RESPONDER,
		"flags": fastcgi.constants.keepalive.ON
	});
	this.socket.write(this.writer.tobuffer());
};

FCGISession.prototype.params = function(params) {
	this._writeRecordHeader(fastcgi.constants.record.FCGI_PARAMS, fastcgi.getParamLength(params));
	this.writer.writeParams(params);
	this.socket.write(this.writer.tobuffer());

	this._writeRecordHeader(fastcgi.constants.record.FCGI_PARAMS, 0);
	this.socket.write(this.writer.tobuffer());
};

FCGISession.prototype.input = function(data) {
	this._writeRecordHeader(fastcgi.constants.record.FCGI_STDIN, data.length);
	if(data.length) this.writer.writeBody(data);
	this.socket.write(this.writer.tobuffer());
};

var FCGISessionManager = function(manager) {
	// We either have a process manager or connection manager to deal with.
	// For now, given that Javascript isn't strongly typed, we don't actually care which it is, since both
	// implement getSession(). Later we may have to deal with additional complexities when we actually get around
	// to multiplexing sessions on a connection and such.
	this.getSession = function(callback) {
		return manager.getSession(callback);
	}.bind(this);
};

var FCGIConnection = function(socket) {
	this.socket = socket;
};

FCGIConnection.prototype.getSession = function(callback) {
	// TODO: manage request ids.
	var session = new FCGISession(1, this.socket);
	session.on("end", function() {
		this.socket.destroy();
	}.bind(this));

	callback(session);
};

var FCGIConnectionManager = function() {
	var connectionArgs = arguments;
	this.connectionFactory = function(callback) {
		var socket = net.createConnection.apply(null, connectionArgs);
		socket.on("connect", function() {
			var connection = new FCGIConnection(socket);
			callback(connection);
		}.bind(this));
	}.bind(this);
};

FCGIConnectionManager.prototype.getSession = function(callback) {
	// TODO: for now all connections live as long as 1 session inside them.
	// Connection manager will eventually need to pool connections, and monitor session activity inside them to 
	// ensure it can deliver the least occupied connection.
	this.connectionFactory(function(connection) {
		connection.getSession(callback);
	});
}

var FCGIProcess = function(binary, id) {
	var socketFd = socket("unix");
	try { fs.unlinkSync("/tmp/nodeserv_fcgi." + id + ".sock"); } catch(e) {};
	bind(socketFd, "/tmp/nodeserv_fcgi." + id + ".sock");
	listen(socketFd, 128);
	
	this.proc = child_process.spawn(binary, [], {
		customFds: [socketFd, -1, -1]
	});
	
	this.connectionManager = new FCGIConnectionManager("/tmp/nodeserv_fcgi." + id + ".sock");
	
	process.on("exit", function() {
		this.proc.kill();
		try { fs.unlinkSync("/tmp/nodeserv_fcgi." + id + ".sock"); } catch(e) {};
	}.bind(this));
};

FCGIProcess.prototype.getSession = function(callback) {
	return this.connectionManager.getSession(callback);
};

var FCGIProcessManager = module.exports = function(binary, processCount) {
	// Setup the processes.
	this.processes = [];
	this.connectionCounter = 0;

	for(var i = 0; i < processCount; i++) this.processes.push(new FCGIProcess(binary, i));
};

FCGIProcessManager.prototype.getSession = function(callback) {
	// TODO: decent load balancing. For now we're gonna do round robin.
	var process = this.processes[this.connectionCounter++ % this.processes.length];

	return process.getSession(callback);
};

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
				session.on("response_headers", function(headers) {
					res.writeHead(200, headers);
				});
				
				session.on("response_data", function(data) {
					res.write(data);
				});
				
				session.on("response_end", function() {
					res.end();
				});
			});
		};
	};
	
	Object.keys(server.config.fcgi).forEach(function(ext) {
		var mappingData = server.config.fcgi[ext];
		var mapping = {
			ext: ext,
			regex: new RegExp("(.*?/)(.+?" + ext.replace(".", "\\.") + ")(?=$|/)(.*)", "i"),
			binary: mappingData.binary
		};
		mapping.handler = createFCGIHandler(mapping);
		
		var manager = null;
		if(mappingData.binary) {
			manager = mapping.processManager = new FCGIProcessManager(mapping.binary, mappingData.processes || 3);
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
};

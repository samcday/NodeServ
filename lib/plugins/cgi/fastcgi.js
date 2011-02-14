// Temporary until I know whether or not Billy is going to publish fastcgi-parser to npm.
var fastcgi = null;
try { fastcgi = require("fastcgi-parser"); } catch(e) {};
if(!fastcgi) fastcgi = require("./fcgi-parser/fastcgi");

var util	= require("util"),
	events	= require("asyncevents"),
	cgiCommon = require("./common"),
	net		= require("net"),
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

	this.writer = new fastcgi.writer();

	this.onFCGIRecord = function(record) {
		if(record.header.type == fastcgi.constants.record.FCGI_STDOUT) {
			this.stdoutProxy.emit("data", record.body);
		};
		if(record.header.type == fastcgi.constants.record.FCGI_END) {
			this.emit("response_end");
		}
	}.bind(this);
	
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

FCGISession.prototype.abort = function() {
	this.cgiStreamReader.removeAllListeners("headers");
	this.cgiStreamReader.removeAllListeners("data");
	this.onFCGIRecord = function() {};

	this.emit("abort");
};

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
	this._writeRecordHeader(fastcgi.constants.record.FCGI_BEGIN, 8);
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
	this.manager = manager;
	// We either have a process manager or connection manager to deal with.
	// For now, given that Javascript isn't strongly typed, we don't actually care which it is, since both
	// implement getSession(). Later we may have to deal with additional complexities when we actually get around
	// to multiplexing sessions on a connection and such.
	this.getSession = function(callback) {
		var session = manager.getSession(callback);
	}.bind(this);
};

FCGISessionManager.prototype.stop = function() {
	this.manager.stop();
};

var FCGIConnection = function(socket) {
	this.socket = socket;

	this.socket.on("error", function(err) {
		console.log(err);
	});
	
	this.socket.setNoDelay(true);
	this.socket.setTimeout(0);
	
	this.sessions = [];
	this.sessionCount = 0;

	// Setup FCGI parser.
	this.parser = new fastcgi.parser();
	this.parser.encoding = "binary";
	
	this.parser.onRecord = function(record) {
		// Figure out which session needs this record.
		var session = this.sessions[record.header.recordId - 1];
		if(!session) { return; } // TODO: ????

		session.onFCGIRecord(record);
	}.bind(this);

	this.parser.onError = function(err) {
		// TODO:
		sys.puts(JSON.stringify(err, null, "\t"));
	};

	// Funnel incoming data through socket into the parser.
	this.socket.on("data", function (buffer) {
		this.parser.execute(buffer);
	}.bind(this));

	this.socket.on("close", function() {
		// Abort! Abort! Abort!
		this.sessions.forEach(function(session) {
			if(session)
				session.abort();
		});

		this.emit("close");
	}.bind(this));
};
util.inherits(FCGIConnection, events.EventEmitter);

FCGIConnection.prototype.close = function() {
	this.socket.destroy();
};

FCGIConnection.prototype.getSession = function(callback) {
	for(var i = 0, len = this.sessions.length; i < len; i++)
		if(!this.sessions[i]) break;

	var requestId = i + 1;

	var session = this.sessions[i] = new FCGISession(requestId, this.socket);

	this.sessionCount++;
	session.on("abort", function() {
		this.sessions[requestId - 1] = null;
		this.sessionCount--;
	}.bind(this));

	session.on("response_end", function() {
		this.sessions[requestId - 1] = null;
		this.sessionCount--;
	}.bind(this));

	callback(session);
};

var MAX_SESSIONS = 100;
var FCGIConnectionManager = function() {
	// TODO: multiplexing many sessions over one connection.
	// However we will need some sanity here to handle high load, probably some kind of simple
	// mechanism that starts additional connections as necessary, and always picks connection with
	// least number of sessions when a new session is needed.
	// Right now, we're literally opening one connection and staying with it permanently.
	this.connections = [];

	var connectionArgs = arguments;

	this.reporterInterval = setInterval(function() {
		var str = "";
		var total = 0;
		
		this.connections.forEach(function(connection) {
			str += connection.sessionCount + " ";
			total += connection.sessionCount;
		});
		
		console.log("connections: " + str + "(total " + total + ")");
	}.bind(this), 1000);

	var connectionFactory = function(callback) {
		var socket = net.createConnection.apply(null, connectionArgs);
		socket.on("connect", function() {
			var connection = new FCGIConnection(socket);
			this.connections.unshift(connection);

			connection.on("close", function() {
				this.connections.splice(this.connections.indexOf(connection), 1);
			}.bind(this));
			callback(connection);
		}.bind(this));
	}.bind(this);

	var getConnection = function(callback) {
		var connection = null;

		// Go through connections and find one that isn't too busy.
		for(var i = 0, len = this.connections.length; i < len; i++) {
			if(this.connections[i].sessionCount < MAX_SESSIONS) {
				connection = this.connections[i];
				break;
			}
		}

		if(connection) return callback(connection);

		// All connections too busy. Open a new one.
		connectionFactory(callback);
	}.bind(this);
	
	this.getSession = function(callback) {
		// TODO: for now all connections live as long as 1 session inside them.
		// Connection manager will eventually need to pool connections, and monitor session activity inside them to 
		// ensure it can deliver the least occupied connection.
		getConnection(function(connection) {
			connection.getSession(callback);
		}.bind(this));
	};
};

FCGIConnectionManager.prototype.stop = function() {
	clearInterval(this.reporterInterval);
	this.connections.forEach(function(connection) {
		if(!connection) return;
		connection.close();
	});
};

var FCGIProcess = function(binary, env, id) {
	var socketFd = socket("unix");
	try { fs.unlinkSync("/tmp/nodeserv_fcgi." + id + ".sock"); } catch(e) {};
	bind(socketFd, "/tmp/nodeserv_fcgi." + id + ".sock");
	listen(socketFd, 128);
	
	this.proc = child_process.spawn(binary, [], {
		customFds: [socketFd, -1, -1],
		env: env
	});
	
	this.connectionManager = new FCGIConnectionManager("/tmp/nodeserv_fcgi." + id + ".sock");
	
	this.proc.on("exit", function() {
		this.proc.kill();
		try { fs.unlinkSync("/tmp/nodeserv_fcgi." + id + ".sock"); } catch(e) {};
		this.connectionManager.stop();
		this.connectionManager = null;
	}.bind(this));
};

FCGIProcess.prototype.kill = function() {
	this.proc.kill("SIGKILL");
}

FCGIProcess.prototype.getSession = function(callback) {
	return this.connectionManager.getSession(callback);
};

var FCGIProcessManager = module.exports = function(binary, processCount, env) {
	// Setup the processes.
	this.processes = [];
	this.connectionCounter = 0;

	for(var i = 0; i < processCount; i++) this.processes.push(new FCGIProcess(binary, env, i));
};

FCGIProcessManager.prototype.stop = function() {
	this.processes.forEach(function(process) {
		process.kill();
	});
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

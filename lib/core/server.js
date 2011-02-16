require.paths.unshift(__dirname + "/common");

var util	= require("util"),
	net		= require("net"),
	connect	= require("connect"),
	myevents= require("asyncevents"),
	myutils	= require("myutils"),
	fs		= require("fs"),
	mime	= require("mime"),
	url		= require("url"),
	staticResolver = require("./static_resolver"),
	directoryIndex = require("./directory_index.js"),
	cgi 	= require("../plugins/cgi/cgi"),
	fcgi 	= require("../plugins/cgi/fcgi/fastcgi"),
	dns		= require("dns"),
	async 	= require("async"),
	http	= require("http");

// Slightly modified version of async.series that will wrap each callback to check
// for unhandled errors.
async.seriesChecked = function(fns, callback) {
	var fns = fns.map(function(fn) {
		return function(callback) {
			try {
				fn.apply(null, arguments);
			}
			catch(e) {
				callback(e);
			}
		}
	});

	this.series(fns, callback);
};

var NodeServ = function(config) {
	this.config = config;

	process.on('SIGINT', function () {
		process.exit();
	});

	var requestHandler = function(port, req, res) {
		var error404 = function() {
			res.writeHead(200, "Not found", {"Content-Type": "text/html"});
			res.end("<!DOCTYPE html><html><head><title>404 Not found</title></head><body><h1>404!</h1>Not found</body></html>");
		};

		var error500 = function() {
			try {
				res.writeHead(500, "Internal Server Error", {"Content-Type": "text/html"});
				res.end("<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head><body><h1>500!</h1>Error!</body></html>");
			}
			catch(e) {}
		};

		try {
			// Initialize the request context.
			req.ctx = {
				originalUrl: url.parse(req.url),
				url: url.parse(req.url),
				port: port,
				server: this
			};
	
			// Give anyone interested a chance to check out this incoming request.
			this.emit("request_init", req);
	
			// Resolve the remote hostname.
			var resolveRemoteHostname = function(callback) {
				dns.reverse(req.connection.remoteAddress, function(err, domains) {
					// Swallow any errors, no remote hostname ain't the end of the world.
					req.ctx.remoteHost = !err ? domains.shift() : "";
					callback();
				});
			}.bind(this);

			var filter = function(callback) {
				// Filter the request.
				this.emitAsync("request_filter", callback, req);
			}.bind(this);
	
			var resolve = function(callback) {
				// See if any modules want to resolve the request, otherwise we resolve it ourself.
				this.emitAsync("request_resolve", callback, req);
			}.bind(this);
	
			var respond = function(callback) {
				req.ctx.responder ? req.ctx.responder(req, res) : error404(res);
				callback();
			}.bind(this);
	
			async.seriesChecked([
				resolveRemoteHostname,
				// TODO: vhost processing first.
				filter,
				resolve,
				respond
			], function(err) {
				if(err) {
					console.log(err);
					error500();
					throw err;
				}
			});
		}
		catch(e) {
			error500();
		}
	}.bind(this);

	// If we've been asked to run under a specific user/group, we do so now.
	config.group && process.setgid(config.group);
	config.user && process.setuid(config.user);

	// Listen on all relevant ports.
	var bindPorts = Array.isArray(config.bind_port) ? config.bind_port : new String(config.bind_port).split(";");
	!bindPorts.length && bindPorts.push(80);

	var initializeCoreModules = function() {
		// Filters.
		directoryIndex(this);
		
		// Responders.
		cgi(this);
		fcgi(this);
		staticResolver(this);	
	}.bind(this);
	
	this.start = function(callbackFn) {
		async.map(bindPorts, function(port, callback) { 
			var server = http.createServer(requestHandler.bind(this, port));
			
			server.once("error", function(err) {
				callback(err);
			});
	
			// Attempt to bind to the port.
			server.listen(port, callback.bind(this, null, server));
		}.bind(this), function(err, servers) {
			if(err) console.log(err); // TODO:
			else {
				initializeCoreModules();
				this.servers = servers;
				
				this.emit("started");
			}
		}.bind(this));

		if(callbackFn) this.once("started", callbackFn);
	};

	this.stop = function() {
		this.servers.forEach(function(server) {
			server.close();
		});

		this.emit("stop");
	};
};

util.inherits(NodeServ, myevents.AsyncEventEmitter);

module.exports = NodeServ;
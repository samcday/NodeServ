var fastcgi = require("./parser/fastcgi"),
	FCGISession = require("./session"),
	events = require("events"),
	util = require("util");

var FCGIConnection = module.exports = function(socket) {
	var that = this,
		sessions = [],
		sessionCount = 0;

	socket.on("error", function(err) {
		console.log(err);
	});
	
	socket.setNoDelay(true);
	socket.setTimeout(0);

	// Setup FCGI parser.
	var parser = new fastcgi.parser();
	parser.encoding = "binary";
	
	parser.onRecord = function(record) {
		// Figure out which session needs this record.
		var session = sessions[record.header.recordId - 1];
		if(!session) { return; } // TODO: ????

		session.onFCGIRecord(record);
	};

	parser.onError = function(err) {
		// TODO:
		sys.puts(JSON.stringify(err, null, "\t"));
	};

	// Funnel incoming data through socket into the parser.
	socket.on("data", function (buffer) {
		parser.execute(buffer);
	}.bind(this));

	socket.on("close", function() {
		// Abort! Abort! Abort!
		sessions.forEach(function(session) {
			if(session)
				session.abort();
		});

		that.emit("close");
	});
	
	this.close = function() {
		socket.destroy();
	};
	
	this.getSession = function(callback) {
		var i, len, requestId, session;

		for(i = 0, len = sessions.length; i < len; i++) {
			if(!sessions[i]) break;
		}

		requestId = i + 1;

		session = sessions[i] = new FCGISession(requestId, socket);

		that.sessionCount++;
		session.on("abort", function() {
			sessions[requestId - 1] = null;
			sessionCount--;
		});

		session.on("response_end", function() {
			sessions[requestId - 1] = null;
			sessionCount--;
		});

		callback(session);
	};
	
	this.getSessionCount = function() {
		return sessionCount;
	};	
};
util.inherits(FCGIConnection, events.EventEmitter);
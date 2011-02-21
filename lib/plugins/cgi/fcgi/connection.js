var fastcgi = require("fastcgi-stream"),
	FCGISession = require("./session"),
	events = require("events"),
	util = require("util");

var FCGIConnection = module.exports = function(socket) {
	var that = this,
		sessions = [],
		sessionCount = 0;

	socket.on("error", function(err) {
		console.log(util.inspect(err, 10));
		throw err;
	});
	
	socket.setNoDelay(true);
	socket.setTimeout(0);

	var fcgiStream = new fastcgi.FastCGIStream(socket);

	// Setup FCGI stream.
	fcgiStream.on("record", function(requestId, record) {
		// Figure out which session needs this record.
		var session = sessions[requestId - 1];
		if(!session || !session.onFCGIRecord) { return; }
		
		session.onFCGIRecord(record);
	});

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

		session = sessions[i] = new FCGISession(requestId, socket, function(record) {
			fcgiStream.writeRecord(requestId, record);
		});

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
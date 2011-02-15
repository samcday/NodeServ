var fastcgi = require("./parser/fastcgi"),
	FCGISession = require("./session"),
	events = require("events"),
	util = require("util");

var FCGIConnection = module.exports = function(socket) {
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
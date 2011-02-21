var //fastcgi = require("./parser/fastcgi"),
	fastcgi = require("fastcgi-stream"), 
	util = require("util"),
	stream = require("stream"),
	events = require("events");
	
var FCGISession = module.exports = function(requestId, socket, writeFastCGIRecord) {
	try {
	var proxy, stdoutProxy, cgiStreamReader,
		that = this;

	// Setup a fake stream to proxy fcgi stdout to cgistreamreader.
	proxy = function() {
		events.EventEmitter.call(this);
	};
	util.inherits(proxy, stream.Stream);
	stdoutProxy = new proxy();
	cgiStreamReader = new cgiCommon.CGIResponseStreamReader(stdoutProxy);
	cgiStreamReader.on("headers", function(headers) {
		that.emit("response_headers", headers);
	});

	cgiStreamReader.on("data", function(data) {
		that.emit("response_data", data);
	});

	this.onFCGIRecord = function(record) {
		switch(record.TYPE) {
			case fastcgi.records.StdOut.TYPE: {
				stdoutProxy.emit("data", record.data);
				break;
			}
			case fastcgi.records.EndRequest.TYPE: {
				that.emit("response_end");
				break;
			}
		};
	};
	
	this.abort = function() {
		cgiStreamReader.removeAllListeners("headers");
		cgiStreamReader.removeAllListeners("data");
		this.onFCGIRecord = null;
		that.emit("abort");
	};
	
	this.beginRequest = function() {
		// TODO: keepalive flag.
		writeFastCGIRecord(new fastcgi.records.BeginRequest(fastcgi.role.Responder, 1));
	};

	this.params = function(params) {
		writeFastCGIRecord(new fastcgi.records.Params(params));
		writeFastCGIRecord(new fastcgi.records.Params());
	};
	
	this.input = function(data) {
		writeFastCGIRecord(new fastcgi.records.StdIn(data));
	};
	}
	catch(e) {
		console.log(util.inspect(e));
	}
};
util.inherits(FCGISession, events.EventEmitter);
var fastcgi = require("./parser/fastcgi"),
	util = require("util"),
	stream = require("stream"),
	events = require("events");
	
var FCGISession = module.exports = function(requestId, socket) {
	var proxy, stdoutProxy, cgiStreamReader,
		that = this,
		writer = new fastcgi.writer();

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
		if(record.header.type == fastcgi.constants.record.FCGI_STDOUT) {
			stdoutProxy.emit("data", record.body);
		};
		if(record.header.type == fastcgi.constants.record.FCGI_END) {
			that.emit("response_end");
		}
	};
	
	this.abort = function() {
		cgiStreamReader.removeAllListeners("headers");
		cgiStreamReader.removeAllListeners("data");
		that.onFCGIRecord = function() {};

		that.emit("abort");
	};
	
	var writeRecordHeader = function(type, length) {
		writer.writeHeader({
			"version": fastcgi.constants.version,
			"type": type,
			"recordId": requestId,
			"contentLength": length,
			"paddingLength": 0
		});
	};
	
	this.beginRequest = function() {
		writeRecordHeader(fastcgi.constants.record.FCGI_BEGIN, 8);
		writer.writeBegin({
			"role": fastcgi.constants.role.FCGI_RESPONDER,
			"flags": fastcgi.constants.keepalive.ON
		});
		socket.write(writer.tobuffer());
	};

	this.params = function(params) {
		writeRecordHeader(fastcgi.constants.record.FCGI_PARAMS, fastcgi.getParamLength(params));
		writer.writeParams(params);
		socket.write(writer.tobuffer());

		writeRecordHeader(fastcgi.constants.record.FCGI_PARAMS, 0);
		socket.write(writer.tobuffer());
	};
	
	this.input = function(data) {
		writeRecordHeader(fastcgi.constants.record.FCGI_STDIN, data.length);
		if(data.length) writer.writeBody(data);
		socket.write(writer.tobuffer());
	};
};
util.inherits(FCGISession, events.EventEmitter);
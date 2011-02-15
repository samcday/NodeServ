var fastcgi = require("./parser/fastcgi"),
	util = require("util"),
	stream = require("stream"),
	events = require("events");

var FCGISession = module.exports = function(requestId, socket) {
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
// A test NodeServ core to test plugins.
var NodeServ = require("../../lib/"),
	util = require("util"),
	path = require("path"),
	http = require("http");

var port = 12000;

var TestNodeServ = module.exports = function(config) {
	config = config || {};
	this.port = config.bind_port = config.bind_port || (port++);
	config.document_root = config.document_root ||  path.join(__dirname, "..", "fixtures", "www-root");
	
	NodeServ.call(this, config);
	
	var _self = this;
	this.on("started", function() {
		_self.request = function(method, path, callback) {
			var request = http.request({
				host: "localhost",
				port: _self.port,
				method: method,
				path: path
			}, function(res) {
				res.body = "";
				res.on("data", function(data) {
					console.log(data);
					res.body += data;
				});
				res.on("end", function() { 
					console.log(res);
				});
			});
			request.end();
		};
	});
};
util.inherits(TestNodeServ, NodeServ);

TestNodeServ.prototype.toString = function() {
	return "[Mock NodeServ]";
};
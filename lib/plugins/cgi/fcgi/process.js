var FCGIConnectionManager = require("./connection_manager"),
	fs = require("fs"),
	child_process = require("child_process");
	
var binding = process.binding('net'),
	socket = binding.socket,
	bind = binding.bind,
	listen = binding.listen,
	accept = binding.accept;

var FCGIProcess = module.exports = function(binary, env, id) {
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
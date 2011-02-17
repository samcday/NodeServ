var FCGIConnectionManager = require("./connection_manager"),
	fs = require("fs"),
	child_process = require("child_process");
	
var binding = process.binding('net'),
	socket = binding.socket,
	bind = binding.bind,
	listen = binding.listen,
	accept = binding.accept;

// Uses Node.js low level bindings to create a UNIX socket file and allow it to listen for
// connections. The file descriptor for this socket is returned so it can be passed to an FCGI
// application.
function createListeningSocket(socketFile) {
	var socketFd = socket("unix");
	try { fs.unlinkSync(socketFile); } catch(e) {};
	bind(socketFd, socketFile);
	listen(socketFd, 128);
	
	// TODO: file permissions?
	
	return socketFd;
};

var FCGIProcess = module.exports = function(binary, env, id) {
	var that = this, socketFd, socketFile, connectionManager;

	socketFile = "/tmp/nodeserv_fcgi." + id + ".sock";
	socketFd = createListeningSocket(socketFile);

	fcgiProcess = child_process.spawn(binary, [], {
		customFds: [socketFd, -1, -1],
		env: env
	});

	connectionManager = new FCGIConnectionManager(socketFile);

	fcgiProcess.on("exit", function() {
		fcgiProcess.kill();
		try { fs.unlinkSync(socketFile); } catch(e) {};
		connectionManager.stop();
		connectionManager = null;
	});
	
	this.kill = function() {
		fcgiProcess.kill("SIGKILL");
	};

	this.getSession = function(callback) {
		return connectionManager.getSession(callback);
	};
};
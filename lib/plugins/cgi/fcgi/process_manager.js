var FCGIProcess = require("./process");

var FCGIProcessManager = module.exports = function(binary, processCount, env) {
	// Setup the processes.
	this.processes = [];
	this.connectionCounter = 0;

	for(var i = 0; i < processCount; i++) this.processes.push(new FCGIProcess(binary, env, i));
};

FCGIProcessManager.prototype.stop = function() {
	this.processes.forEach(function(process) {
		process.kill();
	});
};

FCGIProcessManager.prototype.getSession = function(callback) {
	// TODO: decent load balancing. For now we're gonna do round robin.
	var process = this.processes[this.connectionCounter++ % this.processes.length];

	return process.getSession(callback);
};
var FCGIProcess = require("./process");

var FCGIProcessManager = module.exports = function(binary, processCount, env) {
	var that = this, i, 
		processes = [],
		connectionCounter = 0;

	for(var i = 0; i < processCount; i++) {
		processes.push(new FCGIProcess(binary, env, i));
	}
	
	this.stop = function() {
		processes.forEach(function(process) {
			process.kill();
		});
	};
	
	this.getSession = function(callback) {
		// TODO: decent load balancing. For now we're gonna do round robin.
		var process = processes[connectionCounter++ % processes.length];

		return process.getSession(callback);
	};
};
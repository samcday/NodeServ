var FCGISessionManager = module.exports = function(manager) {
	// We either have a process manager or connection manager to deal with.
	// For now, given that Javascript isn't strongly typed, we don't actually care which it is, since both
	// implement getSession(). Later we may have to deal with additional complexities when we actually get around
	// to multiplexing sessions on a connection and such.
	this.getSession = function(callback) {
		var session = manager.getSession(callback);
	}.bind(this);
	
	this.stop = function() {
		manager.stop();
	};
};

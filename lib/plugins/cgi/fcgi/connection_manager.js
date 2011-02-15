var FCGIConnection = require("./connection.js"),
	net = require("net");

var MAX_SESSIONS = 100;
var FCGIConnectionManager = module.exports = function() {
	// TODO: multiplexing many sessions over one connection.
	// However we will need some sanity here to handle high load, probably some kind of simple
	// mechanism that starts additional connections as necessary, and always picks connection with
	// least number of sessions when a new session is needed.
	// Right now, we're literally opening one connection and staying with it permanently.
	this.connections = [];

	var connectionArgs = arguments;

	this.reporterInterval = setInterval(function() {
		var str = "";
		var total = 0;
		
		this.connections.forEach(function(connection) {
			str += connection.sessionCount + " ";
			total += connection.sessionCount;
		});
		
		console.log("connections: " + str + "(total " + total + ")");
	}.bind(this), 1000);

	var connectionFactory = function(callback) {
		var socket = net.createConnection.apply(null, connectionArgs);
		socket.on("connect", function() {
			var connection = new FCGIConnection(socket);
			this.connections.unshift(connection);

			connection.on("close", function() {
				this.connections.splice(this.connections.indexOf(connection), 1);
			}.bind(this));
			callback(connection);
		}.bind(this));
	}.bind(this);

	var getConnection = function(callback) {
		var connection = null;

		// Go through connections and find one that isn't too busy.
		for(var i = 0, len = this.connections.length; i < len; i++) {
			if(this.connections[i].sessionCount < MAX_SESSIONS) {
				connection = this.connections[i];
				break;
			}
		}

		if(connection) return callback(connection);

		// All connections too busy. Open a new one.
		connectionFactory(callback);
	}.bind(this);
	
	this.getSession = function(callback) {
		// TODO: for now all connections live as long as 1 session inside them.
		// Connection manager will eventually need to pool connections, and monitor session activity inside them to 
		// ensure it can deliver the least occupied connection.
		getConnection(function(connection) {
			connection.getSession(callback);
		}.bind(this));
	};
};

FCGIConnectionManager.prototype.stop = function() {
	clearInterval(this.reporterInterval);
	this.connections.forEach(function(connection) {
		if(!connection) return;
		connection.close();
	});
};
// A mock NodeServ core to test plugins.
var MockNodeServ = module.exports = function() {
	this.config = {};
};
require("util").inherits(MockNodeServ, require("events").EventEmitter);

MockNodeServ.prototype.toString = function() {
	return "[Mock Node Server]";
};
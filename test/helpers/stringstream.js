// A readable Stream impementation that will trickle feed the contents of a string out.
var Stream = require("stream").Stream,
	util = require("util");

var StringStream = module.exports = function(data, increment, interval, paused) {
	this.data = new Buffer(data);
	this.increment = increment || Math.round(data.length / 4);
	this.interval = interval || 1;

	Stream.call(this);
	this.readable = true;
	this.writable = false;
	
	this.trickleFeeder = null;
	!this.paused && process.nextTick(this.resume.bind(this));
};

util.inherits(StringStream, Stream);

StringStream.prototype.setEncoding = StringStream.prototype.destroy = StringStream.prototype.destroySoon = function() {
	throw new Error("Unsupported.");
};

StringStream.prototype._feed = function() {
	var food = this.data.slice(0, Math.min(this.increment, this.data.length));
	food.length && this.emit("data", food);
	this.data = this.data.slice(food.length);
	
	if(!this.data.length) {
		clearInterval(this.trickleFeeder);
		this.emit("end");
	}
};

StringStream.prototype.resume = function() {
	this.trickleFeeder = setInterval(this._feed.bind(this), this.interval);
};

StringStream.prototype.pause = function() {
	clearInterval(this.trickleFeeder);
};
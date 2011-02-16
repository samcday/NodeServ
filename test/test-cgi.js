var vows = require("vows"),
	assert = require("assert"),
	TestNodeServ = require("./helpers/test-server"),
	// TODO: change this to import npm gently if felix approves https://github.com/felixge/node-gently/pull/3
	Gently = require("./helpers/gently"),
	cgi = require("../lib/plugins/cgi/cgi"),
	path = require("path"),
	events = require("events");

vows.describe("CGI Plugin").addBatch({
	"When called on a mock": {
		topic: function() {
			var gently = new Gently(true);
			var mock = new events.EventEmitter();
			mock.config = {};
			var properOn = gently.expect(mock, "on", function(event, fn) {
				assert.equal(event, "request_resolve");
			}.bind(this));

			cgi(mock);
			
			return gently;
		},
		
		"hooks require_resolve": function(gently) {
			gently.verify();
			//assert.doesNotThrow(gently.verify, Error, "CGI Plugin did not hook request_resolve");
		}
	}
}).addBatch({
	"When used properly": {
		topic: function() {
			var instance = new TestNodeServ({
				cgi: {
					".test": path.join(__dirname, "fixtures", "www-root", "cgi", "basic.test")
				}
			});
			
			instance.start(function() {
				instance.request("GET", "/cgi/basic.test", function() {
					
				});
			});
		},
		
		"hehe": function() {}
	}
}).export(module);

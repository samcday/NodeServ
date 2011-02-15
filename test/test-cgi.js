var vows = require("vows"),
	assert = require("assert"),
	MockNodeServer = new(require("./helpers/mock-server")),
	// TODO: change this to import npm gently if felix approves https://github.com/felixge/node-gently/pull/3
	Gently = require("./helpers/gently"),
	cgi = require("../lib/plugins/cgi/cgi");

vows.describe("CGI Plugin").addBatch({
	"When instantiated": {
		topic: function() {
			var gently = new Gently(true);
			var properOn = gently.expect(MockNodeServer, "on", function(event, fn) {
				//console.log(assert);
				//properOn.apply(this, arguments);
				assert.equal(event, "request_resolve");
				try {
					assert.equal(event, "request_resolve");
				}
				catch(e) {
					console.log(e);
				}
			}.bind(this));

			cgi(MockNodeServer);
			
			return gently;
		},
		
		"hooks require_resolve": function(gently) {
			gently.verify();
			//assert.doesNotThrow(gently.verify, Error, "CGI Plugin did not hook request_resolve");
		}
	}
}).export(module);

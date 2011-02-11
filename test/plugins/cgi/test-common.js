// Tests for the common functionality shared between CGI modules.
var vows = require("vows"),
	cgiCommon = require("../../../lib/plugins/cgi/common.js"),
	StringStream = require("../../helpers/stringstream.js"),
	assert = require("assert");

// Create some CGI response samples.
var cgiSamples = {
	"simple": {
		headers: {
			"Status": "200 OK",
			"My-Header": "Brings All The Clients to the Yard",
			"Content-type": "text/awesome"
		},
		body: "Hello!"
	}
};

// Converts the above cgi samples into a complete cgi response string.
function createCGIResponse(sample) {
	var str = "";
	Object.keys(sample.headers).forEach(function(name) {
		str += name + ": " + sample.headers[name] + "\r\n";
	});
	str += "\r\n";
	
	str += sample.body;
	str += "\r\n";
	
	return str;
};

vows.describe("CGI Common").addBatch({
	"When a CGIResponseStreamReader is provided a simple CGI response to parse": {
		topic: new cgiCommon.CGIResponseStreamReader(new StringStream(createCGIResponse(cgiSamples.simple))),
		
		"the header event is called": {
			topic: function(reader) {
				reader.on("headers", this.callback.bind(this, null));
			},
			
			"it should contain the correct headers": function(headers) {
				console.log(headers);
				assert.isObject(headers);

				Object.keys(cgiSamples.simple.headers).forEach(function(name) {
					assert.isString(headers[name], "Contains header '" + name + "'");
					assert.equal(headers[name], cgiSamples.simple.headers[name]);
				});
			}
		},
		
		"the data event is called": {
			
		}
	}
}).export(module);

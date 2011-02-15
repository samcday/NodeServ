// Tests for the common functionality shared between CGI modules.
var vows = require("vows"),
	cgiCommon = require("../lib/plugins/cgi/common.js"),
	StringStream = require("./helpers/stringstream.js"),
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
	},
	
	"large": {
		headers: {
			"Content-length": "quite large",
			"Test": "test"
		},
		body: "" // generated later
	}
};

// Generate a large response body for the large cgi sample. (~1MB)
while(cgiSamples.large.body.length < (1024 * 1024))
	cgiSamples.large.body += Math.random();

// Converts the above cgi samples into a complete cgi response string.
function createCGIResponse(sample) {
	var str = "";
	Object.keys(sample.headers).forEach(function(name) {
		str += name + ": " + sample.headers[name] + "\r\n";
	});
	str += "\r\n";
	
	str += sample.body;
	
	return str;
};

function createCGISampleTestContext(cgiSample, feedAmount) {
	var context = {
		topic: new cgiCommon.CGIResponseStreamReader(new StringStream(createCGIResponse(cgiSample), feedAmount)),

		"the headers": {
			topic: function(reader) {
				reader.on("headers", this.callback.bind(this, null));
			},

			"should be an object": function(headers) {
				assert.isObject(headers);
			},
			"should contain the correct values": function(headers) {
				assert.isObject(headers);

				Object.keys(cgiSample.headers).forEach(function(name) {
					assert.isString(headers[name], "Contains header '" + name + "'");
					assert.equal(headers[name], cgiSample.headers[name]);
				});
			}
		},

		"the data": {
			topic: function(reader) {
				var buffers = [];

				reader.on("data", function(data) {
					buffers[buffers.length] = data;
				});
				
				reader.on("end", function() {
					this.callback(null, buffers);
				}.bind(this));
			},
			
			"should be one or more buffers": function(buffers) {
				buffers.forEach(function(buffer) {
					assert.isObject(buffer);
					assert.instanceOf(buffer, Buffer);
				});
			},
			"should be same content as before": function(buffers) {
				var body = "";
				buffers.forEach(function(buffer) {
					body += buffer.toString();
				});

				assert.equal(body, cgiSample.body);
			}
		}
	};

	return context;
}

vows.describe("CGIResponseStreamReader").addBatch({
	"When parsing a simple response": createCGISampleTestContext(cgiSamples.simple),
	"When parsing a simple *trickle-fed* response": createCGISampleTestContext(cgiSamples.simple, 1),
	"When parsing a large response": createCGISampleTestContext(cgiSamples.large),
}).export(module);
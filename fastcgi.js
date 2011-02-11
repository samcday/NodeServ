var net				= require("net"),
	child_process	= require("child_process"),
	fs				= require("fs");

var fastcgi = require("./blah/orly/fastcgi/fastcgi");

try {fs.unlinkSync("/tmp/php.sock");}catch(e){};

/*
var server = require("net").createServer(function() {
	console.log("YAY!");
});
server.on("data", function(data) {
console.log("data.");	
});*/
	
	proc.stdout.on("data", function(data) {
		console.log(data.toString());
	});
	
	proc.stderr.on("data", function(data) {
		console.log(data.toString());
	});
	
	function gogogogogo() {
		var sys = require("sys");
		var net = require("net");

		var params = [
			["SCRIPT_FILENAME", "/test.php"],
			["HTTP_USER_AGENT", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0; Supplied by blueyonder; .NET CLR 1.1.4322; .NET CLR 2.0.50215)"],
			["HTTP_ACCEPT_ENCODING", "none"],
			["HTTP_CONNECTION", "Keep-Alive"],
			["HTTP_ACCEPT", "*/*"],
			["HTTP_HOST", "shuttle.owner.net:82"]
		];

		var reqid = 0;

		function sendRequest(connection) {
		}

		var count = 0;
		var recordId = 0;

		var connection = new net.Stream();
		connection.setNoDelay(true);
		connection.setTimeout(0);



		connection.addListener("connect", function() {
			connection.writer = new fastcgi.writer();
			connection.parser.onRecord = function(record) {
				console.log(record);
				recordId = record.header.recordId;
				count++;
				if(record.header.type == fastcgi.constants.record.FCGI_END) {
					console.log(record);
					//sendRequest(connection);
				}
			};
			connection.parser.onError = function(err) {
				sys.puts(JSON.stringify(err, null, "\t"));
			};
			sendRequest(connection);
		});

		connection.addListener("timeout", function() {
			connection.end();
		});

		connection.addListener("close", function() {
			connection.end();
		});

		connection.addListener("error", function(exception) {
			sys.puts(JSON.stringify(exception));
		});

		connection.connect("/tmp/php.sock");
	}
	
setTimeout(function() {
	gogogogogo();
	/*var blah = net.createConnection("/tmp/php.sock");
	blah.on("connect", function() {
		console.log("OMGITWORKED!");
		//blah.write("test.");
	});*/
}, 1000);
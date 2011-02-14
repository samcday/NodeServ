var NodeServ = require("./lib"),
	http = require("http"),
	crypto = require("crypto");

var requestsDone = 0;
var invalidResponses = 0;
var startTime = new Date().getTime(); 

var host = "localhost";
var port = 9666;

var reportProgress = function() {
	var elapsedTime = new Date().getTime() - startTime;
	var seconds = elapsedTime / 1000;
	console.log("elapsed time: " + seconds + " seconds. Requests per second: " + (requestsDone / seconds) + ". Invalid responses: " + invalidResponses);
};

var startProfiling = function() {
	setInterval(reportProgress, 1000);
	
	http.getAgent(host, port).maxSockets = 1000;
	for(var i = 0; i < 10000; i++)
		profile();
};

var profile = function() {
	var hash = crypto.createHash("md5");
	hash.update(new Date().getTime() + Math.random()) + "";
	var val = hash.digest("hex");

	var req = http.request({
		host: host,
		port: port,
		path: "/profile.php?val=" + val,
		method: "GET"
	}, function(res) {
		var result = "";
		res.on("data", function(chunk) {
			result += chunk.toString();
		});
		res.on("end", function() {
			if(result === val)
				requestsDone++;
			else {
				//console.log("expected " + val + " and got " + result + " instead.");
				invalidResponses++;
			}
		});
	});
	req.on("error",function(){invalidResponses++;});
	req.end();
};
/*
var myServer = require("http").createServer(function(req, res) {
	console.log("connection in.");
	
	setTimeout(function() {
		res.writeHead(200, {"Content-type": "text/html"});
		res.end("yay.");
	}, 3000);
});
myServer.listen(9666, function() {
	// Yep.
	console.log(myServer.maxConnections);
	startProfiling();
});*/

var myServer = require("net").createServer(function(socket) {
	//console.log("IN");
	
	setTimeout(function() {
		socket.destroy();
	}, 3000);
});
myServer.listen(9666, function() {
	// Yep.
	console.log(myServer.maxConnections);
	startProfiling();
});
var NodeServ = require("./lib"),
	http = require("http"),
	crypto = require("crypto");

var requestsDone = 0;
var invalidResponses = 0;
var startTime = new Date().getTime(); 
var total = 0;

var host = "127.0.0.1";
//var port = 9666;
var port = 80;

var reportProgress = function() {
	var elapsedTime = new Date().getTime() - startTime;
	var seconds = elapsedTime / 1000;
	console.log("elapsed time: " + seconds + " seconds. Requests per second: " + (requestsDone / seconds) + ". Total responses: " + requestsDone + ". Invalid responses: " + invalidResponses);
};

var startProfiling = function() {
	setInterval(reportProgress, 1000);
	
	http.getAgent(host, port).maxSockets = 500;
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
		//port: 80,
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
				console.log("expected " + val + " and got " + result + " instead.");
				invalidResponses++;
			}
		});
	});
	req.on("error", function() { console.log("ohdear."); invalidResponses++; });
	req.end();
};

/*
var instance = new NodeServ({
	user: "nodeserv",
	group: "nodeserv",
	bind_port: port,
	document_root: "/home/nodeserv/www/",
	index_files: "index.php;index.html;index.htm;welcome.htm",
	
	fcgi: {
		".php": {
			binary: "/usr/bin/php-cgi",
			processes: 3,
			env: {
				PHP_FCGI_CHILDREN: 0,
				PHP_FCGI_MAX_REQUESTS: 100000
			}
		}
	},

	vhosts: {
		"test.localhost": {
			document_root: "/home/nodeserv/vhosts/test.localhost/"
		}
	}
});

instance.on("listening", function() {
	// Yep.*/
	startProfiling();
//});

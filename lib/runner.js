var NodeServ = require("./index");

var instance = new NodeServ({
	user: "nodeserv",
	group: "nodeserv",
	bind_port: [9666, 1234],
	document_root: "/home/nodeserv/www/",
	index_files: "index.php;index.html;index.htm;welcome.htm",

	cgi: {
		".php": "/usr/bin/php-cgi"
	},
	
	/*fcgi: {
		".php": {
			binary: "/usr/bin/php-cgi",
			processes: 3
		}
	},*/

	vhosts: {
		"test.localhost": {
			document_root: "/home/nodeserv/vhosts/test.localhost/"
		}
	}
});

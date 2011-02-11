// Random stuff I found handy.
module.exports = {
	// Remove empty elements from an array.
	cleanArray: function(arr) {
		return arr.filter(function(item) { return item; });
	}
};

var charAt = String.prototype.charAt;
String.prototype.charAt = function(index) {
	index = (index < 0) ? (this.length + index) : index;
	return charAt.call(this, index);
};

String.prototype.endsWith = function(str, caseSensitive) {
	if(caseSensitive)
		return (this.length >= str.length) ? (this.substr(-str.length) == str) : false;
	else
		return (this.length >= str.length) ? (this.substr(-str.length).toLowerCase() == str.toLowerCase()) : false;		
};

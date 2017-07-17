var extend = require('util')._extend;

var API_VERSION = '1.2.13';

module.exports = {
  buildNewQueryString: function (query) {
    var newQuery = extend({}, query);
    var queryValues = [];
    ['apiKey', 'authorName', 'authorMapper', 'groupMapper', 'validUntil', 'padName'].forEach(function (key) {
      delete newQuery[key];
    });
    for(var key in newQuery) {
      queryValues.push(key + '=' + encodeURIComponent(newQuery[key]));
    }
    return '?' + queryValues.join('&');
  },
  getCommonRequestParams: function(req) {
    return {
      host: req.hostname + ':' + req.socket.localPort,
      protocol: req.protocol,
      apiKey: req.query.apiKey,
      apiVersion: API_VERSION
    };
  }
};

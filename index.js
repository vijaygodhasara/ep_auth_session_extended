var request = require('request'),
  	Promise = require('promise'),
  	extend = require('util')._extend;

var apiError = function (message, status, error) {
  return {
    name: 'EtherpadError',
    message: message,
    status: status || 500,
    type: 'etherpad',
    error: error
  };
};

var apiConnectionError = function (error) {
  return apiError('Unable to connect to Etherpad host', 500, error);
};

var apiRequest = function (options) {
  var opts = options;

  return new Promise(function(resolve, reject) {
    request(opts, function (error, response, body) {

      if(error) {
        reject(apiConnectionError(error));
        return;
      }

      var data = body;
      if (body && typeof body !== 'object') {
        try {
          data = JSON.parse(body);
        } catch (error) {
          console.log('body is not json object');
        }
      }
      resolve({response: response, data: data});
    });
  });
};

var makeRequest = function(opts) {
  return new Promise(function(resolve, reject) {
    apiRequest(opts.options).then(function(result) {
      if (result.response.statusCode !== 200) {
        var message = result.data.message || result.data.body.message;
        reject(apiError(message, result.response.statusCode, result.data));
        return;
      }

      var res = opts.dataField ? result.data.data[opts.dataField] : result.data;
      resolve(res);
    });
  });
};

var getSessionId = function(opts) {
	var defaultOptions = {method: 'POST', json: true};
	var body = {api_key: opts.apiKey};
	var apiPrefix = '/api/' + opts.apiVersion + '/';
	var apiUrl = opts.protocol + '://' + opts.host + apiPrefix;

	var createAuthor = function() {
	  return makeRequest({
      options: extend({
        url: apiUrl + 'createAuthorIfNotExistsFor',
        body: extend({
          authorName: opts.authorName,
          authorMapper: opts.authorMapper
        }, body)
      }, defaultOptions),
      dataField: 'authorID'
    });
  };

	var createGroup = function(authorID) {
    return new Promise(function(resolve, reject) {
      makeRequest({
        options: extend({
          url: apiUrl + 'createGroupIfNotExistsFor',
          body: extend({groupMapper: opts.groupMapper}, body)
        }, defaultOptions),
        dataField: 'groupID'
      }).then(function (groupID) {
        resolve({authorID: authorID, groupID: groupID});
      });
    });
  };

  var createSession = function(res2) {
    return new Promise(function(resolve, reject) {
      makeRequest({
        options: extend({
          url: apiUrl + 'createSession',
          body: extend({
            groupID: res2.groupID,
            authorID: res2.authorID,
            validUntil: opts.validUntil
          }, body)
        }, defaultOptions),
        dataField: 'sessionID'
      }).then(function (sessionID) {
        resolve(extend({sessionID: sessionID}, res2));
      });
    });
  };

  return createAuthor().then(createGroup).then(createSession);
};

exports.registerRoute = function(hook_name, args, cb) {
	args.app.get("/auth_session", function(req, res) {
		var r = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">' + "\n";

		r += '<html>' + "\n";
		r += '<head>' + "\n";
		r += '<meta http-equiv="Content-Type" content="text/html;charset=UTF-8">' + "\n";
		r += '</head>' + "\n";
		r += '<body>' + "\n";
		r += '<script type="text/javascript">' + "\n";

    var redirectWithSession = function(sessionID, groupID, padName, queryString) {
      r += 'document.cookie = "sessionID=' + encodeURIComponent(sessionID) + '; path=/;";' + "\n";

      if (padName) {
        var redirectUrl = '/p/';

        if (groupID) {
          redirectUrl += encodeURIComponent(groupID) + '$';
        }

        redirectUrl += encodeURIComponent(padName);
        redirectUrl += queryString || '';
        r += 'document.location.href="' + redirectUrl + '";' + "\n";
      }

      r += '</script>' + "\n";
      r += '</body>' + "\n";
      r += '</html>' + "\n";

      res.send(r);
    };

		if (req.query.sessionID) {
		  redirectWithSession(req.query.sessionID, req.query.groupID, req.query.padName);
		} else if(req.query.apiKey) {
      getSessionId({
        host: req.headers.host,
        protocol: req.protocol,
        apiKey: req.query.apiKey,
        apiVersion: '1.2.13',
        authorName: req.query.authorName,
        authorMapper: req.query.authorMapper,
        groupMapper: req.query.groupMapper,
        validUntil: req.query.validUntil
      }).then(function (res) {
        var newQuery = extend({}, req.query);
        var queryValues = [];
        ['apiKey', 'authorName', 'authorMapper', 'groupMapper', 'validUntil', 'padName'].forEach(function (key) {
          delete newQuery[key];
        });
        for(var key in newQuery) {
          queryValues.push(key + '=' + newQuery[key]);
        }
        var qs = '?' + queryValues.join('&');
        redirectWithSession(res.sessionID, res.groupID, req.query.padName, qs);
      });
    }
	});
};

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

var getDefaultOptions = function(opts) {
  var body = {api_key: opts.apiKey};
  var apiPrefix = '/api/' + opts.apiVersion + '/';
  var apiUrl = opts.protocol + '://' + opts.host + apiPrefix;

  return {
    method: 'POST',
    url: apiUrl,
    json: true,
    body: body
  };
};

var buildOptions = function(reqOpts, opts) {
  var defaultOptions = getDefaultOptions(reqOpts);
  var options = extend({}, defaultOptions);
  options.url += opts.apiMethod;
  extend(options.body, opts.body);
  return options;
};

var getSessionId = function(opts) {
  var createAuthor = function() {
    var options = buildOptions(opts, {
      apiMethod: 'createAuthorIfNotExistsFor',
      body: {
        authorName: opts.authorName,
        authorMapper: opts.authorMapper
      }
    });

    return makeRequest({
      options: options,
      dataField: 'authorID'
    });
  };
  var createGroup = function(authorID) {
    return new Promise(function(resolve, reject) {
      var options = buildOptions(opts, {
        apiMethod: 'createGroupIfNotExistsFor',
        body: {groupMapper: opts.groupMapper}
      });
      makeRequest({
        options: options,
        dataField: 'groupID'
      }).then(function (groupID) {
        resolve({authorID: authorID, groupID: groupID});
      });
    });
  };
  var createSession = function(res2) {
    return new Promise(function(resolve, reject) {
      var options = buildOptions(opts, {
        apiMethod: 'createSession',
        body: {
          groupID: res2.groupID,
          authorID: res2.authorID,
          validUntil: opts.validUntil
        }
      });
      makeRequest({
        options: options,
        dataField: 'sessionID'
      }).then(function (sessionID) {
        resolve(extend({sessionID: sessionID, validUntil: opts.validUntil}, res2));
      });
    });
  };

  return createAuthor().then(createGroup).then(createSession);
};

var getSessionEndDate = function(opts) {
  var options = buildOptions(opts, {
    apiMethod: 'getSessionInfo',
    body: {sessionID: opts.sessionID}
  });

  return makeRequest({
    options: options,
    dataField: 'validUntil'
  });
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
    r += '{{script}}' + "\n";
    r += '</script>' + "\n";
    r += '</body>' + "\n";
    r += '</html>' + "\n";

    var sendResponse = function(script) {
      res.send(r.replace('{{script}}', script));
    };

    var redirectWithSession = function(sessionID, validUntil, groupID, padName, queryString) {
      var script = '';
      script += 'document.cookie = "sessionID=' + encodeURIComponent(sessionID) + '; path=/;";' + "\n";

      if (padName) {
        var redirectUrl = '/p/';

        if (groupID) {
          redirectUrl += encodeURIComponent(groupID) + '$';
        }

        redirectUrl += encodeURIComponent(padName);
        redirectUrl += queryString || '';

        script += "window.parent.postMessage(JSON.parse('" +
          "{\"action\":\"redirect\"," +
          "\"sessionID\":\"" + sessionID + "\"," +
          "\"validUntil\":\"" + validUntil + "\"," +
          "\"url\":\"' + document.location.origin + '" + redirectUrl + "\"}'), \"*\")";
      }
      sendResponse(script);
    };

    var refreshSession = function() {
      var script = '';
      script += 'document.cookie = "sessionID=; path=/;";' + "\n";
      script += "window.parent.postMessage(JSON.parse('{\"action\":\"refreshSession\"}'), \"*\")";
      sendResponse(script);
    };

    var createSessionAndRedirect = function () {
      if(req.query.apiKey) {
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
          redirectWithSession(res.sessionID, res.validUntil, res.groupID, req.query.padName, qs);
        });
      }
    };

    if (!!eval(req.query.sessionID)) {
      getSessionEndDate({
        host: req.headers.host,
        protocol: req.protocol,
        apiKey: req.query.apiKey,
        apiVersion: '1.2.13',
        sessionID: req.query.sessionID
      }).then(function(validUntil) {
        if(parseInt(validUntil) > (new Date()).getTime()) {
          redirectWithSession(req.query.sessionID, validUntil, req.query.groupID, req.query.padName);
        } else {
          refreshSession();
          createSessionAndRedirect();
        }
      });
    } else {
      createSessionAndRedirect();
    }
  });
};

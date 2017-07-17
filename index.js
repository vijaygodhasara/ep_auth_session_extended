var request = require('request'),
  	Promise = require('promise'),
  	extend = require('util')._extend;

var API_VERSION = '1.2.13';

var isNull = function(obj) {
    return !obj ||
      typeof obj === 'undefined' ||
      obj === null ||
      /^n\s*u\s*l\s*l$/g.test(('' + obj).trim());
};

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
      if (result.response.statusCode !== 200 || result.data.code !== 0) {
        var message = result.data.message || result.data.body.message;
        var code = result.response.statusCode !== 200
          ? result.response.statusCode
          : 500;
        reject(apiError(message, code, result.data));
        return;
      }

      var res = (opts.dataField && !!result.data.data)
        ? result.data.data[opts.dataField]
        : result.data;

      resolve(res);
    }).catch(function (err) {
      reject(err);
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

var createGroup = function(opts) {
  var options = buildOptions(opts, {
    apiMethod: 'createGroupIfNotExistsFor',
    body: {groupMapper: opts.groupMapper}
  });
  return makeRequest({
    options: options,
    dataField: 'groupID'
  });
};

var getSessionId = function(opts) {
  var createAuthor = function(groupID) {
    return new Promise(function(resolve, reject) {
      var options = buildOptions(opts, {
        apiMethod: 'createAuthorIfNotExistsFor',
        body: {
          authorName: opts.authorName,
          authorMapper: opts.authorMapper
        }
      });
      makeRequest({
        options: options,
        dataField: 'authorID'
      }).then(function (authorID) {
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

  return createGroup(opts).then(createAuthor).then(createSession);
};

var buildNewQueryString = function (query) {
  var newQuery = extend({}, query);
  var queryValues = [];
  ['apiKey', 'authorName', 'authorMapper', 'groupMapper', 'validUntil', 'padName'].forEach(function (key) {
    delete newQuery[key];
  });
  for(var key in newQuery) {
    queryValues.push(key + '=' + encodeURIComponent(newQuery[key]));
  }
  return '?' + queryValues.join('&');
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

var getCommonRequestParams = function(req) {
  return {
    host: req.hostname + ':' + req.socket.localPort,
    protocol: req.protocol,
    apiKey: req.query.apiKey,
    apiVersion: API_VERSION
  };
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
      return new Promise(function(resolve, reject) {
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
        resolve();
      });
    };

    var refreshSession = function() {
      var script = '';
      script += 'document.cookie = "sessionID=; path=/;";' + "\n";
      script += "window.parent.postMessage(JSON.parse('{\"action\":\"refreshSession\"}'), \"*\")";
      sendResponse(script);
    };

    var createSessionAndRedirect = function () {
      return new Promise(function (resolve, reject) {
        getSessionId(extend(getCommonRequestParams(req), {
          authorName: req.query.authorName,
          authorMapper: req.query.authorMapper,
          groupMapper: req.query.groupMapper,
          validUntil: req.query.validUntil
        })).then(function (res) {
          var qs = buildNewQueryString(req.query);
          return redirectWithSession(res.sessionID, res.validUntil, res.groupID, req.query.padName, qs);
        }).then(function () {
          resolve();
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    if(!!req.query.apiKey) {
      if (!isNull(req.query.sessionID)) {
        var redirect = function(validUntil) {
          if (parseInt(validUntil) > (new Date()).getTime()) {
            return new Promise(function (resolve, reject) {
              createGroup(extend(getCommonRequestParams(req), {
                groupMapper: req.query.groupMapper
              })).then(function (groupID) {
                var qs = buildNewQueryString(req.query);
                return redirectWithSession(req.query.sessionID, validUntil, groupID, req.query.padName, qs).then(function () {
                  resolve();
                });
              });
            });
          } else {
            refreshSession();
            return createSessionAndRedirect();
          }
        };
        getSessionEndDate(extend(getCommonRequestParams(req), {
          sessionID: req.query.sessionID
        })).then(redirect).catch(function (err) {
          // if sessionID doesn't exist, refresh session
          if(err.error && err.error.code === 1) {
            refreshSession();
          }
          console.error(JSON.stringify(err));
          var error = err.name + ': ' + err.message + '<br/>' +
            err.error.message + ' (internal error code: ' + err.error.code + ')';
          res.status(err.status).send(error);
        });
      } else {
        createSessionAndRedirect();
      }
    } else {
      var err = "no API key in query";
      console.error("no API key in query");
      res.status(400).send(err);
    }
  });
};

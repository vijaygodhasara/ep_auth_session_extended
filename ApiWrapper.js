var request = require('request'),
    Promise = require('promise'),
    extend = require('util')._extend;

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

module.exports = {
  createGroup: createGroup,
  getSessionId: function(opts) {
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
  },
  getSessionEndDate: function(opts) {
    var options = buildOptions(opts, {
      apiMethod: 'getSessionInfo',
      body: {sessionID: opts.sessionID}
    });

    return makeRequest({
      options: options,
      dataField: 'validUntil'
    });
  }
};

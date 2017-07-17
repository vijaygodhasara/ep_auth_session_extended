var Promise = require('promise'),
  	extend = require('util')._extend,
    apiWrapper = require('./ApiWrapper'),
    common = require('./common'),
    validator = require('./validator');

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
        apiWrapper.getSessionId(extend(common.getCommonRequestParams(req), {
          authorName: req.query.authorName,
          authorMapper: req.query.authorMapper,
          groupMapper: req.query.groupMapper,
          validUntil: req.query.validUntil
        })).then(function (res) {
          var qs = common.buildNewQueryString(req.query);
          return redirectWithSession(res.sessionID, res.validUntil, res.groupID, req.query.padName, qs);
        }).then(function () {
          resolve();
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    if(!!req.query.apiKey) {
      if (!validator.isNull(req.query.sessionID)) {
        var redirect = function(validUntil) {
          if (parseInt(validUntil) > (new Date()).getTime()) {
            return new Promise(function (resolve, reject) {
              apiWrapper.createGroup(extend(common.getCommonRequestParams(req), {
                groupMapper: req.query.groupMapper
              })).then(function (groupID) {
                var qs = common.buildNewQueryString(req.query);
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
        apiWrapper.getSessionEndDate(extend(common.getCommonRequestParams(req), {
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

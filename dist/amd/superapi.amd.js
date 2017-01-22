/**
  @module superapi
  @version 0.23.1
  @copyright Stéphane Bachelier <stephane.bachelier@gmail.com>
  @license MIT
  */
define("superapi/agent", 
  ["./promise","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var Promise = __dependency1__["default"];

    function Agent (agent) {
      if (!agent) {
        throw new Error("missing superagent or any api compatible agent.");
      }
      this.agent = agent;
    }

    Agent.prototype = {
      buildRequest: function (method, url, data, opts) {
        method = method.toLowerCase();
        opts = opts || {};

        if (!this.agent) {
          throw new Error("missing superagent or any api compatible agent.");
        }

        // fix for delete being a reserved word
        if (method === "delete") {
          method = "del";
        }

        // reset data for delete operation
        // kind of hack as request.del signature is different from others being `function(url, fn)`
        // instead of `function(url, data, fn)`
        if (method === "del") {
          data = undefined;
        }

        var request = this.agent[method];
        if (!request) {
          throw new Error("Unsupported method <" + method + ">");
        }

        var _req = request(url, data);

        // add global headers
        this._setHeaders(_req, this.config.headers);

        // add global options to request headers
        this._setOptions(_req, this.config.options);

        // add service options to request headers
        this._setOptions(_req, opts.options);

        // add service headers
        this._setHeaders(_req, opts.headers);

        // add runtime headers
        this._setHeaders(_req, this.headers);

        // set credentials
        if (this.config.withCredentials) {
          _req.withCredentials();
        }

        var auth = this.config.auth;
        if (auth) {
          this._setAuth(_req, auth);
        }

        return _req;
      },

      addHeader: function(name, value) {
        this.headers = this.headers || {};
        this.headers[name] = value;
      },

      removeHeader: function(name) {
        if (this.headers && this.headers[name]) {
          delete this.headers[name];
        }
      },

      _setHeaders: function(req, headers) {
        for (var header in headers) {
          req.set(header, headers[header]);
        }
      },

      _setOptions: function(req, options) {
        for (var option in options) {
          req[option](options[option]);
        }
      },

      _setAuth: function (req, auth) {
        if (!auth) {
          return;
        }

        req.auth(auth.user || "", auth.pass || "");
      },

      handleResponse: function (request, response) {
        return new Promise(function (resolve, reject) {
          if (response) {
            return resolve(response);
          }

          request.on("error", reject);
          request.on("abort", function () {
            var error = new Error("Request has been aborted");
            error.aborted = true;

            reject(error);
          });

          request.end(function (err, res) {
            var error = err || res.error;
            if (error) {
              return reject(error);
            }

            resolve(res);
          });
        });
      }
    }

    __exports__["default"] = Agent;
  });
define("superapi/api", 
  ["./promise","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var Promise = __dependency1__["default"];

    function Api(config) {
      // create a hash-liked object where all the services handlers are registered
      this.api = Object.create(null);

      // support undefined configuration in constructor
      this.configure(config);
    }

    Api.prototype = {
      paramsPattern: /:(\w+)/g,

      configure: function (config) {
        this.config = config || {};

        if (!config) {
          return;
        }

        if (this._agent) {
          this._agent.config = config;
        }

        for (var name in config.services) {
          if (!Object.prototype.hasOwnProperty(this, name)) {
            // syntatic sugar: install a service handler available on
            // the api instance with service name
            this.api[name] = Api.defaults.serviceHandler(name).bind(this);
          }
        }
      },

      agent: function() {
        if (!this._agent) {
          throw new Error("no agent configured");
        }
        return this._agent;
      },

      withAgent: function (agent) {
        if (!agent) {
          throw new Error("missing agent");
        }
        this._agent = new Api.defaults.agent(agent);

        if (this.config) {
          this._agent.config = this.config;
        }

        return this;
      },

      service: function(id) {
        return this.config.services ? this.config.services[id] : null;
      },

      url: function(id) {
        var url = this.config.baseUrl;
        var resource = this.service(id) || id;

        // from time being it"s a simple map
        if (resource) {
          var path;

          if (typeof resource === "string") {
            path = resource;
          }

          if (typeof resource === "object" && resource.path !== undefined) {
            path = resource.path;
          }

          if (!path) {
            throw new Error("path is not defined for route $" + id);
          }

          if (path.match(/^https?:\/\//)) {
            url = path;
          }
          else {
            url += path[0] === "/" ? path : "/" + path;
          }
        }

        return url;
      },

      replaceUrl: function(url, params) {
        var tokens = url.match(this.paramsPattern);

        if (!tokens || !tokens.length) {
          return url;
        }

        for (var i = 0, len = tokens.length; i < len; i += 1) {
          var token = tokens[i];
          var name = token.substring(1);
          if (params[name]) {
            url = url.replace(token, params[name]);
          }
        }
        return url;
      },

      buildUrlQuery: function(query) {
        if (!query) {
          return "";
        }

        var queryString;

        if (typeof query === "string") {
          queryString = query;
        } else {
          var queryArgs = [];
          for (var queryArg in query) {
            queryArgs.push(queryArg + "=" + query[queryArg]);
          }
          queryString = queryArgs.join("&");
        }
        return queryString ? "?" + queryString : "";
      },

      buildUrl: function(id, params, query) {
        var url = this.url(id);

        if (params) {
          url = this.replaceUrl(url, params);
        }

        if (query) {
          url += this.buildUrlQuery(query);
        }

        return url;
      },

      request: function(id, data, params, query, method) {
        var service = this.service(id);
        method = method || (service && service.method ? service.method : "get");

        var options = service ? {
          options: service.options,
          headers: service.headers
        } : {}

        return this.agent().buildRequest(method, this.buildUrl(id, params, query), data, options);
      },

      get: function(url, options, data) {
        return this._http('get', url, options, data);
      },

      post: function(url, options, data) {
        return this._http('post', url, options, data);
      },

      put: function(url, options, data) {
        return this._http('put', url, options, data);
      },

      del: function(url, options, data) {
        return this._http('del', url, options, data);
      },

      patch: function(url, options, data) {
        return this._http('patch', url, options, data);
      },

      head: function(url, options, data) {
        return this._http('head', url, options, data);
      },

      _http: function(method, url, options, data) {
        options = options || {};
        options.data = data;
        options.method = method;

        return Api.defaults.serviceHandler(url).call(this, options);
      },

      addHeader: function(name, value) {
        this.agent().addHeader(name, value);
      },

      removeHeader: function(name) {
        this.agent().removeHeader(name);
      },

      middleware: function (name) {
        if (!this.middlewares) {
          return null;
        }
        var found = this.middlewares.filter(function (middleware) {
          return middleware.name === name;
        });

        return found.length > 0 ? found[0] : null;
      },

      status: function (name, handler) {
        if (!this.middleware("status")) {
          this.register("status", Api.defaults.middlewares.status());
        }

        var status = this.middleware("status");

        status.fn.set(name, handler);

        return status;
      },

      register: function (name, fn) {
        if (!this.middlewares) {
          this.middlewares = [];
        }

        if (fn.setup) {
          fn.setup(this);
        }

        this.middlewares.push({
          name: name,
          fn: fn
        });
      },

      _serviceMiddlewares: function (req, service) {
        if (!this.middlewares) {
          return [];
        }

        // Call all the active middlewares for this request and keep a record
        // if it's returning something.
        // Explicitly ignore any middleware returning undefined as it throws with
        // TypeError: Cannot read property 'Symbol(Symbol.iterator)' of undefined
        return this.middlewares.filter(function (middleware) {
          if (!service || !service.use) {
            return true;
          }
          return service.use && service.use[middleware.name] !== false;
        });
      },

      _applyMiddlewares: function (req, sid, stack) {
        var service = this.service(sid);
        var middlewares = this._serviceMiddlewares(req, service);

        // this is the middleware stack that will be called by each active middleware
        // for this request.
        var agent = this.agent();
        var next = function (index, response) {
          return new Promise(function (resolve, reject) {
            stack.push([resolve, reject]);

            if (index === middlewares.length - 1) {
              resolve(agent.handleResponse(req));
            }
          });
        };

        var reducer = function (response, f) {
          return Promise.resolve(response ? response : f())
            .then(function (data) {
              return data ? data : response;
            })
            .catch(function (error) {
              if (response) {
                return response;
              }
              throw error;
            });
        }

        return Promise.reduce(reducer, null)(
          middlewares
            .filter(function (m) {
              return m.fn
            })
            .map(function (m, i) {
              return function () {
                return m.fn(req, next.bind(this, i), service);
              }
            })
        );
      }
    };

    __exports__["default"] = Api;
  });
define("superapi/middlewares/status", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /*
    # status handlers middleware
    {
      304: fn,
      401: fn,
      403: fn,
    };

    */

    __exports__["default"] = function () {
      var handlers = {};

      var middleware = function (req, next) {
        next()
          .then(function (res) {
            if (!res) {
              return;
            }

            var handler = handlers[res.status];
            if (!handler) {
              return;
            }

            return handler(req, res);
          })
          .catch(function (error) {
            var handler = handlers[error.status || error.reason];
            if (!handler) {
              return;
            }

            return handler(req, error.response ? error.response : error);
          });
      };

      middleware.set = function (code, handler) {
        handlers[code] = handler;
      };

      middleware.get = function (code) {
        return handlers[code];
      };

      return middleware;
    };
  });
define("superapi/middlewares/trace", 
  ["exports"],
  function(__exports__) {
    "use strict";
    __exports__["default"] = function (config) {
      config = config || {};
      var log = config.log || null;

      var timer = (window.performance || {
        now: Date.now
      });

      return function (req, next) {
        if (!log) {
          return;
        }

        var start = timer.now();
        next()
          .then(function (res) {
            log(timer.now() - start);
          })
          .catch(function (error) {
            log(timer.now() - start);
          });
      };
    };
  });
define("superapi/promise", 
  ["exports"],
  function(__exports__) {
    "use strict";
    Promise.reduce = function reduce(fn, start) {
      return function(val) {
        val = Array.isArray(val) ? val : [val]

        const length = val.length;

        if (length === 0) {
          return Promise.resolve(start);
        }

        return val.reduce(function (promise, curr, index, arr) {
          return promise.then(function (prev) {
            if (prev === undefined && length === 1) {
              return curr;
            }

            return fn(prev, curr, index, arr)
          })
        }, Promise.resolve(start))
      }
    }

    __exports__["default"] = Promise
  });
define("superapi/service-handler", 
  ["./promise","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var Promise = __dependency1__["default"];

    __exports__["default"] = function serviceHandler (sid) {
      /*
       * Below are the supported options for the serviceHandler:
       *
       * - data (object): request data payload
       * - params (object): use to replace the tokens in the url
       * - query (object): use to build the query string appended to the url
       * - callback (function): callback to use, with a default which emits 'success' or 'error'
       *   event depending on res.ok value
       * - edit (function): callback to use, to tweak req if needed.
       */
      return function(options) {
        return new Promise(function (resolve, reject) {
          options = options || {};
          var data = options.data || {};
          var params = options.params || {};
          var query = options.query || {};
          var callback = options.callback || null;
          var edit = options.edit || null;

          var req = this.request(sid, data, params, query, options.method);

          // edit request if function defined
          if (edit && "function" === typeof edit) {
            edit(req);
          }

          var result = function (resolver, middlewares) {
            return function (error, response) {
              if (middlewares) {
                middlewares.reverse().forEach(function (middleware) {
                  if (error) {
                    middleware[1](error);
                  }
                  middleware[0](response);
                });
              }

              resolver(error, response);

              if (callback) {
                callback(error, response);
              }
            }
          }

          var stack = [];
          var failure = result(function (err, res) { reject(err); }, stack);
          var success = result(function (err, res) { resolve(res); }, stack);
          var agent = this.agent();

          return this._applyMiddlewares(req, sid, stack)
            .then(function (response) {
              return agent.handleResponse(req, response);
            })
            .then(function (res) {
              return success(null, res);
            })
            .catch(function (err) {
              return failure(err);
            });
        }.bind(this));
      };
    };
  });
define("superapi", 
  ["./superapi/api","./superapi/agent","./superapi/service-handler","./superapi/middlewares/status","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var Api = __dependency1__["default"];
    var Agent = __dependency2__["default"];
    var serviceHandler = __dependency3__["default"];
    var status = __dependency4__["default"];

    Api.defaults = {
      agent: Agent,
      serviceHandler: serviceHandler,
      middlewares: {
        status: status
      }
    };

    function superapi(config) {
      return new Api(config);
    }


    superapi.prototype.Api = Api;

    // export API
    __exports__["default"] = superapi;
  });
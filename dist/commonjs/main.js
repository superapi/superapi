"use strict";
var Api = require("./superapi/api")["default"];
var Agent = require("./superapi/agent")["default"];
var serviceHandler = require("./superapi/service-handler")["default"];
var status = require("./superapi/middlewares/status")["default"];

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
exports["default"] = superapi;
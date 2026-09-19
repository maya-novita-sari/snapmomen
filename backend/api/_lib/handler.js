const { methodNotAllowed, serverError } = require('./response');

function withMethods(methods, handler) {
  return async (req, res) => {
    if (!methods.includes(req.method)) return methodNotAllowed(res);
    try {
      return await handler(req, res);
    } 
    
    catch (err) {
      return serverError(res, err);
    }
  };
}

function withAllMethods(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } 
    
    catch (err) {
      return serverError(res, err);
    }
  };
}

module.exports = { withMethods, withAllMethods };
const errors = [
	{
		code: -32700,
		message: 'Parse error',
		meaning: 'Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.'
	},
	{
		code: -32600,
		message: 'Invalid Request',
		meaning: 'The JSON sent is not a valid Request object.'
	},
	{
		code: -32601,
		message: 'Method not found',
		meaning: 'The method does not exist / is not available.'
	},
	{
		code: -32602,
		message: 'Invalid params',
		meaning: 'Invalid method parameter(s).'
	},
	{
		code: -32603,
		message: 'Internal error',
		meaning: 'Internal JSON-RPC error.'
	}
];
let code = -32000;
while (code >= -32099) {
	errors.push({
		code,
		message: 'Server error',
		meaning: 'Reserved for implementation-defined server-errors.'
	});
	--code;
}

const codes = errors.map(err => err.code);

module.exports = class Jsonrpc {
	static requestIsValid (request) { return requestIsValid(request); }
	static handleInvalidRequest (request) { return handleInvalidRequest(request); }
	static methodIsValid (method) { return methodIsValid(method); }
	constructor (options = {}) {
		let { request, batch } = options;
		let _response = {jsonrpc: '2.0', id: null}, _isNotification = false;
		if (batch) this.batch = batch;

		if (request && !requestIsValid(request)) {
			_response = handleInvalidRequest(request);
		} else {
			_isNotification = isNotification(request);
		}
		if (request && requestIsValid(request) && request.id) {
			_response.id = request.id;
		}
		// TODO: params, method
		Object.defineProperty(this, 'request', {
			enumerable: true,
			get () {
				return request;
			},
			set: function (req) {
				request = req;
				if (undefined !== request && !requestIsValid(request)) {
					_response = handleInvalidRequest(request);
				} else {
					_isNotification = isNotification(request);
				}
			}
		});
		Object.defineProperty(this, 'response', {
			enumerable: true,
			get () {
				if (_isNotification) return null;
				if (undefined !== request && !requestIsValid(request)) return handleInvalidRequest(request);
				if (responseIsValid(_response)) return _response;
				const response = {
					id: null,
					jsonrpc: '2.0',
					error: {
						code: -32603,
						message: 'Internal error'
					}
				};
				if (isObject(request) && undefined !== request.id && null !== request.id) {
					response.id = request.id;
				}
				return response;
			},
			set: function (res) {
				_response = res;
			}
		});
		Object.defineProperty(this, 'result', {
			enumerable: false,
			get: function () {
				if (isObject(_response)) return _response.result;
			},
			set: function (result) {
				if (!isObject(_response)) _response = {};
				_response.result = result;
				if (undefined === result || null === result) {
					delete _response.result;
				}
			}
		});
		Object.defineProperty(this, 'error', {
			enumerable: false,
			get: function () {
				if (isObject(_response)) return _response.error;
			},
			set: function (error) {
				if (!isObject(_response)) _response = {};
				_response.error = error;
				if (undefined === error || null === error) {
					delete _response.error;
				}
			}
		});
		Object.defineProperty(this, 'code', {
			enumerable: false,
			get: function () {
				if (isObject(_response) && isObject(_response.error)) return _response.error.code;
			},
			set: function (code) {
				if (!isObject(_response)) _response = {};
				if (!isObject(_response.error)) _response.error = {};
				_response.error.code = code;
				const err = errors.find(err => err.code === code);
				if (err) _response.error.message = err.message
			}
		});
		Object.defineProperty(this, 'message', {
			enumerable: false,
			get: function () {
				if (isObject(_response) && isObject(_response.error)) return _response.error.message;
			},
			set: function (message) {
				if (!isObject(_response)) _response = {};
				if (!isObject(_response.error)) _response.error = {};
				_response.error.message = message;
			}
		});
		Object.defineProperty(this, 'data', {
			enumerable: false,
			get: function () {
				if (isObject(_response) && isObject(_response.error)) return _response.error.data;
			},
			set: function (data) {
				if (!isObject(_response)) _response = {};
				if (!isObject(_response.error)) _response.error = {};
				if (undefined === data || null === data) {
					delete _response.error.data;
				} else {
					_response.error.data = data;
				}
			}
		});
		Object.defineProperty(this, 'id', {
			enumerable: false,
			get: function () {
				if (isObject(_response) && _response.id) return _response.id;
				if (isObject(request) && undefined !== request.id && null !== request.id) return request.id;
			},
			set: function (id) {
				if (!isObject(_response)) _response = {};
				_response.id = id;
			}
		});
	}
	invalidParams (data) {
		let _data = this.data;
		this.error = {
			code: -32602,
			message: 'Invalid params'
		};
		this.result = null;
		if (_data !== undefined && _data !== null) this.data = _data;
		if (data !== undefined && data !== null) this.data = data;
	}
	serverError (code, data) {
		let _data = this.data;
		this.error = {
			code: (code && !isNaN(Number(code))) ? code : -32000,
			message: 'Server error'
		};
		this.result = null;
		if (_data !== undefined && _data !== null) this.data = _data;
		if (data !== undefined && data !== null) this.data = data;
	};
};
function stringIsValidJson (text) {
	return /^[\],:{}\s]*$/.test(text.replace(/\\["\\\/bfnrtu]/g, '@').
	replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
	replace(/(?:^|:|,)(?:\s*\[)+/g, ''));
}
function isObject (obj) {
	return '[object Object]' === Object.prototype.toString.call(obj);
}
function handleInvalidRequest (reqObj) {
	const response = {
		jsonrpc: '2.0'
	};

	/*if ( !stringIsValidJson(reqObj) ) { // TODO
		response.id = null;
		response.error = {
			code: -32700,
			message: 'Parse error'
		};
		return response;
	}*/

	if (!isObject(reqObj) || (('id' in reqObj) && !idIsValid(reqObj.id))) {
		response.id = null;
		response.error = {
			code: -32600,
			message: 'Invalid Request'
		};
		return response;
	}
	if (!jsonrpcIsValid(reqObj.jsonrpc) || !methodIsValid(reqObj.method)) {
		response.id = reqObj.id || null;
		response.error = {
			code: -32600,
			message: 'Invalid Request'
		};
		return response;
	}
	if (('params' in reqObj) && !paramsIsValid(reqObj.params)) {
		response.id = reqObj.id || null;
		response.error = {
			code: -32602,
			message: 'Invalid params'
		};
		return response;
	}
	const requestObjectValidKeys = ['jsonrpc', 'method', 'params', 'id'];
	for (let k in reqObj) {
		if (!requestObjectValidKeys.includes(k)) {
			response.id = reqObj.id || null;
			response.error = {
				code: -32600,
				message: 'Invalid Request'
			};
			return response;
		}
	}

	return {
		jsonrpc: '2.0',
		id: reqObj.id || null,
		error: {
			code: -32603,
			message: 'Internal error'
		}
	}
}
function requestIsValid (reqObj) {
	if (!isObject(reqObj)) {
		return false;
	}
	if (!jsonrpcIsValid(reqObj.jsonrpc)) {
		return false;
	}
	if (!methodIsValid(reqObj.method)) {
		return false;
	}
	if (('id' in reqObj) && !idIsValid(reqObj.id)) {
		return false;
	}
	if (('params' in reqObj) && !paramsIsValid(reqObj.params)) {
		return false;
	}

	const requestObjectValidKeys = ['jsonrpc', 'method', 'params', 'id'];
	for (let k in reqObj) {
		if (!requestObjectValidKeys.includes(k)) {
			return false;
		}
	}

	return true;
}
function responseIsValid (response) {
	if (!isObject(response)) {
		return false;
	}
	if (!jsonrpcIsValid(response.jsonrpc)) {
		return false;
	}
	if (('id' in response) && !idIsValid(response.id)) {
		return false;
	}
	if ('error' in response) {
		if (!errObjectIsValid(response.error)) {
			return false;
		}
		if ('result' in response) {
			return false;
		}
	} else if (!('result' in response)) {
		return false;
	}
	const requestObjectValidKeys = ['jsonrpc', 'id', 'result', 'error'];
	for (let k in response) {
		if (!requestObjectValidKeys.includes(k)) {
			return false;
		}
	}
	return true;
}
function jsonrpcIsValid (val) {
	return val === '2.0';
}
function paramsIsValid (params) {
	return isObject(params) || Array.isArray(params);
}
function methodIsValid (val) {
	return val && ('string' === typeof val && Boolean(val.trim()));
}
function idIsValid (val) {
	if ((null !== val && 'string' !== typeof val && !Number.isInteger(val))) {
		return false;
	}
	return true;
}
function errObjectIsValid (val) {
	if (!isObject(val)) {
		return false;
	}
	if (!codes.includes(val.code)) {
		return false;
	}

	const errValidKeys = ['code', 'message', 'data'];
	for (let k in val) {
		if (!errValidKeys.includes(k)) {
			return false;
		}
	}
	return true;
}
function isNotification (reqObj) {
	return !('id' in reqObj);
}

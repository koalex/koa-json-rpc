const debug     = require('debug')('koa-json-rpc');
const koaRouter = require('koa-router');
const compose   = require('koa-compose');
const Jsonrpc   = require('./lib/jsonrpc');


const handler = async (router, context, next, requestObject, responseKey) => { // requestObject = ctx.request.body;
	debug('request: %o', requestObject);
	if (!Jsonrpc.requestIsValid(requestObject)) {
		return context.state.jsonRpcResponses[responseKey] = Jsonrpc.handleInvalidRequest(requestObject);
	}
	const jsonrpc = new Jsonrpc({request: requestObject});
	const _ctx = Object.create(context, {
		body: {
			configurable: false,
			get: function () {
				return context.state.jsonRpcResponses[responseKey];
			},
			set: function (val) {
				if (Jsonrpc.responseIsValid(val)) {
					context.state.jsonRpcResponses[responseKey] = val;
				} else {
					jsonrpc.result = val;
					context.state.jsonRpcResponses[responseKey] = jsonrpc.response;
				}
			}
		}
	});

	_ctx.jsonrpc = jsonrpc;

	let {proxy, revoke} = Proxy.revocable(_ctx, {
		set (target, prop, val, receiver) {
			if ('body' === prop) {
				target[prop] = val;
			} else {
				context[prop] = val;
			}
			return true;
		}
	});

	const ctx = proxy;

	if (router._handlers[requestObject.method]) {
		await Promise.resolve(router._handlers[requestObject.method](ctx, next))
			.catch(async err => { // err.message err.name err.code err.status err.stack...
				debug('error: %o', err);
				if (router.onerror) {
					try {
						debug('trying handle error');
						await router.onerror(err, ctx);
					} catch (err) {
						debug('onerror is down: %o', err);
						ctx.jsonrpc.serverError(null, err);
						ctx.body = ctx.jsonrpc.response;
					}

				} else {
					ctx.jsonrpc.serverError(null, err);
					ctx.body = ctx.jsonrpc.response;
				}
			});
		if (Jsonrpc.isNotification(requestObject)) {
			ctx.body = null;
		}
		revoke();
	} else { // TODO: does this case is possible ?
		context.state.jsonRpcResponses[responseKey] =  {
			jsonrpc: '2.0',
			id: ctx.jsonrpc.id || null,
			error: {
				code: -32601,
				message: 'Method not found',
			}
		};
		revoke();
	}
};

module.exports = class Router {
	constructor (props = {}) {
		const koaRouterProps = {};
		if (props.base) koaRouterProps.prefix = props.base;
		this._router = new koaRouter(koaRouterProps);
		this._handlers = {};
		if (props.onerror) {
			this.onerror = props.onerror;
		}
		this.parallel = ('parallel' in props) ? Boolean(props.parallel) : true;
		this.bodyParser = props.bodyParser;
	}
	allowedMethods (opts) {
		this._router.allowedMethods(opts);
	}
	set base (prefix) {
		this._router.prefix(prefix);
	}
	method (method, ...middlewares) {
		if (!Jsonrpc.methodIsValid(method)) {
			throw new Error('"method" must be string containing the name of the method to be invoked and cannot starts with "rpc."');
		}
		this._handlers[method] = compose(middlewares);
	}
	methods () {
		this.routes();
		return this._router.routes();
	}
	get methodsList () {
		return Object.keys(this._handlers);
	}
	hasAllHandlersForRequest (reqBody) {
		if (Array.isArray(reqBody)) {
			return reqBody.every(req => {
				if (!isObject(req)) return true;
				if (isObject(req) && ('method' in req) && this._handlers[req.method]) return true;
				return false;
			});
		}

		if (isObject(reqBody)) {
			if (!('method' in reqBody)) return true;
			if (this._handlers[reqBody.method]) return true;
			if (!Jsonrpc.methodIsValid(reqBody.method)) return true;
			return false;
		}
	}

	routes () {
		return this._router.post('/', (this.bodyParser || function (ctx, next) { return next(); }), async (ctx, next) => {
			if (!ctx.request.body) {
				return ctx.body = Jsonrpc.parseError;
			}
			const parallel = this.parallel;

			debug('request raw: %o', ctx.request.body);
			let initialRouter = false;
			if (!ctx.state.jsonRpcResponses) {
				initialRouter = true;
				ctx.state.jsonRpcResponses = Array.isArray(ctx.request.body) ? {...ctx.request.body.map(v => undefined)} : {0: undefined};
			}

			if (Array.isArray(ctx.request.body)) {
				ctx.type = 'json';
				if (!ctx.request.body.length) {
					ctx.state.jsonRpcResponses['0'] = Jsonrpc.invalidRequest;
				} else {
					if (parallel) {
						let currentRouterHandlers = [];
						if (this.hasAllHandlersForRequest(ctx.request.body)) {
							currentRouterHandlers = ctx.request.body.map((rpcReq, i) => handler(this, ctx, next, rpcReq, i));
						} else {
							currentRouterHandlers = ctx.request.body.reduce((acc, rpcReq, i, body) => {
								if (!isObject(rpcReq)) {
									acc.push(handler(this, ctx, next, rpcReq, i));
									return acc;
								}
								if (Boolean(this._handlers[rpcReq.method]) || !('method' in rpcReq)) {
									acc.push(handler(this, ctx, next, rpcReq, i));
									return acc;
								}
								return acc;
							}, []).concat(parallel ? next() : []);
						}

						await Promise.all(currentRouterHandlers);
					} else {
						for (let i = 0, l = ctx.request.body.length; i < l; i++) {
							const rpcReq = ctx.request.body[i];
							if (!Jsonrpc.requestIsValid(rpcReq) || this.hasAllHandlersForRequest(rpcReq)) {
								await handler(this, ctx, next, rpcReq, i)
							}
						}
						if (Object.values(ctx.state.jsonRpcResponses).filter(v => v === undefined).length) {
							await next();
						}
					}
				}
			} else {
				if (this.hasAllHandlersForRequest(ctx.request.body)) {
					await handler(this, ctx, next, ctx.request.body, 0);
				} else {
					await next();
				}
			}

			if (initialRouter) {
				ctx.status = 200;
				let finalResult = isBatch(ctx.request.body) ? [] : ctx.state.jsonRpcResponses[0];

				if (isBatch(ctx.request.body)) { // batch
					for (let i in ctx.state.jsonRpcResponses) {
						const res = ctx.state.jsonRpcResponses[i];
						if (res === undefined) {
							let response = Jsonrpc.methodNotFound;
								response.id = (Array.isArray(ctx.request.body) ? ctx.request.body[Number(i)].id : ctx.request.body.id) || null;
							finalResult.push(response);
							continue;
						}
						if (res !== null) {
							finalResult.push(res);
						}
					}
					if (!finalResult.length) finalResult = null;
				} else if (undefined === finalResult) {
					let response = Jsonrpc.methodNotFound;
						response.id = ctx.request.body.id || null;
					finalResult = response;
				}

				if (null !== finalResult) ctx.body = finalResult;

				delete ctx.state.jsonRpcResponses;
			}
		})
	}
};
function isObject (obj) {
	return '[object Object]' === Object.prototype.toString.call(obj);
}
function isBatch (req) {
	return Array.isArray(req) && req.length;
}

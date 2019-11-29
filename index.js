const debug     = require('debug')('koa-json-rpc');
const koaRouter = require('koa-router');
const compose   = require('koa-compose');
const Jsonrpc   = require('./lib/jsonrpc');


async function handler (router, context, next, requestObject) { // requestObject = ctx.request.body;
	debug('request: %o', requestObject);
	if (!Jsonrpc.requestIsValid(requestObject)) { // если невалидный запрос
		return Jsonrpc.handleInvalidRequest(requestObject);
	}
	// const ctx = Object.assign(Object.create(Object.getPrototypeOf(ctx)), ctx);
	let result;
	const ctx = Object.create(context, {
		body: {
			configurable: false,
			get: function () {
				return result;
			},
			set: function (val) {
				result = val;
			}
		}
	});

	ctx.jsonrpc = new Jsonrpc({request: requestObject});

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

		if (ctx.body !== undefined && ctx.body !== null) {
			ctx.jsonrpc.result = ctx.body;
			ctx.body = ctx.jsonrpc.response;
		}
		return ctx.body;
	} else {
		return  {
			jsonrpc: '2.0',
			id: ctx.jsonrpc.id || null,
			error: {
				code: -32601,
				message: 'Method not found',
			}
		};
	}
}

module.exports = class Router {
	constructor (props) {
		const koaRouterProps = {};
		if (props.base) koaRouterProps.prefix = props.base;
		this._router = new koaRouter(koaRouterProps);
		this._handlers = {};
		if (props.onerror) {
			this.onerror = props.onerror;
		}
	}
	allowedMethods (opts) {
		this._router.allowedMethods(opts);
	}
	set base (prefix) {
		this._router.prefix(prefix);
	}
	method (method, ...middlewares) {
		if (!Jsonrpc.methodIsValid(method)) throw new Error('"method" must be string containing the name of the method to be invoked.');
		this._handlers[method] = compose(middlewares);
	}
	methods () {
		this.routes();
		return this._router.routes();
	}
	routes () {
		return this._router.post('/', async (ctx, next) => {
			if (!ctx.request.body) {
				return ctx.body = {
					jsonrpc: '2.0',
					id: null,
					error: {
						code: -32700,
						message: 'Parse error',
						// data: 'Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.'
					}
				}
			}
			let result;
			let prevResult = ctx.body;

			debug('request raw: %o', ctx.request.body);

			if (!ctx.state.unhandledJsonRpcRequests) {
				ctx.state.unhandledJsonRpcRequests = Array.isArray(ctx.request.body) ? {...ctx.request.body.map(v => true)} : {0: true};
			}

			if (Array.isArray(ctx.request.body)) {
				ctx.type = 'json';
				if (!ctx.request.body.length) {
					result = {
						jsonrpc: '2.0',
						id: null,
						error: {
							code: -32600,
							message: 'Invalid Request',
						}
					};
				} else {
					ctx.type = 'json';
					result = await Promise.all(
						ctx.request.body
							.filter((rpcReq, i) => ctx.state.unhandledJsonRpcRequests[i])
							.map(rpcReq => handler(this, ctx, next, rpcReq))
					);

					for (let i = 0, l = result.length; i < l; i++) {
						let reqResult = result[i];
						if (!(reqResult && reqResult.error && reqResult.error.code === -32601)) { // method not found
							delete ctx.state.unhandledJsonRpcRequests[i];
						}
					}

					result = result.filter(reqResult => {
						if (reqResult && reqResult.error && reqResult.error.code === -32601) return false;
						return reqResult !== null && reqResult !== undefined
					});
					if (!result.length) result = null;
				}
			} else {
				result = await handler(this, ctx, next, ctx.request.body);
				delete ctx.state.unhandledJsonRpcRequests[0];
			}

			if (null !== prevResult && undefined !== prevResult) {
				if (null !== result && undefined !== result) {
					result = Array.isArray(prevResult) ? [...prevResult].concat(result) : result.concat(prevResult);
				} else {
					result = prevResult;
				}
			}

			if (null !== result && undefined !== result) {
				debug('ctx.body: %o', result);
				ctx.body = result;
			}
			ctx.status = 200;
			if (Object.keys(ctx.state.unhandledJsonRpcRequests).length) {
				return next();
			}
		})
	}
};

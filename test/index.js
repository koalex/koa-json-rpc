const assert        = require('assert').strict;
const http          = require('http');
const app           = new (require('koa'));
const koaBodyParser = require('koa-bodyparser'); // application/json , application/x-www-form-urlencoded ONLY
const Jsonrpc       = require('../index');
const JsonrpcRouter = new Jsonrpc({
	base: '/api',
	onerror: async (err, ctx) => {
		ctx.throw(err);
	}
});

JsonrpcRouter.method('subtract', (ctx, next) => {
	ctx.body = ctx.jsonrpc.request.params[0] - ctx.jsonrpc.request.params[1];
});
JsonrpcRouter.method('update', (ctx, next) => {
	// ...some code
});
JsonrpcRouter.method('sum', (ctx, next) => {
	let result = 0;
	ctx.jsonrpc.request.params.forEach(num => result += num);
	ctx.body = result;
});
JsonrpcRouter.method('notify_hello', (ctx, next) => {
	// ...some code
});
JsonrpcRouter.method('notify_sum', (ctx, next) => {
	// ...some code
});
JsonrpcRouter.method('get_data', (ctx, next) => {
	ctx.body = ['hello', 5];
});

app.use(koaBodyParser({
	onerror: (err, ctx) => {
		ctx.status = 200;
		ctx.body = {
			id: null,
			jsonrpc: '2.0',
			error: {
				code: -32700,
				message: 'Parse error'
			}
		};
	}
}));
app.use(JsonrpcRouter.methods());

const server  = http.createServer(app.callback());
const request = require('supertest')(server);

describe('KOA.js JSON-RPC 2.0', () => {
	describe('https://www.jsonrpc.org/specification#examples', () => {
		it('rpc call with positional parameters #1', function (done) {
			request
				.post('/api')
				.send({jsonrpc: '2.0', method: 'subtract', params: [42, 23], id: 1})
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{jsonrpc: '2.0', result: 19, id: 1}
					);
				})
				.end(done);
		});
		it('rpc call with positional parameters #2', function (done) {
			request
				.post('/api')
				.send({jsonrpc: '2.0', method: 'subtract', params: [23, 42], id: 2})
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{jsonrpc: '2.0', result: -19, id: 2}
					);
				})
				.end(done);
		});
		it('a Notification', function (done) {
			request
				.post('/api')
				.send({jsonrpc: '2.0', method: 'update', params: [1,2,3,4,5]})
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /text/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(response.body, {});
				})
				.end(done);
		});
		it('rpc call of non-existent method', function (done) {
			request
				.post('/api')
				.send({jsonrpc: '2.0', method: 'foobar', id: '1'})
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{
							jsonrpc: '2.0',
							id: '1',
							error: {
								code: -32601,
								message: 'Method not found'
							}
						}
					);
				})
				.end(done);
		});
		it('rpc call with invalid JSON', function (done) {
			request
				.post('/api')
				.send('{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]')
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{jsonrpc: '2.0', error: {code: -32700, message: 'Parse error'}, id: null}
					);
				})
				.end(done);
		});
		it('rpc call with invalid Request object', function (done) {
			request
				.post('/api')
				.send({jsonrpc: 2.0, method: 1, params: 'bar'})
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null}
					);
				})
				.end(done);
		});
		it('rpc call Batch, invalid JSON', function (done) {
			request
				.post('/api')
				.send('[{"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},{"jsonrpc": "2.0", "method"]')
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{jsonrpc: '2.0', error: {code: -32700, message: 'Parse error'}, id: null}
					);
				})
				.end(done);
		});
		it('rpc call with an empty Array', function (done) {
			request
				.post('/api')
				.send([])
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null}
					);
				})
				.end(done);
		});
		it('rpc call with an invalid Batch (but not empty)', function (done) {
			request
				.post('/api')
				.send([1])
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						[{jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null}]
					);
				})
				.end(done);
		});
		it('rpc call with invalid Batch', function (done) {
			request
				.post('/api')
				.send([1,2,3])
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						[
							{jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null},
							{jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null},
							{jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null}
						]
					);
				})
				.end(done);
		});
		it('rpc call Batch', function (done) {
			request
				.post('/api')
				.send([
					{jsonrpc: '2.0', method: 'sum', params: [1,2,4], id: '1'},
					{jsonrpc: '2.0', method: 'notify_hello', params: [7]},
					{jsonrpc: '2.0', method: 'subtract', params: [42,23], id: '2'},
					{foo: 'boo'},
					{jsonrpc: '2.0', method: 'foo.get', params: {name: 'myself'}, id: '5'},
					{jsonrpc: '2.0', method: 'get_data', id: '9'}
				])
				.set('Accept', 'application/json')
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						[
							{jsonrpc: '2.0', result: 7, id: '1'},
							{jsonrpc: '2.0', result: 19, id: '2'},
							{jsonrpc: '2.0', 'error': {'code': -32600, message: 'Invalid Request'}, id: null},
							{jsonrpc: '2.0', 'error': {'code': -32601, message: 'Method not found'}, id: '5'},
							{jsonrpc: '2.0', result: ['hello', 5], id: '9'}
						]
					);
				})
				.end(done);
		});
		it('rpc call Batch (all notifications)', function (done) {
			request
				.post('/api')
				.send([
					{jsonrpc: "2.0", method: "notify_sum", params: [1,2,4]},
					{jsonrpc: "2.0", method: "notify_hello", params: [7]}
				])
				.set('Content-Type', 'application/json')
				.expect('Content-Type', /text/)
				.expect(200)
				.expect(response => {
					assert.deepStrictEqual(
						response.body,
						{}
					);
				})
				.end(done);
		});
	});
});

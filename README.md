# koa-json-rpc

> JSON-RPC 2.0 middleware for [Koa.js](https://github.com/koajs/koa) which implements the [https://www.jsonrpc.org/specification](https://www.jsonrpc.org/specification)

* Batch support
* Parallel handling

## Installation

Install using [npm](https://www.npmjs.org/):

```sh
npm i @koalex/koa-json-rpc --save
```
## API Reference
  
* [koa-json-rpc](#module_koa-json-rpc)
    * [Jsonrpc](#exp_module_koa-json-rpc)
        * [new Jsonrpc([opts])](#new_module_koa-json-rpc_new)
        * _instance_
            * [.method(method, middleware)](#new_module_koa-json-rpc_new_method) ⇒ <code>Jsonrpc</code>
            * [.methods [[Get]]](#new_module_koa-json-rpc_new_methods_static) ⇒ <code>Array</code>
            * [.middleware [[Get]]](#new_module_koa-json-rpc_new_middleware) ⇒ <code>Function</code>
        * _static_
            * [.parseError [[Gett]]](#module_koa-json-rpc_parseerror_static) ⇒ <code>Object</code>
         
         
<a name="exp_module_koa-json-rpc"></a>
### Jsonrpc ⏏
**Kind**: Exported class 
   
   
<a name="new_module_koa-json-rpc_new"></a>
#### new Jsonrpc([opts])
Create a new JSON-RPC

| Param | Type | Description |
| --- | --- | --- |
| [opts] | <code>Object</code> |  |
| [opts.onerror] | <code>Function</code> |  |
| [opts.parallel] | <code>Boolean</code> | default is <code>true</code> |
| [opts.bodyParser] | <code>Function</code> | <code>koa-bodyparser</code> or <code>async-busboy</code> or some another. |

**Examples**  
Basic usage:

```javascript
const Koa        = require('koa');
const Router     = require('koa-router');
const bodyParser = require('koa-bodyparser');
const Jsonrpc    = require('@koalex/koa-json-rpc');

const app     = new Koa();
const router  = new Router();

const jsonrpc = new Jsonrpc({
    bodyParser: bodyParser({
        onerror: (err, ctx) => {
            ctx.status = 200;
            ctx.body = Jsonrpc.parseError;
        }
    })
});

jsonrpc.method('someMethod', (ctx, next) => {
    // ctx.jsonrpc available
    /*
        ctx.jsonrpc.request
        ctx.jsonrpc.id
        ctx.jsonrpc.method [[Get]]
        ctx.jsonrpc.params [[Get]]
        ctx.jsonrpc.response
        ctx.jsonrpc.result
        ctx.jsonrpc.error
        ctx.jsonrpc.code
        ctx.jsonrpc.message
        ctx.jsonrpc.data
    */
    ctx.body = 'Hello world!';
});

router.post('/api', jsonrpc.middleware);

app.use(router.routes());
/*
    REQUEST -> {id: 987, jsonrpc: '2.0', method: 'someMethod'}
    RESPONSE <- {jsonrpc: '2.0', id: 987, result: 'Hello world!'}
*/
```
**Additional usage examples:**
```javascript
jsonrpc.method('sum', (ctx, next) => {
    let sum = 0;
    ctx.jsonrpc.params.forEach(num => sum += num);
    ctx.body = sum;
    /*
        also you can:
        ctx.jsonrpc.result = sum;
        ctx.body = ctx.jsonrpc.response;
    */
});
jsonrpc.method('someErrMethod', (ctx, next) => {
    throw new Error('Crash...');
});
jsonrpc.method('someHttpErrMethod', (ctx, next) => {
    ctx.throw(500);
});
/*
    REQUEST -> {id: 1, jsonrpc: '2.0', method: 'sum', params: [1, 2, 3]}
    RESPONSE <- {jsonrpc: '2.0', id: 1, result: 6}
*/
/*
    REQUEST -> {id: 2, jsonrpc: '2.0', method: 'someErrMethod', params: [1, 2, 3]}
    RESPONSE <- {jsonrpc: '2.0', id: 2, error: {code: -32000: message: 'Server error', data: 'Error: Crash...'}}
*/
/*
    REQUEST -> {id: 3, jsonrpc: '2.0', method: 'someHttpErrMethod', params: [1, 2, 3]}
    RESPONSE <- {jsonrpc: '2.0', id: 3, error: {code: -32000: message: 'Server error', data: {message: 'Internal Server Error'}}}
*/
```
Batch:
```javascript
const Koa        = require('koa');
const Router     = require('koa-router');
const bodyParser = require('koa-bodyparser');
const Jsonrpc    = require('@koalex/koa-json-rpc');

const app    = new Koa();
const router = new Router();

const jsonrpc = new Jsonrpc({
    bodyParser: bodyParser({
        onerror: (err, ctx) => {
            ctx.status = 200;
            ctx.body = Jsonrpc.parseError;
        }
    })
});

jsonrpc.method('sum', (ctx, next) => {
    let sum = 0;
    ctx.jsonrpc.params.forEach(num => sum += num);
    ctx.body = sum;
});
jsonrpc.method('subtract', (ctx, next) => {
    ctx.body = ctx.jsonrpc.params.minuend - ctx.jsonrpc.params.subtrahend;
});

router.post('/api', jsonrpc.middleware);

app.use(router.routes());

/* 
    REQUEST ->
    [
        {id: 123, jsonrpc: '2.0', method: 'sum', params: [1, 2, 3]},
        {id: 456, jsonrpc: '2.0', method: 'subtract', params: {minuend: 10, subtrahend: 3}}
    ]

    RESPONSE <-
    [
        {id: 123, jsonrpc: '2.0', result: 6},
        {id: 456, jsonrpc: '2.0', result: 7}
    ]
*/
```
Batch with different instances of Jsonrpc:
```javascript
const Koa           = require('koa');
const Router        = require('koa-router');
const koaBodyParser = require('koa-bodyparser');
const Jsonrpc       = require('@koalex/koa-json-rpc');

const app     = new Koa();
const router  = new Router();

const bodyParser = koaBodyParser({
    onerror: (err, ctx) => {
        ctx.status = 200;
        ctx.body = Jsonrpc.parseError;
    }
});

const jsonrpc1 = new Jsonrpc();
const jsonrpc2 = new Jsonrpc();

jsonrpc1.method('sum', (ctx, next) => {
    let sum = 0;
    ctx.jsonrpc.params.forEach(num => sum += num);
    ctx.body = sum;
});
jsonrpc2.method('subtract', (ctx, next) => {
    ctx.body = ctx.jsonrpc.params.minuend - ctx.jsonrpc.params.subtrahend;
});

router.post('/api', bodyParser, jsonrpc.middleware, jsonrpc2.middleware);

app.use(router.routes());

/* 
    REQUEST ->
    [
        {id: 1234, jsonrpc: '2.0', method: 'sum', params: [1, 2, 3]},
        {id: 4567, jsonrpc: '2.0', method: 'subtract', params: {minuend: 10, subtrahend: 3}}
    ]

    RESPONSE <-
    [
        {id: 1234, jsonrpc: '2.0', result: 6},
        {id: 4567, jsonrpc: '2.0', result: 7}
    ]
*/
```

<a name="new_module_koa-json-rpc_new_method"></a>
#### jsonrpc.method(methodName, middleware [,...middleware]) ⇒ <code>Jsonrpc</code>
| Param | Type | Description |
| --- | --- | --- |
| methodName | <code>String</code> | A String containing the name of the method to be invoked. Method names that begin with the word `rpc` followed by a period character (U+002E or ASCII 46) are reserved for rpc-internal methods and extensions and MUST NOT be used for anything else. |
| middleware | <code>Function</code> | middleware |



<a name="new_module_koa-json-rpc_new_methods_static"></a>
#### jsonrpc.methods [[Get]]⇒ <code>Array</code>
Returns a list of registered methods.

```javascript
jsonrpc.method('sum', (ctx, next) => {
    // Some code...
});
jsonrpc.method('subtract', (ctx, next) => {
    // Some code...
});

console.log( jsonrpc.methods ); // ['sum', 'subtract']
```


<a name="new_module_koa-json-rpc_new_middleware"></a>
#### jsonrpc.middleware [[Get]]⇒ <code>Function</code>
Returns a middleware function which takes arguments <code>ctx</code> and <code>next</code>


<a name="module_koa-json-rpc_parseerror_static"></a>
#### Jsonrpc.parseError ⇒ <code>Object</code>
Returns error reponse object:
<code>
{
    jsonrpc: '2.0',
    id: null,
    error: {
        code: -32700,
        message: 'Parse error',
    }
}
</code>

**Kind**: static method of <code>[Jsonrpc](#exp_module_koa-json-rpc)</code>  

**Example**  
```javascript
const Koa        = require('koa');
const Router     = require('koa-router');
const bodyParser = require('koa-bodyparser');
const Jsonrpc    = require('@koalex/koa-json-rpc');

const app    = new Koa();
const router = new Router();

const jsonrpc = new Jsonrpc({
    bodyParser: bodyParser({
        onerror: (err, ctx) => {
            ctx.status = 200;
            ctx.body = Jsonrpc.parseError;
        }
    })
});

jsonrpc.method('someMethod', (ctx, next) => {
    // ctx.jsonrpc available
});

router.post('/api', jsonrpc.middleware);

app.use(router.routes());
```

## Contributing

Please submit all issues and pull requests to the [koalex/koa-json-rpc](http://github.com/koalex/koa-json-rpc) repository!

## Tests

Run tests using `npm test`.

<hr/>

This project using [SemVer](http://semver.org) for versioning. For the versions available, see the [tags on this repository](https://github.com/koalex/koa-json-rpc/tags). 

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

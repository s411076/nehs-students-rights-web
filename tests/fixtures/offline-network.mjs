import http from 'node:http';
import https from 'node:https';

function assertLoopback(value) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new TypeError(`Offline harness blocked external destination: ${url.origin}`);
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assertLoopback(typeof input === 'string' || input instanceof URL ? input : input.url);
  return originalFetch(input, init);
};
for (const transport of [http, https]) {
  const request = transport.request;
  transport.request = function (input, ...args) {
    if (typeof input === 'string' || input instanceof URL) assertLoopback(input);
    else assertLoopback(`${input.protocol || 'http:'}//${input.hostname || input.host || 'localhost'}`);
    return request.call(this, input, ...args);
  };
  transport.get = function (...args) {
    const result = transport.request(...args);
    result.end();
    return result;
  };
}
export { assertLoopback };

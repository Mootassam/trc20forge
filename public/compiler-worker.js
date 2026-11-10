/* eslint-disable no-restricted-globals */
/**
 * Solidity compiler Web Worker.
 *
 * Loads an emscripten `soljson` build (TRON's fork of solc, the same compiler
 * Tronscan uses for verification) and exposes its standard-JSON interface.
 * Runs off the main thread so the UI never freezes during compilation.
 *
 * Protocol:
 *   in : { id, url, input }           input = standard-JSON string
 *   out: { id, ok: true, output, version } | { id, ok: false, error }
 */
var state = { url: null, api: null };
var queue = Promise.resolve();

function bind(M) {
  if (!M || typeof M.cwrap !== "function") throw new Error("Compiler module did not initialise.");
  return {
    version: M.cwrap("solidity_version", "string", []),
    compile: M.cwrap("solidity_compile", "string", ["string", "number", "number"]),
    reset: typeof M._solidity_reset === "function" ? M.cwrap("solidity_reset", null, []) : function () {},
  };
}

function waitForRuntime(M) {
  if (!M || M.calledRun !== false) return Promise.resolve(M);
  return new Promise(function (resolve) {
    var prev = M.onRuntimeInitialized;
    M.onRuntimeInitialized = function () {
      if (typeof prev === "function") prev();
      resolve(M);
    };
  });
}

function load(url) {
  if (state.api) {
    if (state.url === url) return Promise.resolve(state.api);
    return Promise.reject(new Error("A different compiler is already loaded. Reload the page to switch compilers."));
  }
  try {
    importScripts(url); // synchronous; throws on network / CSP failure
  } catch (e) {
    throw new Error("Could not download the TRON compiler from " + url + ". Check your internet connection, VPN or ad-blocker, then try again.");
  }
  return waitForRuntime(self.Module).then(function (M) {
    state.api = bind(M);
    state.url = url;
    return state.api;
  });
}

function handle(msg) {
  var id = msg && msg.id;
  return Promise.resolve()
    .then(function () {
      if (typeof msg.url !== "string" || typeof msg.input !== "string") throw new Error("Bad compiler request.");
      return load(msg.url);
    })
    .then(function (api) {
      var output = api.compile(msg.input, 0, 0);
      api.reset();
      self.postMessage({ id: id, ok: true, output: output, version: api.version() });
    })
    .catch(function (err) {
      self.postMessage({ id: id, ok: false, error: String((err && err.message) || err) });
    });
}

self.onmessage = function (event) {
  // Serialise requests: the emscripten heap is not re-entrant.
  queue = queue.then(function () {
    return handle(event.data);
  });
};

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");

// ../../../node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/registro-security.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
var HMAC_LENGTH_BYTES = 32;
var OTP_SPACE = 1e6;
var UINT32_SPACE = 4294967296;
var OTP_REJECTION_LIMIT = Math.floor(UINT32_SPACE / OTP_SPACE) * OTP_SPACE;
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
__name(base64url, "base64url");
function fromBase64url(value) {
  if (!value || !BASE64URL_PATTERN.test(value)) {
    throw new Error("sesion_invalida");
  }
  const normalized2 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized2 + "=".repeat((4 - normalized2.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(
      binary,
      (char) => char.charCodeAt(0)
    );
    if (base64url(bytes) !== value) {
      throw new Error("sesion_invalida");
    }
    return bytes;
  } catch {
    throw new Error("sesion_invalida");
  }
}
__name(fromBase64url, "fromBase64url");
async function importHmacKey(secret) {
  if (!secret) throw new Error("sesion_invalida");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(importHmacKey, "importHmacKey");
async function hmac(value, secret) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );
  return new Uint8Array(signature);
}
__name(hmac, "hmac");
function isOptionalString(value) {
  return value === void 0 || typeof value === "string";
}
__name(isOptionalString, "isOptionalString");
function isSessionPayload(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return (candidate.purpose === "registro" || candidate.purpose === "documentos") && typeof candidate.cedula === "string" && typeof candidate.celular === "string" && typeof candidate.enlaceId === "string" && isOptionalString(candidate.otpId) && isOptionalString(candidate.clienteId) && isOptionalString(candidate.solicitudId) && typeof candidate.exp === "number" && Number.isFinite(candidate.exp);
}
__name(isSessionPayload, "isSessionPayload");
function generateOpaqueToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 1) {
    throw new Error("longitud_token_invalida");
  }
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
__name(generateOpaqueToken, "generateOpaqueToken");
async function hashOpaqueToken(raw, secret) {
  return base64url(await hmac(raw, secret));
}
__name(hashOpaqueToken, "hashOpaqueToken");
async function verifyOpaqueToken(raw, expectedHash, secret) {
  try {
    const signature = fromBase64url(expectedHash);
    if (signature.length !== HMAC_LENGTH_BYTES) return false;
    const key = await importHmacKey(secret);
    return crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(raw)
    );
  } catch {
    return false;
  }
}
__name(verifyOpaqueToken, "verifyOpaqueToken");
function generateOtp() {
  const values = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(values);
    value = values[0];
  } while (value >= OTP_REJECTION_LIMIT);
  return String(value % OTP_SPACE).padStart(6, "0");
}
__name(generateOtp, "generateOtp");
async function signSession(payload, secret) {
  if (!isSessionPayload(payload)) throw new Error("sesion_invalida");
  const body2 = base64url(encoder.encode(JSON.stringify(payload)));
  return `${body2}.${base64url(await hmac(body2, secret))}`;
}
__name(signSession, "signSession");
async function verifySession(token, secret, now = Date.now()) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("sesion_invalida");
    const [body2, encodedSignature] = parts;
    const signature = fromBase64url(encodedSignature);
    if (signature.length !== HMAC_LENGTH_BYTES) {
      throw new Error("sesion_invalida");
    }
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(body2)
    );
    if (!valid) throw new Error("sesion_invalida");
    const parsed = JSON.parse(
      decoder.decode(fromBase64url(body2))
    );
    if (!isSessionPayload(parsed)) throw new Error("sesion_invalida");
    if (parsed.exp < now) throw new Error("sesion_vencida");
    return parsed;
  } catch (error2) {
    if (error2 instanceof Error && error2.message === "sesion_vencida") {
      throw error2;
    }
    throw new Error("sesion_invalida");
  }
}
__name(verifySession, "verifySession");
function detectImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  const pngSignature = [
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10
  ];
  if (bytes.length >= pngSignature.length && pngSignature.every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  return null;
}
__name(detectImage, "detectImage");

// src/registro-context.ts
var SUPABASE_URL = "https://jfkmiyvcdfbsbwchyvol.supabase.co";
function error(code) {
  return new Error(code);
}
__name(error, "error");
function isString(value) {
  return typeof value === "string" && value.length > 0;
}
__name(isString, "isString");
function isLinkRow(value) {
  if (!value || typeof value !== "object") return false;
  const row = value;
  return isString(row.id) && isString(row.origen_codigo) && (row.captador_id === null || isString(row.captador_id));
}
__name(isLinkRow, "isLinkRow");
function isOriginRow(value) {
  if (!value || typeof value !== "object") return false;
  const row = value;
  return isString(row.codigo) && isString(row.nombre);
}
__name(isOriginRow, "isOriginRow");
function isCaptadorRow(value) {
  if (!value || typeof value !== "object") return false;
  const row = value;
  return isString(row.id) && isString(row.nombre);
}
__name(isCaptadorRow, "isCaptadorRow");
function supabaseUrl(table, filters) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(filters)) {
    url.searchParams.set(name, value);
  }
  return url;
}
__name(supabaseUrl, "supabaseUrl");
async function fetchRows(url, env2, fetcher) {
  let response;
  try {
    response = await fetcher(
      new Request(url, {
        headers: {
          apikey: env2.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`
        }
      })
    );
  } catch {
    throw error("contexto_no_disponible");
  }
  if (!response.ok) throw error("contexto_no_disponible");
  try {
    const value = await response.json();
    if (!Array.isArray(value)) throw error("contexto_no_disponible");
    return value;
  } catch {
    throw error("contexto_no_disponible");
  }
}
__name(fetchRows, "fetchRows");
async function resolveRegistrationContext(token, env2, fetcher = fetch) {
  if (typeof token !== "string" || token.length < 32) {
    throw error("enlace_invalido");
  }
  let tokenHash;
  try {
    tokenHash = await hashOpaqueToken(token, env2.TOKEN_HASH_SECRET);
  } catch {
    throw error("contexto_no_disponible");
  }
  const linkRows = await fetchRows(
    supabaseUrl("enlaces_registro", {
      token_hash: `eq.${tokenHash}`,
      activo: "eq.true",
      revoked_at: "is.null",
      select: "id,origen_codigo,captador_id",
      limit: "1"
    }),
    env2,
    fetcher
  );
  if (linkRows.length !== 1 || !isLinkRow(linkRows[0])) {
    throw error("enlace_invalido");
  }
  const link = linkRows[0];
  const originRows = await fetchRows(
    supabaseUrl("origenes", {
      codigo: `eq.${link.origen_codigo}`,
      activo: "eq.true",
      select: "codigo,nombre",
      limit: "1"
    }),
    env2,
    fetcher
  );
  if (originRows.length !== 1 || !isOriginRow(originRows[0]) || originRows[0].codigo !== link.origen_codigo) {
    throw error("origen_invalido");
  }
  const origin = originRows[0];
  const captadorFilters = {
    origen_codigo: `eq.${link.origen_codigo}`,
    activo: "eq.true",
    select: "id,nombre",
    order: "nombre"
  };
  if (link.captador_id !== null) {
    captadorFilters.id = `eq.${link.captador_id}`;
  }
  const captadorRows = await fetchRows(
    supabaseUrl("captadores", captadorFilters),
    env2,
    fetcher
  );
  if (!captadorRows.every(isCaptadorRow) || link.captador_id !== null && (captadorRows.length !== 1 || captadorRows[0].id !== link.captador_id)) {
    throw error("captador_invalido");
  }
  return {
    enlaceId: link.id,
    tipo: link.captador_id === null ? "tienda" : "personal",
    origen: { codigo: origin.codigo, nombre: origin.nombre },
    captadores: captadorRows.map(({ id, nombre }) => ({ id, nombre }))
  };
}
__name(resolveRegistrationContext, "resolveRegistrationContext");
function assertCaptadorAllowed(context, captadorId) {
  if (!isString(captadorId) || !context.captadores.some((captador) => captador.id === captadorId)) {
    throw error("captador_invalido");
  }
}
__name(assertCaptadorAllowed, "assertCaptadorAllowed");

// src/reportes-formato.ts
var MAX_FILAS_REPORTE = 8;
function cuerpoPlantillaReporte(filas) {
  if (!Number.isInteger(filas) || filas < 1 || filas > MAX_FILAS_REPORTE) throw new Error("invalid_report_rows");
  return "Creditek informa el cierre operativo solicitado.\n\n{{1}}\n\n*Detalle por tienda y movimientos*\n\n" + Array.from({ length: filas }, (_, i) => `\u2022 {{${i + 2}}}`).join("\n\n") + "\n\nEste informe es para control de Gerencia. Los valores y las alertas corresponden al corte indicado.";
}
__name(cuerpoPlantillaReporte, "cuerpoPlantillaReporte");
function renderizarPaginaReporte(pagina) {
  return cuerpoPlantillaReporte(pagina.parametros.length - 1).replace(/\{\{(\d+)\}\}/g, (_, n) => pagina.parametros[Number(n) - 1]);
}
__name(renderizarPaginaReporte, "renderizarPaginaReporte");
function unirHastaOchoFilas(filasOriginales) {
  const filas = [...filasOriginales];
  while (filas.length > MAX_FILAS_REPORTE) {
    let indice = 0;
    let menorLongitud = Number.POSITIVE_INFINITY;
    for (let i = 0; i < filas.length - 1; i++) {
      const longitud = filas[i].length + filas[i + 1].length;
      if (longitud < menorLongitud) {
        menorLongitud = longitud;
        indice = i;
      }
    }
    filas.splice(indice, 2, `${filas[indice]} \xB7 ${filas[indice + 1]}`);
  }
  return filas;
}
__name(unirHastaOchoFilas, "unirHastaOchoFilas");
function paginarReporte(mensaje) {
  const lineas = mensaje.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const titulo = lineas.shift();
  if (!titulo || !lineas.length) throw new Error("empty_report");
  const filas = unirHastaOchoFilas(lineas.map((linea) => linea.replace(/^•\s*/, "")));
  const pagina = {
    plantilla: `reporte_cierre_ordenado_${filas.length}_v2`,
    parametros: [titulo, ...filas]
  };
  if (renderizarPaginaReporte(pagina).length <= 1024) return [pagina];
  const paginas = [];
  let bloque = [];
  const crear = /* @__PURE__ */ __name((detalle) => ({
    plantilla: `reporte_cierre_ordenado_${detalle.length}_v2`,
    parametros: [titulo, ...detalle]
  }), "crear");
  for (const linea of lineas) {
    if (renderizarPaginaReporte(crear([linea])).length > 1024) throw new Error("report_too_long_for_single_message");
    if (bloque.length && (bloque.length === MAX_FILAS_REPORTE || renderizarPaginaReporte(crear([...bloque, linea])).length > 1024)) {
      paginas.push(crear(bloque));
      bloque = [];
    }
    bloque.push(linea);
  }
  if (bloque.length) paginas.push(crear(bloque));
  return paginas;
}
__name(paginarReporte, "paginarReporte");

// src/reporte-deuda-compacto.ts
var limpio = /* @__PURE__ */ __name((s) => String(s || "").replace(/[\r\n\t*_~`]/g, " ").replace(/\s+/g, " ").trim(), "limpio");
var moneda = /* @__PURE__ */ __name((centavos2) => {
  const n = BigInt(centavos2), absoluto = n < 0n ? -n : n;
  return "$" + (n < 0n ? "-" : "") + new Intl.NumberFormat("es-CO").format(absoluto / 100n) + "," + String(absoluto % 100n).padStart(2, "0");
}, "moneda");
var hora = /* @__PURE__ */ __name((s) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s)), "hora");
function centavos(valor) {
  const n = Number(valor), c = Math.round(n * 100);
  if (typeof valor !== "number" || !Number.isFinite(n) || !Number.isSafeInteger(c) || Math.abs(n - c / 100) > 1e-7) throw new Error("deuda_importe_invalido");
  return c;
}
__name(centavos, "centavos");
function cuerpoPlantillaDeuda(tiendas) {
  if (!Number.isInteger(tiendas) || tiendas < 1 || tiendas > 20) throw new Error("deuda_cantidad_tiendas_invalida");
  return "*DEUDA CON CREDITEK*\nFecha y hora del corte: {{1}}\nEstado de confirmaciones recibidas: {{2}}\n\n*Detalle por tienda \xB7 Responsable \xB7 Saldo declarado \xB7 Hora*\n" + Array.from({ length: tiendas }, (_, i) => `\u2022 {{${i + 3}}}`).join("\n") + `

*Consolidado de saldos de las tiendas: {{${tiendas + 3}}}*
Valores en pesos colombianos, informados por los responsables de cada tienda al momento de confirmar.`;
}
__name(cuerpoPlantillaDeuda, "cuerpoPlantillaDeuda");
function renderizarReporteDeuda(pagina) {
  return cuerpoPlantillaDeuda(pagina.parametros.length - 3).replace(/\{\{(\d+)\}\}/g, (_, n) => pagina.parametros[Number(n) - 1]);
}
__name(renderizarReporteDeuda, "renderizarReporteDeuda");
function prepararReporteDeudaCompacto(corte) {
  const grupos = /* @__PURE__ */ new Map();
  for (const fila of corte.diarias) {
    const clave = fila.tienda_codigo || `sin-tienda:${fila.usuario_id}`;
    const grupo = grupos.get(clave) || [];
    grupo.push(fila);
    grupos.set(clave, grupo);
  }
  const filas = [];
  let total = 0, tiendasConSaldo = 0;
  for (const grupo of grupos.values()) {
    const saldos = /* @__PURE__ */ new Set();
    const administradores = grupo.map((f) => {
      const c = f.confirmacion;
      if (!c) return `${limpio(f.administrador)}: PENDIENTE`;
      const declarado = centavos(c.saldo_declarado);
      saldos.add(declarado);
      const detalle = `${limpio(f.administrador)}: ${moneda(declarado)} (${hora(c.confirmado_at)})`;
      if (centavos(c.diferencia) === 0) return detalle;
      return `${detalle} \xB7 DIFERENCIA ${moneda(centavos(c.diferencia))} \xB7 KORA ${moneda(centavos(c.saldo_sistema))} \xB7 ${c.revisado_at ? "Revisada" : "Por revisar"}`;
    });
    filas.push(`${limpio(grupo[0].tienda)} \xB7 ${administradores.join("; ")}${saldos.size > 1 ? " \xB7 Saldos distintos: por conciliar" : ""}`);
    if (saldos.size === 1) {
      total += saldos.values().next().value;
      tiendasConSaldo++;
      if (!Number.isSafeInteger(total)) throw new Error("deuda_total_fuera_de_rango");
    }
  }
  const confirmados = corte.diarias.filter((f) => f.confirmacion && centavos(f.confirmacion.diferencia) === 0).length;
  const diferencias = corte.diarias.filter((f) => f.confirmacion && centavos(f.confirmacion.diferencia) !== 0).length;
  const pendientes = corte.diarias.length - confirmados - diferencias;
  const resumen = `${confirmados} confirmadas sin diferencia \xB7 ${diferencias} con diferencia \xB7 ${pendientes} pendientes`;
  const tiendasTotal = `${grupos.size} ${grupos.size === 1 ? "tienda" : "tiendas"}`;
  const etiquetaTotal = !tiendasConSaldo ? "TOTAL PENDIENTE: sin saldos confirmados" : tiendasConSaldo < grupos.size ? `TOTAL PARCIAL (${tiendasConSaldo}/${grupos.size} tiendas): ${moneda(total)}` : `TOTAL (${tiendasTotal}): ${moneda(total)}`;
  const pagina = {
    plantilla: `reporte_deuda_compacto_${Math.max(1, filas.length)}_v1`,
    parametros: [
      `${corte.fecha.split("-").reverse().join("/")} \xB7 Corte 3:00 p. m. Colombia`,
      resumen,
      ...filas.length ? filas : ["Sin administradores activos en el corte."],
      etiquetaTotal
    ]
  };
  if (renderizarReporteDeuda(pagina).length > 1024) throw new Error("deuda_reporte_compacto_supera_1024");
  return pagina;
}
__name(prepararReporteDeudaCompacto, "prepararReporteDeudaCompacto");

// src/reporte-deuda.ts
var moneda2 = /* @__PURE__ */ __name((n) => "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(n)), "moneda");
var limpio2 = /* @__PURE__ */ __name((s) => String(s || "").replace(/[\r\n\t*_~`]/g, " ").replace(/\s+/g, " ").trim(), "limpio");
var hora2 = /* @__PURE__ */ __name((s) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s)), "hora");
function formatearConfirmacionesDeuda(corte) {
  const filas = corte.diarias;
  const confirmados = filas.filter((f) => f.confirmacion && Number(f.confirmacion.diferencia) === 0).length;
  const diferencias = filas.filter((f) => f.confirmacion && Number(f.confirmacion.diferencia) !== 0).length;
  const pendientes = filas.length - confirmados - diferencias;
  return [
    `DEUDA CON CREDITEK | ${corte.fecha} | Corte 3:00 p. m. Colombia`,
    `Administradores: ${confirmados} confirmaron sin diferencia | ${diferencias} reportaron diferencia | ${pendientes} pendientes`,
    ...filas.map((f) => {
      const nombre = `${limpio2(f.tienda)} / ${limpio2(f.administrador)}`;
      const c = f.confirmacion;
      if (!c) return `PENDIENTE | ${nombre}`;
      if (Number(c.diferencia) === 0) return `CONFIRMADO | ${nombre}: ${moneda2(c.saldo_declarado)} (${hora2(c.confirmado_at)})`;
      return `DIFERENCIA | ${nombre}: KORA ${moneda2(c.saldo_sistema)}, declara ${moneda2(c.saldo_declarado)}, diferencia ${moneda2(c.diferencia)} | ${c.revisado_at ? "Revisada" : "Por revisar"}`;
    }),
    "Saldos al confirmar; no se suman entre administradores de una misma tienda. Detalle: KORA > Administraci\xF3n > Confirmaciones de deuda."
  ].join("\n");
}
__name(formatearConfirmacionesDeuda, "formatearConfirmacionesDeuda");
async function ejecutarReporteDeuda(d, ahora = /* @__PURE__ */ new Date()) {
  const hh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", hourCycle: "h23" }).format(ahora));
  if (hh < 15 || hh >= 20) return;
  const r = await fetch(`${d.url}/rest/v1/rpc/reservar_reporte_deuda`, { method: "POST", headers: d.headers, body: "{}" });
  if (!r.ok) throw new Error(`deuda_reserva:${r.status}`);
  const reserva = await r.json();
  if (!reserva) return;
  const resultados = reserva.resultados || [];
  const guardar = /* @__PURE__ */ __name(async (data) => {
    const res = await fetch(`${d.url}/rest/v1/reportes_deuda_enviados?fecha=eq.${reserva.fecha}&token=eq.${reserva.token}&status=eq.sending`, {
      method: "PATCH",
      headers: { ...d.headers, Prefer: "return=representation" },
      body: JSON.stringify(data)
    });
    if (!res.ok || !(await res.json()).length) throw new Error("deuda_estado_no_guardado");
  }, "guardar");
  let envioEnCurso = false;
  try {
    const paginas = resultados.some((e) => !e.plantilla) ? paginarReporte(formatearConfirmacionesDeuda(reserva.contenido)) : [prepararReporteDeudaCompacto(reserva.contenido)];
    for (const dest of d.destinatarios) {
      for (const [indice, pagina] of paginas.entries()) {
        const anterior = resultados.find((e) => e.destinatario === dest.id && e.pagina === indice);
        if (anterior?.estado === "sent") continue;
        if (anterior) {
          envioEnCurso = true;
          throw new Error("deuda_entrega_incierta_requiere_revision");
        }
        const entrega = { destinatario: dest.id, pagina: indice, estado: "sending", plantilla: pagina.plantilla };
        resultados.push(entrega);
        await guardar({ resultados });
        envioEnCurso = true;
        let id;
        try {
          id = await d.enviar(dest.telefono, pagina);
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("meta_template_rejected:")) {
            resultados.pop();
            envioEnCurso = false;
          }
          throw e;
        }
        entrega.estado = "sent";
        entrega.meta_message_id = id;
        await guardar({ resultados });
        envioEnCurso = false;
      }
    }
    await guardar({ status: "sent", resultados, completed_at: (/* @__PURE__ */ new Date()).toISOString(), last_error: null });
  } catch (e) {
    await guardar({ status: envioEnCurso ? "uncertain" : "error", resultados, last_error: e instanceof Error ? e.message.slice(0, 240) : "error" });
    throw e;
  }
}
__name(ejecutarReporteDeuda, "ejecutarReporteDeuda");

// src/aliado-provision.ts
var DB = "https://jfkmiyvcdfbsbwchyvol.supabase.co/rest/v1/";
var PUBLIC_LINK = "https://registro.crediteksas.com/creditek/erp/registro?t=";
var MAX_BODY = 16384;
var normalized = /* @__PURE__ */ __name((s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase(), "normalized");
var reply = /* @__PURE__ */ __name((status, data) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } }), "reply");
var ProvisionError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  status;
  static {
    __name(this, "ProvisionError");
  }
};
function text(value, max) {
  if (typeof value !== "string") throw new ProvisionError(400, "datos_aliado_invalidos");
  const result4 = value.trim().replace(/\s+/g, " ");
  if (result4.length < 2 || result4.length > max || /[\x00-\x1f]/.test(result4)) throw new ProvisionError(400, "datos_aliado_invalidos");
  return result4;
}
__name(text, "text");
async function body(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new ProvisionError(413, "solicitud_demasiado_grande");
  const reader = request.body?.getReader();
  if (!reader) throw new ProvisionError(400, "datos_aliado_invalidos");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new ProvisionError(413, "solicitud_demasiado_grande");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
    return parsed;
  } catch {
    throw new ProvisionError(400, "datos_aliado_invalidos");
  }
}
__name(body, "body");
async function provisionAlly(request, env2, fetcher = fetch) {
  try {
    if (request.method !== "POST") return reply(405, { ok: false, error: "metodo_no_permitido" });
    if (request.headers.has("origin")) return reply(403, { ok: false, error: "origen_no_permitido" });
    if (!env2.ALLY_PROVISION_SECRET || !env2.ALLY_TOKEN_DERIVATION_SECRET || !env2.TOKEN_HASH_SECRET || !env2.SUPABASE_SERVICE_KEY) {
      throw new ProvisionError(503, "aprovisionamiento_no_disponible");
    }
    const received = request.headers.get("X-Creditek-Provision-Secret") || "";
    if (!received || received.length > 512) return reply(401, { ok: false, error: "unauthorized" });
    const [a, b] = await Promise.all([
      hashOpaqueToken(received, env2.ALLY_PROVISION_SECRET),
      hashOpaqueToken(env2.ALLY_PROVISION_SECRET, env2.ALLY_PROVISION_SECRET)
    ]);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (diff) return reply(401, { ok: false, error: "unauthorized" });
    const input = await body(request);
    text(input.radicado, 120);
    const nombre = text(input.nombre_comercial, 160);
    const ciudad = text(input.municipio, 120);
    text(input.responsable, 160);
    text(input.ejecutivo, 160);
    if (typeof input.telefono !== "string" || !/^\+?[0-9 ()-]{7,22}$/.test(input.telefono)) throw new ProvisionError(400, "datos_aliado_invalidos");
    if (!Array.isArray(input.vendedores) || input.vendedores.length < 1 || input.vendedores.length > 5) throw new ProvisionError(400, "vendedores_invalidos");
    const vendedores = input.vendedores.map((s) => {
      if (!s || typeof s !== "object") throw new ProvisionError(400, "vendedores_invalidos");
      return { nombre: text(`${text(s.nombres, 100)} ${text(s.apellidos, 100)}`, 160) };
    });
    const headers4 = { apikey: env2.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" };
    const origins = [];
    for (let offset = 0; ; offset += 1e3) {
      if (offset >= 1e5) throw new ProvisionError(503, "aprovisionamiento_no_disponible");
      const response = await fetcher(`${DB}origenes?select=codigo,nombre,ciudad,tipo,activo&order=codigo&limit=1000&offset=${offset}`, { headers: { ...headers4, Prefer: "count=exact" } });
      if (!response.ok) throw new ProvisionError(503, "aprovisionamiento_no_disponible");
      const page = await response.json();
      if (!Array.isArray(page)) throw new ProvisionError(503, "aprovisionamiento_no_disponible");
      origins.push(...page);
      const total = Number(response.headers.get("content-range")?.split("/")[1]);
      if (page.length < 1e3) {
        if (Number.isFinite(total) && total > origins.length) throw new ProvisionError(503, "aprovisionamiento_no_disponible");
        break;
      }
    }
    const matches = origins.filter((o) => normalized(o.nombre || "") === normalized(nombre) && normalized(o.ciudad || "") === normalized(ciudad));
    if (matches.length > 1 || matches.some((o) => o.tipo !== "aliado" || !o.activo)) throw new ProvisionError(409, "tienda_en_conflicto");
    const identity = `${normalized(nombre)}|${normalized(ciudad)}`;
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)))].map((v) => v.toString(16).padStart(2, "0")).join("");
    const slug = normalized(nombre).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "TIENDA";
    const codigo = matches[0]?.codigo || `AL-${slug}-${digest.slice(0, 12)}`.toUpperCase();
    let token = await hashOpaqueToken(`alta-aliado:v1:${codigo}`, env2.ALLY_TOKEN_DERIVATION_SECRET);
    if (input.enlace_existente !== void 0) {
      if (typeof input.enlace_existente !== "string" || !/^https:\/\/registro\.crediteksas\.com\/creditek\/erp\/registro\?t=[A-Za-z0-9_-]{43}$/.test(input.enlace_existente)) throw new ProvisionError(409, "enlace_incompatible");
      token = input.enlace_existente.slice(PUBLIC_LINK.length);
      let context;
      try {
        context = await resolveRegistrationContext(token, env2, fetcher);
      } catch {
        throw new ProvisionError(409, "enlace_incompatible");
      }
      if (!matches.length || context.tipo !== "tienda" || context.origen.codigo !== codigo || normalized(context.origen.nombre) !== normalized(nombre)) throw new ProvisionError(409, "enlace_incompatible");
    }
    const rpc = await fetcher(`${DB}rpc/aprovisionar_aliado_registro`, {
      method: "POST",
      headers: headers4,
      body: JSON.stringify({
        p_codigo: codigo,
        p_nombre: nombre,
        p_ciudad: ciudad,
        p_vendedores: vendedores,
        p_token_hash: await hashOpaqueToken(token, env2.TOKEN_HASH_SECRET),
        p_token_sufijo: token.slice(-6)
      })
    });
    if (!rpc.ok) {
      const error2 = await rpc.json().catch(() => ({}));
      if (/enlace_activo_incompatible|codigo_origen_en_conflicto|captadores_duplicados_normalizados/.test(error2.message || "")) throw new ProvisionError(409, "alta_en_conflicto");
      throw new ProvisionError(503, "aprovisionamiento_no_disponible");
    }
    const rows2 = await rpc.json();
    const result4 = rows2?.[0];
    if (rows2.length !== 1 || result4.codigo !== codigo || typeof result4.enlace_creado !== "boolean" || !Number.isInteger(result4.vendedores_procesados)) throw new ProvisionError(503, "aprovisionamiento_no_disponible");
    return reply(200, { ok: true, codigo, enlace: `${PUBLIC_LINK}${token}`, vendedores: result4.vendedores_procesados, enlace_creado: result4.enlace_creado });
  } catch (error2) {
    return reply(error2 instanceof ProvisionError ? error2.status : 503, { ok: false, error: error2 instanceof ProvisionError ? error2.message : "aprovisionamiento_no_disponible" });
  }
}
__name(provisionAlly, "provisionAlly");

// src/registro-otp.ts
var SUPABASE_URL2 = "https://jfkmiyvcdfbsbwchyvol.supabase.co";
var TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var TURNSTILE_HOSTNAME = "registro.crediteksas.com";
var TURNSTILE_ACTION = "registro-cliente";
var OTP_TTL_MS = 5 * 6e4;
var SESSION_TTL_MS = 30 * 6e4;
function result(status, error2) {
  return error2 ? { status, body: { ok: false, error: error2 } } : { status, body: { ok: true } };
}
__name(result, "result");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord, "isRecord");
function hasOwn(value, name) {
  return Object.prototype.hasOwnProperty.call(value, name);
}
__name(hasOwn, "hasOwn");
function isSecureOtpSendRequest(value) {
  return isRecord(value) && (hasOwn(value, "enlace_token") || hasOwn(value, "cedula") || hasOwn(value, "turnstile_token"));
}
__name(isSecureOtpSendRequest, "isSecureOtpSendRequest");
function isSecureOtpVerifyRequest(value) {
  return isRecord(value) && (hasOwn(value, "enlace_token") || hasOwn(value, "cedula"));
}
__name(isSecureOtpVerifyRequest, "isSecureOtpVerifyRequest");
function isCedula(value) {
  return typeof value === "string" && /^\d{6,12}$/.test(value);
}
__name(isCedula, "isCedula");
function isCelular(value) {
  return typeof value === "string" && /^3\d{9}$/.test(value);
}
__name(isCelular, "isCelular");
function isCodigo(value) {
  return typeof value === "string" && /^\d{6}$/.test(value);
}
__name(isCodigo, "isCodigo");
function isSecureSendInput(value) {
  if (!isRecord(value)) return false;
  return typeof value.enlace_token === "string" && value.enlace_token.length >= 32 && isCedula(value.cedula) && isCelular(value.celular) && typeof value.turnstile_token === "string" && value.turnstile_token.length > 0;
}
__name(isSecureSendInput, "isSecureSendInput");
function isSecureVerifyInput(value) {
  if (!isRecord(value)) return false;
  return typeof value.enlace_token === "string" && value.enlace_token.length >= 32 && isCedula(value.cedula) && isCelular(value.celular) && isCodigo(value.codigo);
}
__name(isSecureVerifyInput, "isSecureVerifyInput");
function isOtpRow(value) {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 && typeof value.codigo_hash === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.codigo_hash) && typeof value.intentos === "number" && Number.isInteger(value.intentos) && value.intentos >= 0 && value.intentos < 3;
}
__name(isOtpRow, "isOtpRow");
function isOtpReservationRow(value) {
  return isRecord(value) && typeof value.otp_id === "string" && value.otp_id.length > 0;
}
__name(isOtpReservationRow, "isOtpReservationRow");
function supabaseHeaders(env2, extra = {}) {
  return {
    apikey: env2.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
__name(supabaseHeaders, "supabaseHeaders");
function otpUrl(filters) {
  const url = new URL(`${SUPABASE_URL2}/rest/v1/otp_codigos`);
  if (filters) {
    for (const [name, value] of Object.entries(filters)) {
      url.searchParams.set(name, value);
    }
  }
  return url;
}
__name(otpUrl, "otpUrl");
async function resolveContext(token, env2, fetcher) {
  try {
    const context = await resolveRegistrationContext(token, env2, fetcher);
    return { ok: true, enlaceId: context.enlaceId };
  } catch (contextError) {
    const code = contextError instanceof Error ? contextError.message : "";
    if (code === "enlace_invalido" || code === "origen_invalido" || code === "captador_invalido") {
      return {
        ok: false,
        response: result(404, "Enlace inv\xE1lido o vencido")
      };
    }
    return {
      ok: false,
      response: result(503, "No se pudo validar el enlace")
    };
  }
}
__name(resolveContext, "resolveContext");
async function verifyTurnstile(token, remoteIp, secret, fetcher = fetch) {
  if (!token || !secret) return false;
  try {
    const response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: remoteIp,
        idempotency_key: crypto.randomUUID()
      })
    });
    if (!response.ok) return false;
    const value = await response.json();
    if (!isRecord(value)) return false;
    return value.success === true && value.hostname === TURNSTILE_HOSTNAME && value.action === TURNSTILE_ACTION;
  } catch {
    return false;
  }
}
__name(verifyTurnstile, "verifyTurnstile");
async function reserveOtp(input, enlaceId, codigoHash, expiraAt, env2, fetcher) {
  let response;
  try {
    response = await fetcher(
      `${SUPABASE_URL2}/rest/v1/rpc/reservar_otp_registro_seguro`,
      {
        method: "POST",
        headers: supabaseHeaders(env2),
        body: JSON.stringify({
          p_cedula: input.cedula,
          p_celular: input.celular,
          p_enlace_registro_id: enlaceId,
          p_codigo_hash: codigoHash,
          p_expira_at: expiraAt
        })
      }
    );
  } catch {
    return { ok: false, quota: false };
  }
  let responseText;
  try {
    responseText = await response.text();
  } catch {
    return { ok: false, quota: false };
  }
  if (!response.ok) {
    return {
      ok: false,
      quota: responseText.includes("otp_limite_celular") || responseText.includes("otp_limite_enlace")
    };
  }
  try {
    const value = JSON.parse(responseText);
    if (!Array.isArray(value) || value.length !== 1 || !isOtpReservationRow(value[0])) {
      return { ok: false, quota: false };
    }
    return { ok: true, otpId: value[0].otp_id };
  } catch {
    return { ok: false, quota: false };
  }
}
__name(reserveOtp, "reserveOtp");
function deliveryFilters(input, enlaceId, otpId) {
  return {
    id: `eq.${otpId}`,
    cedula: `eq.${input.cedula}`,
    celular: `eq.${input.celular}`,
    enlace_registro_id: `eq.${enlaceId}`,
    envio_aceptado_at: "is.null",
    envio_fallido_at: "is.null"
  };
}
__name(deliveryFilters, "deliveryFilters");
function isExactUpdatedRow(rows2, expectedId) {
  return rows2 !== null && rows2.length === 1 && isRecord(rows2[0]) && rows2[0].id === expectedId;
}
__name(isExactUpdatedRow, "isExactUpdatedRow");
async function closeDelivery(filters, field, timestamp, expectedId, env2, fetcher) {
  const rows2 = await patchOtp(
    filters,
    { [field]: timestamp },
    env2,
    fetcher
  );
  return isExactUpdatedRow(rows2, expectedId);
}
__name(closeDelivery, "closeDelivery");
async function sendSecureOtp(input, remoteIp, env2, dependencies) {
  if (!isSecureSendInput(input)) {
    return result(400, "Datos inv\xE1lidos");
  }
  const turnstileValid = await verifyTurnstile(
    input.turnstile_token,
    remoteIp,
    env2.TURNSTILE_SECRET_KEY,
    dependencies.fetcher
  );
  if (!turnstileValid) {
    return result(400, "Verificaci\xF3n anti-robot inv\xE1lida");
  }
  const resolved = await resolveContext(
    input.enlace_token,
    env2,
    dependencies.fetcher
  );
  if (!resolved.ok) return resolved.response;
  const now = (dependencies.now ?? Date.now)();
  const codigo = (dependencies.generateCode ?? generateOtp)();
  let codigoHash;
  try {
    codigoHash = await hashOpaqueToken(
      `otp:${codigo}`,
      env2.TOKEN_HASH_SECRET
    );
  } catch {
    return result(503, "No se pudo generar el c\xF3digo");
  }
  const reservation = await reserveOtp(
    input,
    resolved.enlaceId,
    codigoHash,
    new Date(now + OTP_TTL_MS).toISOString(),
    env2,
    dependencies.fetcher
  );
  if (!reservation.ok) {
    return reservation.quota ? result(429, "L\xEDmite de c\xF3digos alcanzado") : result(503, "No se pudo reservar el c\xF3digo");
  }
  let sent = false;
  try {
    sent = await dependencies.sendOtp(input.celular, codigo);
  } catch {
    sent = false;
  }
  const timestamp = new Date(now).toISOString();
  const filters = deliveryFilters(
    input,
    resolved.enlaceId,
    reservation.otpId
  );
  if (!sent) {
    const failureRecorded = await closeDelivery(
      filters,
      "envio_fallido_at",
      timestamp,
      reservation.otpId,
      env2,
      dependencies.fetcher
    );
    return failureRecorded ? result(502, "No se pudo enviar el c\xF3digo por WhatsApp") : result(503, "No se pudo cerrar el env\xEDo fallido");
  }
  const deliveryRecorded = await closeDelivery(
    filters,
    "envio_aceptado_at",
    timestamp,
    reservation.otpId,
    env2,
    dependencies.fetcher
  );
  if (!deliveryRecorded) {
    return result(503, "No se pudo confirmar la entrega del c\xF3digo");
  }
  return result(200);
}
__name(sendSecureOtp, "sendSecureOtp");
async function readOtpRows(response) {
  if (!response.ok) return null;
  try {
    const value = await response.json();
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
__name(readOtpRows, "readOtpRows");
function boundOtpFilters(input, enlaceId, nowIso) {
  return {
    cedula: `eq.${input.cedula}`,
    celular: `eq.${input.celular}`,
    enlace_registro_id: `eq.${enlaceId}`,
    verificado: "eq.false",
    registro_consumido_at: "is.null",
    envio_aceptado_at: "not.is.null",
    envio_fallido_at: "is.null",
    expira_at: `gt.${nowIso}`
  };
}
__name(boundOtpFilters, "boundOtpFilters");
async function patchOtp(filters, body2, env2, fetcher) {
  let response;
  try {
    response = await fetcher(otpUrl({ ...filters, select: "id" }), {
      method: "PATCH",
      headers: supabaseHeaders(env2, { Prefer: "return=representation" }),
      body: JSON.stringify(body2)
    });
  } catch {
    return null;
  }
  return readOtpRows(response);
}
__name(patchOtp, "patchOtp");
async function verifySecureOtp(input, env2, dependencies) {
  if (!isSecureVerifyInput(input)) {
    return result(400, "Datos inv\xE1lidos");
  }
  const resolved = await resolveContext(
    input.enlace_token,
    env2,
    dependencies.fetcher
  );
  if (!resolved.ok) return resolved.response;
  const now = (dependencies.now ?? Date.now)();
  const nowIso = new Date(now).toISOString();
  const bindingFilters = boundOtpFilters(input, resolved.enlaceId, nowIso);
  let selectResponse;
  try {
    selectResponse = await dependencies.fetcher(
      otpUrl({
        ...bindingFilters,
        intentos: "lt.3",
        select: "id,codigo_hash,intentos",
        order: "created_at.desc",
        limit: "1"
      }),
      { headers: supabaseHeaders(env2) }
    );
  } catch {
    return result(503, "No se pudo verificar el c\xF3digo");
  }
  const rows2 = await readOtpRows(selectResponse);
  if (rows2 === null) {
    return result(503, "No se pudo verificar el c\xF3digo");
  }
  if (rows2.length !== 1 || !isOtpRow(rows2[0])) {
    return result(400, "C\xF3digo vencido, consumido o no encontrado");
  }
  const otp = rows2[0];
  const exactFilters = {
    id: `eq.${otp.id}`,
    ...bindingFilters,
    intentos: `eq.${otp.intentos}`,
    codigo_hash: `eq.${otp.codigo_hash}`
  };
  const codeMatches = await verifyOpaqueToken(
    `otp:${input.codigo}`,
    otp.codigo_hash,
    env2.TOKEN_HASH_SECRET
  );
  if (!codeMatches) {
    const incremented = await patchOtp(
      exactFilters,
      { intentos: otp.intentos + 1 },
      env2,
      dependencies.fetcher
    );
    if (incremented === null) {
      return result(503, "No se pudo verificar el c\xF3digo");
    }
    return result(400, "C\xF3digo incorrecto");
  }
  const updated = await patchOtp(
    exactFilters,
    { verificado: true },
    env2,
    dependencies.fetcher
  );
  if (updated === null || updated.length !== 1 || !isRecord(updated[0]) || updated[0].id !== otp.id) {
    return result(400, "C\xF3digo vencido, consumido o ya verificado");
  }
  let registroSession;
  try {
    registroSession = await signSession(
      {
        purpose: "registro",
        cedula: input.cedula,
        celular: input.celular,
        enlaceId: resolved.enlaceId,
        otpId: otp.id,
        exp: now + SESSION_TTL_MS
      },
      env2.REGISTRATION_SIGNING_SECRET
    );
  } catch {
    return result(503, "No se pudo crear la sesi\xF3n de registro");
  }
  return {
    status: 200,
    body: { ok: true, registro_session: registroSession }
  };
}
__name(verifySecureOtp, "verifySecureOtp");

// src/registro-submit.ts
var SUPABASE_URL3 = "https://jfkmiyvcdfbsbwchyvol.supabase.co";
var SESSION_TTL_MS2 = 30 * 6e4;
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function result2(status, error2) {
  return error2 ? { status, body: { ok: false, error: error2 } } : { status, body: { ok: true } };
}
__name(result2, "result");
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord2, "isRecord");
function hasOwn2(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}
__name(hasOwn2, "hasOwn");
function isReference(value) {
  if (!isRecord2(value)) return false;
  return typeof value.nombre === "string" && value.nombre.trim().length >= 2 && typeof value.telefono === "string" && /^3\d{9}$/.test(value.telefono) && (value.parentesco === void 0 || value.parentesco === null || typeof value.parentesco === "string");
}
__name(isReference, "isReference");
function isSecureRegistrationRequest(value) {
  return isRecord2(value) && (hasOwn2(value, "enlace_token") || hasOwn2(value, "captador_id") || hasOwn2(value, "registro_session"));
}
__name(isSecureRegistrationRequest, "isSecureRegistrationRequest");
function isInput(value) {
  if (!isRecord2(value)) return false;
  return typeof value.enlace_token === "string" && value.enlace_token.length >= 32 && typeof value.captador_id === "string" && value.captador_id.length > 0 && typeof value.registro_session === "string" && value.registro_session.length > 0 && typeof value.nombre_completo === "string" && value.nombre_completo.trim().length >= 3 && (value.email === void 0 || value.email === null || typeof value.email === "string") && typeof value.ciudad === "string" && value.ciudad.trim().length >= 2 && typeof value.direccion === "string" && value.direccion.trim().length >= 3 && typeof value.producto_interes === "string" && (value.financiera === void 0 || value.financiera === null || typeof value.financiera === "string") && Array.isArray(value.referencias) && value.referencias.every(isReference) && value.autorizacion_datos === true && typeof value.autorizacion_comercial === "boolean" && typeof value.autorizacion_version === "string" && value.autorizacion_version.length > 0;
}
__name(isInput, "isInput");
function isRegistrationRow(value) {
  if (!isRecord2(value)) return false;
  return typeof value.cliente_id === "string" && UUID_PATTERN.test(value.cliente_id) && typeof value.solicitud_id === "string" && UUID_PATTERN.test(value.solicitud_id);
}
__name(isRegistrationRow, "isRegistrationRow");
function headers(env2) {
  return {
    apikey: env2.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json"
  };
}
__name(headers, "headers");
async function submitSecureRegistration(input, env2, dependencies) {
  if (!isInput(input)) return result2(400, "Datos inv\xE1lidos");
  const now = (dependencies.now ?? Date.now)();
  let session;
  try {
    session = await verifySession(input.registro_session, env2.REGISTRATION_SIGNING_SECRET, now);
  } catch {
    return result2(400, "Sesi\xF3n de registro inv\xE1lida o vencida");
  }
  if (session.purpose !== "registro" || !session.otpId) {
    return result2(400, "Sesi\xF3n de registro inv\xE1lida o vencida");
  }
  let context;
  try {
    context = await resolveRegistrationContext(input.enlace_token, env2, dependencies.fetcher);
    assertCaptadorAllowed(context, input.captador_id);
  } catch (error2) {
    const code = error2 instanceof Error ? error2.message : "";
    return code === "enlace_invalido" || code === "origen_invalido" || code === "captador_invalido" ? result2(400, "Enlace o vendedor inv\xE1lido") : result2(503, "No se pudo validar el enlace");
  }
  if (context.enlaceId !== session.enlaceId) {
    return result2(400, "Sesi\xF3n de registro inv\xE1lida o vencida");
  }
  let response;
  try {
    response = await dependencies.fetcher(
      `${SUPABASE_URL3}/rest/v1/rpc/crear_registro_cliente_seguro`,
      {
        method: "POST",
        headers: headers(env2),
        body: JSON.stringify({
          p_cedula: session.cedula,
          p_nombre_completo: input.nombre_completo,
          p_celular: session.celular,
          p_email: input.email ?? null,
          p_ciudad: input.ciudad,
          p_direccion: input.direccion,
          p_origen_codigo: context.origen.codigo,
          p_captador_id: input.captador_id,
          p_enlace_registro_id: context.enlaceId,
          p_otp_id: session.otpId,
          p_producto_interes: input.producto_interes,
          p_financiera: input.financiera ?? null,
          p_referencias: input.referencias.slice(0, 2),
          p_autorizacion_comercial: input.autorizacion_comercial,
          p_autorizacion_version: input.autorizacion_version
        })
      }
    );
  } catch {
    return result2(503, "No se pudo guardar el registro");
  }
  if (!response.ok) return result2(response.status >= 400 && response.status < 500 ? 400 : 503, "No se pudo guardar el registro");
  let rows2;
  try {
    rows2 = await response.json();
  } catch {
    return result2(503, "No se pudo guardar el registro");
  }
  if (!Array.isArray(rows2) || rows2.length !== 1 || !isRegistrationRow(rows2[0])) {
    return result2(503, "No se pudo guardar el registro");
  }
  try {
    const usageResponse = await dependencies.fetcher(
      `${SUPABASE_URL3}/rest/v1/enlaces_registro?id=eq.${encodeURIComponent(context.enlaceId)}`,
      {
        method: "PATCH",
        headers: { ...headers(env2), Prefer: "return=minimal" },
        body: JSON.stringify({ ultima_utilizacion_at: new Date(now).toISOString() })
      }
    );
    if (!usageResponse.ok) console.error("[REGISTRO-SEGURO] No se pudo marcar el uso del enlace");
  } catch {
    console.error("[REGISTRO-SEGURO] No se pudo marcar el uso del enlace");
  }
  try {
    const documentosSession = await signSession({
      purpose: "documentos",
      cedula: session.cedula,
      celular: session.celular,
      enlaceId: context.enlaceId,
      clienteId: rows2[0].cliente_id,
      solicitudId: rows2[0].solicitud_id,
      exp: now + SESSION_TTL_MS2
    }, env2.REGISTRATION_SIGNING_SECRET);
    return { status: 200, body: { ok: true, documentos_session: documentosSession } };
  } catch {
    return result2(503, "No se pudo crear la sesi\xF3n de documentos");
  }
}
__name(submitSecureRegistration, "submitSecureRegistration");

// src/registro-documents.ts
var SUPABASE_URL4 = "https://jfkmiyvcdfbsbwchyvol.supabase.co";
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var TYPE_COLUMNS = {
  frente: "foto_cedula_frente_path",
  reverso: "foto_cedula_reverso_path",
  selfie: "selfie_cedula_path"
};
function result3(status, error2) {
  return error2 ? { status, body: { ok: false, error: error2 } } : { status, body: { ok: true } };
}
__name(result3, "result");
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord3, "isRecord");
function isInput2(value) {
  return isRecord3(value) && typeof value.documentos_session === "string" && typeof value.tipo === "string" && Object.prototype.hasOwnProperty.call(TYPE_COLUMNS, value.tipo) && (value.mime === "image/jpeg" || value.mime === "image/png") && typeof value.foto_base64 === "string";
}
__name(isInput2, "isInput");
function headers2(env2, extra = {}) {
  return { apikey: env2.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`, ...extra };
}
__name(headers2, "headers");
function decodedSize(value) {
  return Math.floor(value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
}
__name(decodedSize, "decodedSize");
function decodeBase64(value) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0 || decodedSize(value) > MAX_IMAGE_BYTES) return null;
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
__name(decodeBase64, "decodeBase64");
async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function uploadSecureDocument(input, env2, dependencies) {
  if (!isInput2(input)) return result3(400, "Datos inv\xE1lidos");
  let session;
  try {
    session = await verifySession(input.documentos_session, env2.REGISTRATION_SIGNING_SECRET, (dependencies.now ?? Date.now)());
  } catch {
    return result3(400, "Sesi\xF3n de documentos inv\xE1lida o vencida");
  }
  if (session.purpose !== "documentos" || !session.clienteId || !session.solicitudId) return result3(400, "Sesi\xF3n de documentos inv\xE1lida o vencida");
  const bytes = decodeBase64(input.foto_base64);
  if (bytes === null) return decodedSize(input.foto_base64) > MAX_IMAGE_BYTES ? result3(413, "La imagen supera el tama\xF1o permitido") : result3(400, "Imagen inv\xE1lida");
  const detected = detectImage(bytes);
  if (!detected || detected !== input.mime) return result3(400, "Imagen inv\xE1lida");
  const extension = detected === "image/png" ? "png" : "jpg";
  const randomUuid = dependencies.randomUuid ? dependencies.randomUuid() : crypto.randomUUID();
  const path = `${session.clienteId}/${session.solicitudId}/${input.tipo}-${randomUuid}.${extension}`;
  let uploaded;
  try {
    uploaded = await dependencies.fetcher(`${SUPABASE_URL4}/storage/v1/object/cedulas/${path}`, { method: "POST", headers: headers2(env2, { "Content-Type": detected }), body: bytes });
  } catch {
    return result3(502, "No se pudo subir la imagen");
  }
  if (!uploaded.ok) return result3(502, "No se pudo subir la imagen");
  let metadata;
  try {
    metadata = await dependencies.fetcher(`${SUPABASE_URL4}/rest/v1/documentos_solicitud?on_conflict=solicitud_id%2Ctipo`, { method: "POST", headers: headers2(env2, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ solicitud_id: session.solicitudId, cliente_id: session.clienteId, tipo: input.tipo, storage_path: path, mime: detected, tamano_bytes: bytes.length, sha256: await sha256(bytes) }) });
  } catch {
    return result3(502, "No se pudo vincular la imagen");
  }
  if (!metadata.ok) return result3(502, "No se pudo vincular la imagen");
  let legacy;
  try {
    legacy = await dependencies.fetcher(`${SUPABASE_URL4}/rest/v1/clientes?id=eq.${encodeURIComponent(session.clienteId)}&select=id`, { method: "PATCH", headers: headers2(env2, { "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify({ [TYPE_COLUMNS[input.tipo]]: path }) });
  } catch {
    return result3(502, "No se pudo vincular la imagen");
  }
  if (!legacy.ok) return result3(502, "No se pudo vincular la imagen");
  try {
    const rows2 = await legacy.json();
    if (!Array.isArray(rows2) || rows2.length !== 1 || !isRecord3(rows2[0]) || rows2[0].id !== session.clienteId) {
      return result3(502, "No se pudo vincular la imagen");
    }
  } catch {
    return result3(502, "No se pudo vincular la imagen");
  }
  return result3(200);
}
__name(uploadSecureDocument, "uploadSecureDocument");

// src/admin-enlaces.ts
var SUPABASE_URL5 = "https://jfkmiyvcdfbsbwchyvol.supabase.co";
var REGISTRATION_URL = "https://registro.crediteksas.com/creditek/erp/registro";
var UUID_PATTERN2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(body2, status = 200) {
  return Response.json(body2, {
    status,
    headers: { "cache-control": "no-store" }
  });
}
__name(json, "json");
function headers3(env2, prefer) {
  return {
    apikey: env2.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...prefer ? { Prefer: prefer } : {}
  };
}
__name(headers3, "headers");
async function rows(path, env2, fetcher) {
  const response = await fetcher(`${SUPABASE_URL5}/rest/v1/${path}`, { headers: headers3(env2) });
  if (!response.ok) throw new Error("supabase_read_failed");
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error("supabase_read_failed");
  return value;
}
__name(rows, "rows");
async function audit(env2, fetcher, action, id, detail) {
  const response = await fetcher(`${SUPABASE_URL5}/rest/v1/audit_log`, {
    method: "POST",
    headers: headers3(env2, "return=minimal"),
    body: JSON.stringify({
      usuario: "aura.owner",
      accion: action,
      tabla: "enlaces_registro",
      registro_id: id,
      detalle: detail
    })
  });
  if (!response.ok) console.error("[ADMIN-ENLACES] No se pudo registrar auditor\xEDa");
}
__name(audit, "audit");
async function countRegistrations(originCode, env2, fetcher) {
  const path = `solicitudes?select=id,enlaces_registro!inner(origen_codigo)&enlaces_registro.origen_codigo=eq.${encodeURIComponent(originCode)}`;
  const response = await fetcher(`${SUPABASE_URL5}/rest/v1/${path}`, {
    method: "HEAD",
    headers: headers3(env2, "count=exact")
  });
  if (!response.ok) throw new Error("supabase_count_failed");
  const count = Number((response.headers.get("Content-Range") || "").split("/")[1]);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("supabase_count_failed");
  return count;
}
__name(countRegistrations, "countRegistrations");
async function listOriginLinks(env2, fetcher = fetch) {
  try {
    const [origins, links, executives] = await Promise.all([
      rows("origenes?activo=eq.true&tipo=in.(propia,aliado)&select=codigo,nombre,tipo,ciudad,ejecutivo_id&order=nombre", env2, fetcher),
      rows("enlaces_registro?activo=eq.true&revoked_at=is.null&select=id,origen_codigo,token_sufijo,created_at,ultima_utilizacion_at", env2, fetcher),
      rows("ejecutivos?activo=eq.true&select=id,nombre", env2, fetcher)
    ]);
    const executiveNames = new Map(executives.map((row) => [row.id, row.nombre]));
    const activeLinks = new Map(links.map((row) => [row.origen_codigo, row]));
    const counts = await Promise.all(origins.map((origin) => countRegistrations(origin.codigo, env2, fetcher)));
    return json(origins.map((origin, index) => {
      const link = activeLinks.get(origin.codigo);
      return {
        codigo: origin.codigo,
        nombre: origin.nombre,
        tipo: origin.tipo,
        ciudad: origin.ciudad,
        ejecutivo_responsable: origin.ejecutivo_id ? executiveNames.get(origin.ejecutivo_id) ?? null : null,
        enlace_activo: link ? {
          id: link.id,
          token_sufijo: link.token_sufijo,
          created_at: link.created_at,
          ultima_utilizacion_at: link.ultima_utilizacion_at
        } : null,
        total_registros: counts[index]
      };
    }));
  } catch {
    return json({ ok: false, error: "No se pudieron cargar los enlaces" }, 503);
  }
}
__name(listOriginLinks, "listOriginLinks");
async function createOriginLink(request, env2, fetcher = fetch) {
  const body2 = await request.json().catch(() => null);
  const originCode = typeof body2?.origen_codigo === "string" ? body2.origen_codigo.trim() : "";
  const captadorId = body2?.captador_id;
  if (!originCode || captadorId !== void 0 && captadorId !== null && (typeof captadorId !== "string" || !UUID_PATTERN2.test(captadorId))) {
    return json({ ok: false, error: "Datos inv\xE1lidos" }, 400);
  }
  try {
    const [origin, active] = await Promise.all([
      rows(`origenes?codigo=eq.${encodeURIComponent(originCode)}&activo=eq.true&select=codigo,nombre,tipo,ciudad,ejecutivo_id&limit=1`, env2, fetcher),
      rows(`enlaces_registro?origen_codigo=eq.${encodeURIComponent(originCode)}&activo=eq.true&revoked_at=is.null&select=id,origen_codigo,token_sufijo,created_at,ultima_utilizacion_at&limit=1`, env2, fetcher)
    ]);
    if (origin.length !== 1) return json({ ok: false, error: "Origen inv\xE1lido o inactivo" }, 404);
    if (active.length) return json({ ok: false, error: "ya existe un enlace activo, rev\xF3calo primero" }, 409);
    const token = generateOpaqueToken(32);
    const tokenHash = await hashOpaqueToken(token, env2.TOKEN_HASH_SECRET);
    const response = await fetcher(`${SUPABASE_URL5}/rest/v1/enlaces_registro`, {
      method: "POST",
      headers: headers3(env2, "return=representation"),
      body: JSON.stringify({
        token_hash: tokenHash,
        token_sufijo: token.slice(-8),
        origen_codigo: originCode,
        captador_id: captadorId ?? null
      })
    });
    if (!response.ok) {
      if (response.status === 409) return json({ ok: false, error: "ya existe un enlace activo, rev\xF3calo primero" }, 409);
      throw new Error("supabase_insert_failed");
    }
    const inserted = await response.json();
    const id = typeof inserted?.[0]?.id === "string" ? inserted[0].id : "";
    if (!UUID_PATTERN2.test(id)) throw new Error("supabase_insert_failed");
    await audit(env2, fetcher, "enlace_registro_creado", id, { origen_codigo: originCode, captador_id: captadorId ?? null });
    return json({
      enlace_id: id,
      token_completo: token,
      url_completa: `${REGISTRATION_URL}?t=${encodeURIComponent(token)}`
    }, 201);
  } catch {
    return json({ ok: false, error: "No se pudo crear el enlace" }, 503);
  }
}
__name(createOriginLink, "createOriginLink");
async function revokeOriginLink(id, env2, fetcher = fetch) {
  if (!UUID_PATTERN2.test(id)) return json({ ok: false, error: "Identificador inv\xE1lido" }, 400);
  try {
    const revokedAt = (/* @__PURE__ */ new Date()).toISOString();
    const response = await fetcher(`${SUPABASE_URL5}/rest/v1/enlaces_registro?id=eq.${encodeURIComponent(id)}&activo=eq.true&revoked_at=is.null`, {
      method: "PATCH",
      headers: headers3(env2, "return=representation"),
      body: JSON.stringify({ activo: false, revoked_at: revokedAt })
    });
    if (!response.ok) throw new Error("supabase_update_failed");
    const updated = await response.json();
    if (updated.length !== 1 || updated[0].id !== id) return json({ ok: false, error: "Enlace activo no encontrado" }, 404);
    await audit(env2, fetcher, "enlace_registro_revocado", id, { origen_codigo: updated[0].origen_codigo ?? null });
    return json({ ok: true, enlace_id: id, revoked_at: revokedAt });
  } catch {
    return json({ ok: false, error: "No se pudo revocar el enlace" }, 503);
  }
}
__name(revokeOriginLink, "revokeOriginLink");

// src/index.ts
var SUPABASE_URL6 = "https://jfkmiyvcdfbsbwchyvol.supabase.co";
var OTP_TEMPLATE_NAME = "codigo_verificacion_creditek";
var OTP_TEMPLATE_LANG = "es_CO";
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json2, "json");
function corsHeaders(request, env2) {
  const headers4 = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  });
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && env2.ALLOWED_ORIGIN && requestOrigin === env2.ALLOWED_ORIGIN) {
    headers4.set("Access-Control-Allow-Origin", requestOrigin);
  }
  return headers4;
}
__name(corsHeaders, "corsHeaders");
function withCors(response, request, env2) {
  const headers4 = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request, env2)) {
    headers4.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers4
  });
}
__name(withCors, "withCors");
function sbHeaders(env2, extra = {}) {
  return {
    apikey: env2.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
__name(sbHeaders, "sbHeaders");
function celularValido(v) {
  return typeof v === "string" && /^3\d{9}$/.test(v);
}
__name(celularValido, "celularValido");
function cedulaValida(v) {
  return typeof v === "string" && /^\d{6,12}$/.test(v);
}
__name(cedulaValida, "cedulaValida");
function codigoValido(v) {
  return typeof v === "string" && /^\d{6}$/.test(v);
}
__name(codigoValido, "codigoValido");
async function tokenValido(token, esperado) {
  if (!token || !esperado) return false;
  const encoder2 = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder2.encode("creditek-clientes-token-compare"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder2.encode(token)),
    crypto.subtle.sign("HMAC", key, encoder2.encode(esperado))
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
__name(tokenValido, "tokenValido");
async function adminAuthorized(request, env2) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return tokenValido(token, env2.ADMIN_ENLACES_TOKEN);
}
__name(adminAuthorized, "adminAuthorized");
var index_default = {
  async fetch(request, env2) {
    if (new URL(request.url).pathname === "/api/interno/aliados/aprovisionar") {
      return provisionAlly(request, env2);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env2)
      });
    }
    const url = new URL(request.url);
    const respond = /* @__PURE__ */ __name((response) => withCors(response, request, env2), "respond");
    try {
      if (url.pathname === "/api/registro/contexto" && request.method === "GET") {
        return respond(await handleRegistroContexto(url, env2));
      }
      if (url.pathname === "/api/registro/config" && request.method === "GET") {
        return respond(json2({
          turnstile_site_key: env2.TURNSTILE_SITE_KEY ?? ""
        }));
      }
      if (url.pathname === "/api/origenes" && request.method === "GET") {
        return respond(await handleOrigenes(env2));
      }
      if (url.pathname === "/api/admin/origenes-enlaces" && request.method === "GET") {
        if (!await adminAuthorized(request, env2)) return respond(json2({ ok: false, error: "unauthorized" }, 401));
        return respond(await listOriginLinks(env2));
      }
      if (url.pathname === "/api/admin/enlaces" && request.method === "POST") {
        if (!await adminAuthorized(request, env2)) return respond(json2({ ok: false, error: "unauthorized" }, 401));
        return respond(await createOriginLink(request, env2));
      }
      const revokeMatch = url.pathname.match(/^\/api\/admin\/enlaces\/([0-9a-f-]+)\/revocar$/i);
      if (revokeMatch && request.method === "POST") {
        if (!await adminAuthorized(request, env2)) return respond(json2({ ok: false, error: "unauthorized" }, 401));
        return respond(await revokeOriginLink(revokeMatch[1], env2));
      }
      if (url.pathname === "/api/otp/enviar" && request.method === "POST") {
        return respond(await handleOtpEnviarRoute(request, env2));
      }
      if (url.pathname === "/api/otp/verificar" && request.method === "POST") {
        return respond(await handleOtpVerificarRoute(request, env2));
      }
      if (url.pathname === "/api/registro" && request.method === "POST") {
        return respond(await handleRegistroRoute(request, env2));
      }
      if (url.pathname === "/api/documentos" && request.method === "POST") {
        return respond(await handleDocumentosRoute(request, env2));
      }
      if (url.pathname === "/api/subir-cedula" && request.method === "POST") {
        return respond(await handleSubirCedula(request, env2));
      }
      return respond(json2({ ok: false, error: "Ruta no encontrada" }, 404));
    } catch (e) {
      console.error("[creditek-clientes] Error no controlado:", e);
      return respond(json2({ ok: false, error: "Error interno" }, 500));
    }
  },
  // FEATURE 22-jul-2026 · Reportes diarios por WhatsApp.
  // Ver bloque grande al final del archivo para toda la lógica.
  async scheduled(event, env2, ctx) {
    ctx.waitUntil(ejecutarReporteDeuda({
      url: SUPABASE_URL6,
      headers: sbHeaders(env2),
      destinatarios: DESTINATARIOS_REPORTES,
      enviar: /* @__PURE__ */ __name((telefono, pagina) => enviarWhatsAppPlantillaReporte(telefono, pagina.plantilla, "", env2, pagina.parametros), "enviar")
    }).catch((e) => {
      console.error("[REPORTE-DEUDA] Fall\xF3 el env\xEDo; revisar reportes_deuda_enviados:", e);
    }));
    ctx.waitUntil(ejecutarReportesDiarios(env2).catch((e) => {
      console.error("[REPORTES-DIARIOS] excepci\xF3n no atrapada:", e);
    }));
  }
};
async function handleRegistroContexto(url, env2) {
  try {
    const context = await resolveRegistrationContext(
      url.searchParams.get("t") ?? "",
      env2
    );
    return json2({ ok: true, contexto: context });
  } catch (contextError) {
    const code = contextError instanceof Error ? contextError.message : "";
    if (code === "enlace_invalido" || code === "origen_invalido" || code === "captador_invalido") {
      return json2(
        { ok: false, error: "Enlace inv\xE1lido o vencido" },
        404
      );
    }
    console.error("[REGISTRO-CONTEXTO] Servicio no disponible");
    return json2(
      { ok: false, error: "No se pudo cargar el enlace de registro" },
      503
    );
  }
}
__name(handleRegistroContexto, "handleRegistroContexto");
async function requestJson(request) {
  return request.clone().json().catch(() => null);
}
__name(requestJson, "requestJson");
async function handleOtpEnviarRoute(request, env2) {
  const body2 = await requestJson(request);
  if (isSecureOtpSendRequest(body2)) {
    const secureResult = await sendSecureOtp(
      body2,
      request.headers.get("CF-Connecting-IP"),
      env2,
      {
        fetcher: fetch,
        sendOtp: /* @__PURE__ */ __name((celular, codigo) => enviarPlantillaOtp(celular, codigo, env2), "sendOtp")
      }
    );
    return json2(secureResult.body, secureResult.status);
  }
  if (env2.ALLOW_LEGACY_REGISTRATION_LINKS === "true") {
    return handleOtpEnviar(request, env2);
  }
  return json2({ ok: false, error: "Flujo de registro legado deshabilitado" }, 410);
}
__name(handleOtpEnviarRoute, "handleOtpEnviarRoute");
async function handleOtpVerificarRoute(request, env2) {
  const body2 = await requestJson(request);
  if (isSecureOtpVerifyRequest(body2)) {
    const secureResult = await verifySecureOtp(body2, env2, {
      fetcher: fetch
    });
    return json2(secureResult.body, secureResult.status);
  }
  if (env2.ALLOW_LEGACY_REGISTRATION_LINKS === "true") {
    return handleOtpVerificar(request, env2);
  }
  return json2({ ok: false, error: "Flujo de registro legado deshabilitado" }, 410);
}
__name(handleOtpVerificarRoute, "handleOtpVerificarRoute");
async function handleRegistroRoute(request, env2) {
  const body2 = await requestJson(request);
  if (isSecureRegistrationRequest(body2)) {
    const secureResult = await submitSecureRegistration(body2, env2, { fetcher: fetch });
    return json2(secureResult.body, secureResult.status);
  }
  if (env2.ALLOW_LEGACY_REGISTRATION_LINKS === "true") {
    return handleRegistro(request, env2);
  }
  return json2({ ok: false, error: "Flujo de registro legado deshabilitado" }, 410);
}
__name(handleRegistroRoute, "handleRegistroRoute");
async function handleDocumentosRoute(request, env2) {
  const secureResult = await uploadSecureDocument(await requestJson(request), env2, {
    fetcher: fetch
  });
  return json2(secureResult.body, secureResult.status);
}
__name(handleDocumentosRoute, "handleDocumentosRoute");
async function handleOrigenes(env2) {
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/origenes?activo=eq.true&select=codigo,nombre,tipo&order=codigo`,
    { headers: sbHeaders(env2) }
  );
  if (!r.ok) {
    console.error("[ORIGENES] Error:", await r.text());
    return json2({ ok: false, error: "No se pudieron cargar los or\xEDgenes" }, 500);
  }
  const data = await r.json();
  return json2({ ok: true, origenes: data });
}
__name(handleOrigenes, "handleOrigenes");
async function handleOtpEnviar(request, env2) {
  const body2 = await request.json().catch(() => null);
  const celular = body2?.celular;
  if (!celularValido(celular)) return json2({ ok: false, error: "Celular inv\xE1lido" }, 400);
  const haceUnaHora = new Date(Date.now() - 36e5).toISOString();
  const rCount = await fetch(
    `${SUPABASE_URL6}/rest/v1/otp_codigos?celular=eq.${encodeURIComponent(celular)}&created_at=gte.${haceUnaHora}&select=id`,
    { headers: sbHeaders(env2, { Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" }) }
  );
  const total = parseInt(rCount.headers.get("Content-Range")?.split("/")[1] ?? "0", 10);
  if (total >= 3) {
    return json2({ ok: false, error: "Ya se enviaron 3 c\xF3digos a este n\xFAmero en la \xFAltima hora. Intenta m\xE1s tarde." }, 429);
  }
  const codigo = String(Math.floor(1e5 + Math.random() * 9e5));
  const expiraAt = new Date(Date.now() + 5 * 6e4).toISOString();
  const rInsert = await fetch(`${SUPABASE_URL6}/rest/v1/otp_codigos`, {
    method: "POST",
    headers: sbHeaders(env2, { Prefer: "return=minimal" }),
    body: JSON.stringify({ celular, codigo, expira_at: expiraAt })
  });
  if (!rInsert.ok) {
    console.error("[OTP-ENVIAR] Error guardando c\xF3digo:", await rInsert.text());
    return json2({ ok: false, error: "No se pudo generar el c\xF3digo" }, 500);
  }
  const enviado = await enviarPlantillaOtp(celular, codigo, env2);
  if (!enviado) return json2({ ok: false, error: "No se pudo enviar el c\xF3digo por WhatsApp" }, 500);
  return json2({ ok: true });
}
__name(handleOtpEnviar, "handleOtpEnviar");
async function enviarPlantillaOtp(celular, codigo, env2) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${env2.PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env2.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `57${celular}`,
      type: "template",
      template: {
        name: OTP_TEMPLATE_NAME,
        language: { code: OTP_TEMPLATE_LANG },
        components: [
          { type: "body", parameters: [{ type: "text", text: codigo }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] }
        ]
      }
    })
  });
  if (!res.ok) {
    console.error("[OTP-WA] Error enviando plantilla:", await res.text());
    return false;
  }
  return true;
}
__name(enviarPlantillaOtp, "enviarPlantillaOtp");
async function handleOtpVerificar(request, env2) {
  const body2 = await request.json().catch(() => null);
  const celular = body2?.celular;
  const codigo = body2?.codigo;
  if (!celularValido(celular) || !codigoValido(codigo)) {
    return json2({ ok: false, error: "Datos inv\xE1lidos" }, 400);
  }
  const ahora = (/* @__PURE__ */ new Date()).toISOString();
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/otp_codigos?celular=eq.${encodeURIComponent(celular)}&verificado=eq.false&expira_at=gte.${ahora}&order=created_at.desc&limit=1`,
    { headers: sbHeaders(env2) }
  );
  const filas = await r.json().catch(() => []) || [];
  const fila = filas[0];
  if (!fila) return json2({ ok: false, error: "C\xF3digo vencido o no encontrado. Solicita uno nuevo." }, 400);
  if ((fila.intentos ?? 0) >= 3) {
    return json2({ ok: false, error: "Demasiados intentos con este c\xF3digo. Solicita uno nuevo." }, 429);
  }
  if (fila.codigo !== codigo) {
    await fetch(`${SUPABASE_URL6}/rest/v1/otp_codigos?id=eq.${fila.id}`, {
      method: "PATCH",
      headers: sbHeaders(env2, { Prefer: "return=minimal" }),
      body: JSON.stringify({ intentos: (fila.intentos ?? 0) + 1 })
    });
    return json2({ ok: false, error: "C\xF3digo incorrecto" }, 400);
  }
  await fetch(`${SUPABASE_URL6}/rest/v1/otp_codigos?id=eq.${fila.id}`, {
    method: "PATCH",
    headers: sbHeaders(env2, { Prefer: "return=minimal" }),
    body: JSON.stringify({ verificado: true })
  });
  return json2({ ok: true });
}
__name(handleOtpVerificar, "handleOtpVerificar");
async function handleRegistro(request, env2) {
  const body2 = await request.json().catch(() => null);
  if (!body2) return json2({ ok: false, error: "JSON inv\xE1lido" }, 400);
  const {
    cedula,
    nombre_completo,
    celular,
    email,
    ciudad,
    direccion,
    origen_codigo,
    vendedor_nombre,
    producto_interes,
    financiera,
    referencias,
    autorizacion_datos,
    autorizacion_comercial,
    autorizacion_version,
    otp_ok
  } = body2;
  if (!cedulaValida(cedula)) return json2({ ok: false, error: "C\xE9dula inv\xE1lida (6 a 12 d\xEDgitos)" }, 400);
  if (!celularValido(celular)) return json2({ ok: false, error: "Celular inv\xE1lido (formato 3XXXXXXXXX)" }, 400);
  if (!nombre_completo || String(nombre_completo).trim().length < 3) return json2({ ok: false, error: "Nombre completo requerido" }, 400);
  if (!ciudad || String(ciudad).trim().length < 2) return json2({ ok: false, error: "Ciudad requerida" }, 400);
  if (!vendedor_nombre || String(vendedor_nombre).trim().length < 2) return json2({ ok: false, error: "Vendedor requerido" }, 400);
  if (!origen_codigo) return json2({ ok: false, error: "Origen requerido" }, 400);
  if (autorizacion_datos !== true) return json2({ ok: false, error: "La autorizaci\xF3n de datos es obligatoria" }, 400);
  if (!otp_ok) return json2({ ok: false, error: "Celular no verificado" }, 400);
  const rOtp = await fetch(
    `${SUPABASE_URL6}/rest/v1/otp_codigos?celular=eq.${encodeURIComponent(celular)}&verificado=eq.true&order=created_at.desc&limit=1`,
    { headers: sbHeaders(env2) }
  );
  const otpFilas = await rOtp.json().catch(() => []) || [];
  const otpFila = otpFilas[0];
  if (!otpFila) return json2({ ok: false, error: "Celular no verificado" }, 400);
  const verificadoHaceMs = Date.now() - new Date(otpFila.created_at).getTime();
  if (verificadoHaceMs > 30 * 6e4) {
    return json2({ ok: false, error: "La verificaci\xF3n del celular venci\xF3, vuelve a verificar el c\xF3digo" }, 400);
  }
  const clientePayload = {
    cedula,
    nombre_completo: String(nombre_completo).trim(),
    celular,
    celular_verificado: true,
    ciudad: String(ciudad).trim(),
    origen_codigo,
    fuente: "formulario",
    autorizacion_datos: true,
    autorizacion_comercial: !!autorizacion_comercial,
    autorizacion_timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    autorizacion_version: autorizacion_version || null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (email) clientePayload.email = email;
  if (direccion) clientePayload.direccion = direccion;
  const rUpsert = await fetch(`${SUPABASE_URL6}/rest/v1/clientes?on_conflict=cedula`, {
    method: "POST",
    headers: sbHeaders(env2, { Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(clientePayload)
  });
  if (!rUpsert.ok) {
    console.error("[REGISTRO] Error upsert cliente:", await rUpsert.text());
    return json2({ ok: false, error: "No se pudo guardar el cliente" }, 500);
  }
  const clienteRows = await rUpsert.json();
  const cliente = clienteRows[0];
  if (!cliente) return json2({ ok: false, error: "No se pudo guardar el cliente" }, 500);
  const refsPayload = (Array.isArray(referencias) ? referencias : []).slice(0, 2).filter((r) => r && r.nombre && r.telefono).map((r) => ({
    cliente_id: cliente.id,
    nombre: String(r.nombre).trim(),
    telefono: String(r.telefono).trim(),
    parentesco: r.parentesco || null
  }));
  if (refsPayload.length) {
    const rRefs = await fetch(`${SUPABASE_URL6}/rest/v1/referencias`, {
      method: "POST",
      headers: sbHeaders(env2, { Prefer: "return=minimal" }),
      body: JSON.stringify(refsPayload)
    });
    if (!rRefs.ok) console.error("[REGISTRO] Error guardando referencias:", await rRefs.text());
  }
  const solicitudPayload = {
    cliente_id: cliente.id,
    origen_codigo,
    vendedor_nombre: String(vendedor_nombre).trim(),
    producto_interes: producto_interes ? String(producto_interes).trim() : null,
    financiera: financiera || null,
    estado_validacion: "pendiente"
  };
  const rSol = await fetch(`${SUPABASE_URL6}/rest/v1/solicitudes`, {
    method: "POST",
    headers: sbHeaders(env2, { Prefer: "return=representation" }),
    body: JSON.stringify(solicitudPayload)
  });
  if (!rSol.ok) {
    console.error("[REGISTRO] Error creando solicitud:", await rSol.text());
    return json2({ ok: false, error: "No se pudo crear la solicitud" }, 500);
  }
  const solRows = await rSol.json();
  const solicitud = solRows[0];
  fetch(`${SUPABASE_URL6}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders(env2, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      usuario: String(vendedor_nombre).trim(),
      accion: "registro_formulario",
      tabla: "solicitudes",
      registro_id: solicitud?.id ?? null,
      detalle: { origen_codigo, cedula }
    })
  }).catch((e) => console.error("[REGISTRO] Error audit_log (no bloqueante):", e));
  return json2({ ok: true, solicitud_id: solicitud?.id });
}
__name(handleRegistro, "handleRegistro");
var COLUMNA_POR_TIPO = {
  frente: "foto_cedula_frente_path",
  reverso: "foto_cedula_reverso_path",
  selfie: "selfie_cedula_path"
};
async function handleSubirCedula(request, env2) {
  if (env2.ALLOW_LEGACY_REGISTRATION_LINKS !== "true") {
    return json2({ ok: false, error: "Flujo de registro legado deshabilitado" }, 410);
  }
  const body2 = await request.json().catch(() => null);
  const cedula = body2?.cedula;
  const tipo = body2?.tipo;
  const fotoBase64 = body2?.foto_base64;
  const mime = body2?.mime || "image/jpeg";
  const columna = COLUMNA_POR_TIPO[tipo];
  if (!cedulaValida(cedula) || !columna || typeof fotoBase64 !== "string" || !fotoBase64) {
    return json2({ ok: false, error: "Datos inv\xE1lidos (tipo debe ser frente, reverso o selfie)" }, 400);
  }
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = `${cedula}_${tipo}_${Date.now()}.${ext}`;
  let binario;
  try {
    binario = base64ToUint8Array(fotoBase64);
  } catch {
    return json2({ ok: false, error: "Imagen inv\xE1lida" }, 400);
  }
  const rUpload = await fetch(`${SUPABASE_URL6}/storage/v1/object/cedulas/${path}`, {
    method: "POST",
    headers: {
      apikey: env2.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
      "Content-Type": mime
    },
    body: binario
  });
  if (!rUpload.ok) {
    console.error(`[SUBIR-CEDULA] Error subiendo ${tipo} a Storage:`, await rUpload.text());
    return json2({ ok: false, error: "No se pudo subir la foto" }, 500);
  }
  const rUpdate = await fetch(`${SUPABASE_URL6}/rest/v1/clientes?cedula=eq.${encodeURIComponent(cedula)}`, {
    method: "PATCH",
    headers: sbHeaders(env2, { Prefer: "return=minimal" }),
    body: JSON.stringify({ [columna]: path })
  });
  if (!rUpdate.ok) {
    console.error(`[SUBIR-CEDULA] Error vinculando ${tipo} al cliente:`, await rUpdate.text());
    return json2({ ok: false, error: "Foto subida pero no se pudo vincular al cliente" }, 500);
  }
  return json2({ ok: true });
}
__name(handleSubirCedula, "handleSubirCedula");
function base64ToUint8Array(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}
__name(base64ToUint8Array, "base64ToUint8Array");
var DESTINATARIOS_REPORTES = [
  { id: "oscar", telefono: "573002024083" },
  { id: "mayte", telefono: "573005516040" }
];
var TZ_COL = "America/Bogota";
function fechaColombiaHoy() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_COL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
}
__name(fechaColombiaHoy, "fechaColombiaHoy");
function horaColombiaAhora() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_COL,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(/* @__PURE__ */ new Date());
  const hh = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const hhNorm = hh === 24 ? 0 : hh;
  const hhmm = `${String(hhNorm).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  return { hh: hhNorm, mm, hhmm };
}
__name(horaColombiaAhora, "horaColombiaAhora");
function fechaFormateadaLarga(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ_COL,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(dt);
}
__name(fechaFormateadaLarga, "fechaFormateadaLarga");
async function esDomingoOFestivo(fechaISO, env2) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 17));
  if (dt.getUTCDay() === 0) return true;
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/festivos_colombia?fecha=eq.${fechaISO}&select=fecha&limit=1`,
    { headers: sbHeaders(env2) }
  );
  if (!r.ok) {
    console.error("[REPORTES-DIARIOS] Error consultando festivos:", await r.text());
    return false;
  }
  const arr = await r.json();
  return arr.length > 0;
}
__name(esDomingoOFestivo, "esDomingoOFestivo");
async function obtenerTiendasPropiasActivas(env2) {
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/origenes?tipo=eq.propia&activo=eq.true&select=codigo,nombre&order=codigo`,
    { headers: sbHeaders(env2) }
  );
  if (!r.ok) throw new Error("No se pudieron cargar las tiendas: " + await r.text());
  return await r.json();
}
__name(obtenerTiendasPropiasActivas, "obtenerTiendasPropiasActivas");
async function obtenerGastosHoy(fechaISO, env2) {
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/gastos?fecha=eq.${fechaISO}&estado=eq.aprobado&select=monto,descripcion,tienda_codigo,concepto:concepto_id(nombre),origen:tienda_codigo(nombre)&order=tienda_codigo`,
    { headers: sbHeaders(env2) }
  );
  if (!r.ok) throw new Error("No se pudieron cargar gastos: " + await r.text());
  return await r.json();
}
__name(obtenerGastosHoy, "obtenerGastosHoy");
async function obtenerVentasHoy(fechaISO, env2) {
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/ventas?fecha=eq.${fechaISO}&anulada=not.is.true&select=total,tienda_codigo,origen:tienda_codigo(nombre)`,
    { headers: sbHeaders(env2) }
  );
  if (!r.ok) throw new Error("No se pudieron cargar ventas: " + await r.text());
  return await r.json();
}
__name(obtenerVentasHoy, "obtenerVentasHoy");
async function obtenerCorteOperativo(fechaISO, env2) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/rpc/generar_cortes_caja`, {
    method: "POST",
    headers: sbHeaders(env2),
    body: JSON.stringify({ p_fecha: fechaISO })
  });
  if (!r.ok) throw new Error(`corte_operativo_failed:${r.status}`);
  const cortes = await r.json();
  if (!Array.isArray(cortes) || cortes.some((c) => !c || typeof c.tienda_codigo !== "string" || !Number.isFinite(Number(c.efectivo_esperado)))) {
    throw new Error("corte_operativo_invalid_response");
  }
  return cortes;
}
__name(obtenerCorteOperativo, "obtenerCorteOperativo");
function esHoraCorteAutomatico(hh, mm, limiteHora) {
  return hh * 60 + mm === limiteHora * 60 - 5;
}
__name(esHoraCorteAutomatico, "esHoraCorteAutomatico");
function formatearCorteCaja(cortes, fechaLarga) {
  const contadas = cortes.filter((c) => c.efectivo_contado != null);
  const pendientes = cortes.filter((c) => c.efectivo_contado == null);
  const totalContado = contadas.reduce((total, c) => total + Number(c.efectivo_contado), 0);
  return [
    `CAJA \xB7 CORTE OPERATIVO \xB7 ${fechaLarga} \xB7 TOTAL DISPONIBLE CONTADO ${fmtCOP(totalContado)} (${contadas.length} ${contadas.length === 1 ? "arqueada" : "arqueadas"}; pendientes excluidas)`,
    ...contadas.map((c) => `${c.origen?.nombre || c.tienda_codigo}: contado ${fmtCOP(Number(c.efectivo_contado))} \xB7 esperado ${fmtCOP(Number(c.efectivo_esperado))} \xB7 diferencia ${fmtDiferenciaCOP(Number(c.diferencia))}`),
    ...pendientes.length ? [
      `CAJAS SIN ARQUEO (${pendientes.length}) \xB7 ${pendientes.map((c) => `${c.origen?.nombre || c.tienda_codigo}: esperado ${fmtCOP(Number(c.efectivo_esperado))}, Sin contar`).join(" / ")}`
    ] : []
  ].join("\n");
}
__name(formatearCorteCaja, "formatearCorteCaja");
async function reservarEnvioDelDia(fechaISO, completo, tiendasFaltantes, env2) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/reportes_diarios_enviados`, {
    method: "POST",
    headers: sbHeaders(env2, { Prefer: "return=representation" }),
    body: JSON.stringify({
      fecha: fechaISO,
      completo,
      tiendas_faltantes: tiendasFaltantes,
      status: "sending",
      attempts: 1,
      sending_started_at: (/* @__PURE__ */ new Date()).toISOString(),
      resultados: [],
      last_error: null
    })
  });
  if (r.status === 201) {
    const [creado] = await r.json();
    return creado || null;
  }
  if (r.status !== 409) {
    console.error("[REPORTES-DIARIOS] Error inesperado reservando:", r.status, await r.text());
    return null;
  }
  const existenteResponse = await fetch(
    `${SUPABASE_URL6}/rest/v1/reportes_diarios_enviados?fecha=eq.${fechaISO}&select=fecha,status,attempts,resultados,sending_started_at&limit=1`,
    { headers: sbHeaders(env2) }
  );
  if (!existenteResponse.ok) return null;
  const [existente] = await existenteResponse.json();
  if (!existente || existente.status === "sent") return null;
  const sendingVigente = existente.status === "sending" && !!existente.sending_started_at && Date.now() - new Date(existente.sending_started_at).getTime() < 10 * 60 * 1e3;
  if (sendingVigente) return null;
  const attempts = Number(existente.attempts || 0) + 1;
  if (attempts > 3) {
    console.error("[REPORTES-DIARIOS] l\xEDmite de reintentos alcanzado para", fechaISO);
    return null;
  }
  const reabrir = await fetch(
    `${SUPABASE_URL6}/rest/v1/reportes_diarios_enviados?fecha=eq.${fechaISO}&status=eq.${existente.status || "error"}&attempts=eq.${Number(existente.attempts || 0)}`,
    {
      method: "PATCH",
      headers: sbHeaders(env2, { Prefer: "return=representation" }),
      body: JSON.stringify({
        status: "sending",
        attempts,
        sending_started_at: (/* @__PURE__ */ new Date()).toISOString(),
        last_error: null
      })
    }
  );
  if (!reabrir.ok) return null;
  const [reabierto] = await reabrir.json();
  return reabierto || null;
}
__name(reservarEnvioDelDia, "reservarEnvioDelDia");
async function yaSeEnvioHoy(fechaISO, env2) {
  const r = await fetch(
    `${SUPABASE_URL6}/rest/v1/reportes_diarios_enviados?fecha=eq.${fechaISO}&status=eq.sent&select=fecha&limit=1`,
    { headers: sbHeaders(env2) }
  );
  if (!r.ok) return false;
  const arr = await r.json();
  return arr.length > 0;
}
__name(yaSeEnvioHoy, "yaSeEnvioHoy");
function fmtCOP(n) {
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n || 0);
}
__name(fmtCOP, "fmtCOP");
function fmtDiferenciaCOP(n) {
  if (!n) return fmtCOP(0);
  return `${n > 0 ? "+" : "-"}${fmtCOP(Math.abs(n))}`;
}
__name(fmtDiferenciaCOP, "fmtDiferenciaCOP");
function encabezadoEstado(completo, nombresFaltantes, hhmm) {
  return completo ? "\u2705 CIERRES DE CAJA \u2022 Todas las tiendas completaron" : [
    `\u26A0\uFE0F CIERRES DE CAJA \u2022 ${nombresFaltantes.length} ${nombresFaltantes.length === 1 ? "tienda pendiente" : "tiendas pendientes"} al corte de las ${hhmm}`,
    `PENDIENTES \u2022 ${nombresFaltantes.join(", ")}`
  ].join("\n");
}
__name(encabezadoEstado, "encabezadoEstado");
function formatearGastos(gastos, fechaLarga, encabezado) {
  const ordenados = [...gastos].sort((a, b) => String(a.origen?.nombre || a.tienda_codigo).localeCompare(String(b.origen?.nombre || b.tienda_codigo), "es"));
  const total = gastos.reduce((s, g) => s + Number(g.monto || 0), 0);
  const porTienda = /* @__PURE__ */ new Map();
  for (const gasto of ordenados) {
    const tienda = String(gasto.origen?.nombre || gasto.tienda_codigo || "Sin tienda");
    if (!porTienda.has(tienda)) porTienda.set(tienda, []);
    porTienda.get(tienda).push(gasto);
  }
  const detalle = Array.from(porTienda.entries()).map(([tienda, movimientos]) => {
    const subtotal = movimientos.reduce((s, g) => s + Number(g.monto || 0), 0);
    return `${tienda.toUpperCase()} \u2022 ${movimientos.length} ${movimientos.length === 1 ? "gasto" : "gastos"} \u2022 ${fmtCOP(subtotal)}`;
  });
  return [
    `\u{1F9FE} CIERRE DE GASTOS \u2022 ${fechaLarga}`,
    `RESUMEN \u2022 ${gastos.length} ${gastos.length === 1 ? "movimiento" : "movimientos"} \u2022 TOTAL ${fmtCOP(total)}`,
    encabezado,
    ...detalle.length ? detalle : ["SIN GASTOS \u2022 No hay movimientos aprobados para este d\xEDa"]
  ].join("\n");
}
__name(formatearGastos, "formatearGastos");
function formatearVentas(ventas, fechaLarga) {
  const porTienda = {};
  for (const v of ventas) {
    const cod = v.tienda_codigo;
    if (!porTienda[cod]) porTienda[cod] = { nombre: v.origen?.nombre || cod, num: 0, total: 0 };
    porTienda[cod].num += 1;
    porTienda[cod].total += Number(v.total || 0);
  }
  const filas = Object.values(porTienda).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((t) => `${t.nombre.toUpperCase()} \u2022 ${t.num} ${t.num === 1 ? "venta" : "ventas"} \u2022 ${fmtCOP(t.total)}`);
  const totalOps = ventas.length;
  const totalVal = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  return [
    `\u{1F4B0} CIERRE DE VENTAS \u2022 ${fechaLarga}`,
    `RESUMEN \u2022 ${totalOps} ${totalOps === 1 ? "venta" : "ventas"} \u2022 TOTAL ${fmtCOP(totalVal)}`,
    ...filas.length ? filas : ["SIN VENTAS \u2022 No hay operaciones registradas para este d\xEDa"]
  ].join("\n");
}
__name(formatearVentas, "formatearVentas");
function formatearCaja(cierres, fechaLarga) {
  const lineas = [...cierres].sort((a, b) => String(a.origen?.nombre || a.tienda_codigo).localeCompare(String(b.origen?.nombre || b.tienda_codigo), "es")).map((c) => {
    const nombre = c.origen?.nombre || c.tienda_codigo;
    const efectivo = fmtCOP(Number(c.efectivo_contado || 0));
    const esperado = fmtCOP(Number(c.efectivo_esperado || 0));
    const diff = Number(c.diferencia || 0);
    const marca = diff === 0 ? "\u2705 CUADRA" : `\u26A0\uFE0F DIFERENCIA ${fmtDiferenciaCOP(diff)}`;
    return `${String(nombre).toUpperCase()} \u2022 Contado ${efectivo} \u2022 Esperado ${esperado} \u2022 ${marca}`;
  });
  const total = cierres.reduce((s, c) => s + Number(c.efectivo_contado || 0), 0);
  const diferencias = cierres.filter((c) => Number(c.diferencia || 0) !== 0).length;
  const conciliacion = !cierres.length ? "SIN CAJAS RECIBIDAS" : diferencias ? `${diferencias} con diferencia` : `LAS ${cierres.length} RECIBIDAS CUADRAN`;
  return [
    `\u{1F4B5} CIERRE DE CAJA \u2022 ${fechaLarga}`,
    `RESUMEN \u2022 ${cierres.length} ${cierres.length === 1 ? "caja recibida" : "cajas recibidas"} \u2022 EFECTIVO ${fmtCOP(total)} \u2022 ${conciliacion}`,
    ...lineas.length ? lineas : ["SIN CIERRES \u2022 Ninguna tienda ha cerrado caja"]
  ].join("\n");
}
__name(formatearCaja, "formatearCaja");
var REPORT_TEMPLATE_LANGUAGE = "es_CO";
var REPORT_TEMPLATES = Object.freeze({
  gastos: "reporte_gastos_diario",
  ventas: "reporte_ventas_diario",
  caja: "reporte_caja_diario"
});
function normalizarParametroPlantilla(resumen) {
  return resumen.replace(/\s*[\r\n\t]+\s*/g, " \xB7 ").replace(/\s{2,}/g, " ").trim().slice(0, 1024);
}
__name(normalizarParametroPlantilla, "normalizarParametroPlantilla");
async function enviarWhatsAppPlantillaReporte(telefono, plantilla, resumen, env2, parametros) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env2.PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env2.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono.replace("+", ""),
      type: "template",
      template: {
        name: plantilla,
        language: { code: REPORT_TEMPLATE_LANGUAGE },
        components: [{
          type: "body",
          parameters: (parametros || [normalizarParametroPlantilla(resumen)]).map((text2) => ({ type: "text", text: text2 }))
        }]
      }
    })
  });
  if (!r.ok) {
    const detail = await r.text();
    console.error(`[REPORTES-WA] Meta rechaz\xF3 ${plantilla} para ${telefono}:`, r.status, detail);
    throw new Error(`meta_template_rejected:${plantilla}:${r.status}`);
  }
  const payload = await r.json();
  const messageId = payload.messages?.[0]?.id;
  if (!messageId) throw new Error(`meta_message_id_missing:${plantilla}`);
  return messageId;
}
__name(enviarWhatsAppPlantillaReporte, "enviarWhatsAppPlantillaReporte");
async function guardarEstadoReporte(fechaISO, data, env2) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/reportes_diarios_enviados?fecha=eq.${fechaISO}`, {
    method: "PATCH",
    headers: sbHeaders(env2, { Prefer: "return=minimal" }),
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`report_status_persist_failed:${r.status}`);
}
__name(guardarEstadoReporte, "guardarEstadoReporte");
async function enviarReporteATodos(fechaISO, plantilla, mensaje, resultados, env2) {
  const planConfirmado = resultados.find((r) => r.plantilla.startsWith(`${plantilla}:ordenado:`) && r.paginas_reporte)?.paginas_reporte;
  const paginas = env2.REPORTES_FORMATO_ORDENADO === "true" ? planConfirmado || paginarReporte(mensaje) : null;
  for (const dest of DESTINATARIOS_REPORTES) {
    if (resultados.some((r) => r.plantilla === plantilla && r.destinatario === dest.id)) continue;
    if (paginas) {
      for (const [indice, pagina] of paginas.entries()) {
        const clave = `${plantilla}:ordenado:${indice + 1}`;
        if (resultados.some((r) => r.plantilla === clave && r.destinatario === dest.id)) continue;
        const messageId2 = await enviarWhatsAppPlantillaReporte(dest.telefono, pagina.plantilla, "", env2, pagina.parametros);
        resultados.push({
          plantilla: clave,
          destinatario: dest.id,
          meta_message_id: messageId2,
          confirmado_at: (/* @__PURE__ */ new Date()).toISOString(),
          ...indice === 0 ? { paginas_reporte: paginas } : {}
        });
        await guardarEstadoReporte(fechaISO, { resultados }, env2);
      }
      continue;
    }
    if (resultados.some((r) => r.plantilla.startsWith(`${plantilla}:ordenado:`) && r.destinatario === dest.id)) {
      throw new Error("report_format_changed_during_delivery");
    }
    const messageId = await enviarWhatsAppPlantillaReporte(dest.telefono, plantilla, mensaje, env2);
    resultados.push({
      plantilla,
      destinatario: dest.id,
      meta_message_id: messageId,
      confirmado_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    await guardarEstadoReporte(fechaISO, { resultados }, env2);
  }
}
__name(enviarReporteATodos, "enviarReporteATodos");
async function ejecutarReportesDiarios(env2) {
  const hoy = fechaColombiaHoy();
  const { hh, mm, hhmm } = horaColombiaAhora();
  const minutosDelDia = hh * 60 + mm;
  if (minutosDelDia < 11 * 60 || minutosDelDia > 19 * 60 + 55) return;
  const domingoOFestivo = await esDomingoOFestivo(hoy, env2);
  const limiteHora = domingoOFestivo ? 15 : 19;
  if (esHoraCorteAutomatico(hh, mm, limiteHora)) {
    try {
      await obtenerCorteOperativo(hoy, env2);
    } catch (e) {
      console.error("[REPORTES-DIARIOS] no se pudo generar el corte autom\xE1tico previo:", e);
    }
    return;
  }
  if (hh < limiteHora) return;
  if (await yaSeEnvioHoy(hoy, env2)) return;
  let tiendas;
  let cerradas;
  try {
    tiendas = await obtenerTiendasPropiasActivas(env2);
    cerradas = [];
  } catch (e) {
    console.error("[REPORTES-DIARIOS] error en carga inicial:", e);
    return;
  }
  const codigos = tiendas.map((t) => t.codigo);
  const faltantes = codigos.filter((c) => !cerradas.includes(c));
  const nombresFaltantes = tiendas.filter((t) => faltantes.includes(t.codigo)).map((t) => t.nombre);
  const debeMandarCompleto = faltantes.length === 0;
  const reservado = await reservarEnvioDelDia(hoy, debeMandarCompleto, faltantes, env2);
  if (!reservado) return;
  const resultados = Array.isArray(reservado.resultados) ? reservado.resultados : [];
  const fechaLarga = fechaFormateadaLarga(hoy);
  const encabezado = `Corte ${hhmm} Colombia \xB7 Gastos aprobados. Arqueo pendiente no impide informar ventas.`;
  console.log("[REPORTES-DIARIOS] Enviando reporte del", hoy, "completo=", debeMandarCompleto);
  try {
    const errores = [];
    const informes = [
      { plantilla: REPORT_TEMPLATES.ventas, componer: /* @__PURE__ */ __name(async () => formatearVentas(await obtenerVentasHoy(hoy, env2), fechaLarga), "componer") },
      { plantilla: REPORT_TEMPLATES.gastos, componer: /* @__PURE__ */ __name(async () => formatearGastos(await obtenerGastosHoy(hoy, env2), fechaLarga, encabezado), "componer") },
      { plantilla: REPORT_TEMPLATES.caja, componer: /* @__PURE__ */ __name(async () => formatearCorteCaja(await obtenerCorteOperativo(hoy, env2), fechaLarga), "componer") }
    ];
    for (const informe of informes) {
      try {
        await enviarReporteATodos(hoy, informe.plantilla, await informe.componer(), resultados, env2);
      } catch (e) {
        errores.push(`${informe.plantilla}:${e instanceof Error ? e.message : "error"}`);
      }
    }
    if (errores.length) throw new Error(errores.join(";").slice(0, 240));
    await guardarEstadoReporte(hoy, {
      status: "sent",
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      sending_started_at: null,
      last_error: null,
      resultados
    }, env2);
    console.log("[REPORTES-DIARIOS] Reporte del", hoy, "enviado a los 2 destinatarios.");
  } catch (error2) {
    const code = error2 instanceof Error ? error2.message.slice(0, 240) : "unknown_report_error";
    await guardarEstadoReporte(hoy, {
      status: "error",
      sending_started_at: null,
      last_error: code,
      resultados
    }, env2);
    throw error2;
  }
}
__name(ejecutarReportesDiarios, "ejecutarReportesDiarios");
export {
  index_default as default,
  ejecutarReportesDiarios,
  encabezadoEstado,
  enviarReporteATodos,
  esHoraCorteAutomatico,
  formatearCaja,
  formatearCorteCaja,
  formatearGastos,
  formatearVentas,
  obtenerCorteOperativo
};
//# sourceMappingURL=index.js.map

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/_internal/utils.mjs
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

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
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

// ../creditek-sofia-rebuild/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
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

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
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

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
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

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
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

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../creditek-sofia-rebuild/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
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

// ../creditek-sofia-rebuild/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
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

// ../creditek-sofia-rebuild/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/claude.ts
function buildSystemPrompt(ciudadesCubiertas) {
  return `Eres SOF\xCDA, la mejor asesora comercial de Creditek, empresa colombiana que VENDE equipos electr\xF3nicos y art\xEDculos de belleza a cr\xE9dito en la Costa Caribe colombiana. Creditek NO es una entidad financiera: quien otorga el cr\xE9dito es la plataforma aliada (PayJoy, Alo Credit, Krediya o Addi), no Creditek. Nunca digas "financiamos" ni variantes donde Creditek aparezca como quien otorga el cr\xE9dito \u2014 di "vendemos a cr\xE9dito", "compra a cr\xE9dito en Creditek" o "te conectamos con financiaci\xF3n".

IDENTIDAD:
- Cordial, segura y eficiente. Hablas como una colombiana profesional y cercana \u2014 sin acento regional forzado ni jerga de relleno.
- Nunca suenas a formulario ni a robot. Nunca repites lo que el cliente acaba de decir.
- Tu objetivo es generar inter\xE9s real en el producto y conectar al cliente con un asesor humano lo antes posible.

REGLA DE ORO \u2014 UN OBJETIVO POR MENSAJE:
- Cada mensaje tuyo tiene UN solo objetivo. Nunca haces dos preguntas en el mismo mensaje.
- Nunca env\xEDas dos mensajes seguidos. Si tienes dos cosas que decir, eliges la m\xE1s importante para ahora.
- Terminas siempre con una \xFAnica pregunta clara o un siguiente paso \u2014 nunca con un men\xFA de opciones.

TU LUGAR EN LA CONVERSACI\xD3N:
El flujo completo con el cliente (saludo y autorizaci\xF3n, qu\xE9 busca, cr\xE9dito o contado, ciudad, datos, conexi\xF3n con la asesora) ya est\xE1 definido y el sistema maneja esos pasos con mensajes propios. Tu trabajo espec\xEDfico es la parte de "\xBFqu\xE9 est\xE1s buscando?": cuando el cliente cuenta qu\xE9 producto le interesa, generas entusiasmo real con t\xE9cnicas de venta y avanzas la conversaci\xF3n. El sistema se encarga despu\xE9s de preguntar ciudad, modalidad y datos \u2014 por eso:
- NUNCA preguntes en qu\xE9 ciudad est\xE1 el cliente
- NUNCA preguntes si es a cr\xE9dito o de contado
- NUNCA pidas nombre, c\xE9dula o celular
- NUNCA preguntes qu\xE9 modelo, marca o referencia espec\xEDfica quiere (decisi\xF3n de Oscar, 19-jul-2026: esa pregunta sobra \u2014 el asesor la resuelve con el inventario real en la mano, y el sistema le agrega su propia pregunta de cr\xE9dito/contado justo despu\xE9s de tu mensaje, as\xED que si t\xFA tambi\xE9n preguntas algo quedan dos preguntas apiladas en un mismo turno). Si el cliente menciona un modelo por su cuenta, responde con entusiasmo moderado sin afirmar disponibilidad ni popularidad. Si el modelo es ambiguo, el sistema lo aclara antes de llamarte.
- NUNCA confirmes ni niegues que tenemos tienda o cobertura en una ciudad que el cliente mencione \u2014 ni siquiera si suena parecida a una ciudad conocida (ej. Sincelejo, Monter\xEDa). El sistema valida eso con datos reales; t\xFA no tienes esa informaci\xF3n y afirmar algo falso genera desconfianza.
Si t\xFA tambi\xE9n preguntas o confirmas eso, el cliente recibe informaci\xF3n contradictoria o falsa.

EJEMPLO REAL DE ERROR (nunca hagas esto, pas\xF3 de verdad):
Cliente: "Estoy en Sampu\xE9s"
Sof\xEDa (INCORRECTO \u2014 prohibido): "Listo, estamos en Sampu\xE9s \u{1F44D}" / "en Sampu\xE9s te llegamos sin problema" / "nos vemos en Sampu\xE9s"
Sof\xEDa (CORRECTO): ignora por completo el nombre de la ciudad en tu respuesta \u2014 ni la repitas ni la confirmes, ni con emoji de aprobaci\xF3n. Responde solo sobre el producto/inter\xE9s, ej: "Genial, ese modelo est\xE1 pidi\xE9ndose bastante ahorita \u{1F60A}". El sistema se encarga de la ciudad aparte, en su propio mensaje.

EXTRACCI\xD3N INTELIGENTE DE DATOS (contexto \u2014 la ejecuta el sistema, no t\xFA):
Cuando el cliente manda nombre, c\xE9dula y celular en un solo mensaje, el sistema extrae los tres sin volver a preguntar ninguno; si falta uno, pregunta solo ese. Si el cliente responde "s\xED" cuando se le pregunta el celular por WhatsApp, el sistema usa directamente el n\xFAmero desde el que escribe. T\xFA no manejas esta parte, pero no debes contradecirla ni volver a pedir esos datos.

T\xC9CNICAS DE VENTA CONVERSACIONAL A APLICAR:
- Nunca afirmes que un modelo est\xE1 "volando", es "muy buscado" o tiene alta demanda: no tienes datos de inventario ni demanda en tiempo real.
- Urgencia suave: invita a avanzar r\xE1pido sin presionar. Ej: "Cu\xE9ntame r\xE1pido para que no pierdas el turno con la asesora"
- Tranquilidad: baja la ansiedad sobre el cr\xE9dito. Ej: "El proceso es muy sencillo, en minutos sabes si aplicas"
- Entusiasmo genuino: cuando el cliente elige un buen producto, cel\xE9bralo de forma natural, sin exagerar

INFORMACI\xD3N COMERCIAL:
- Productos: celulares, parlantes, accesorios, art\xEDculos de belleza y m\xE1s. Si preguntan por algo espec\xEDfico, responde con entusiasmo moderado sin confirmar ni negar disponibilidad exacta \u2014 eso lo confirma la asesora
- Cr\xE9dito: sin codeudor en la mayor\xEDa de los casos, solo c\xE9dula. El plazo exacto depende de la financiera y de tu perfil \u2014 eso te lo confirma la asesora al momento de aprobar tu cr\xE9dito.
- Damos cr\xE9dito incluso a reportados \u2014 la asesora lo eval\xFAa
- Garant\xEDa: cada marca tiene sus propias pol\xEDticas
- Tiendas aliadas en: ${ciudadesCubiertas}
- NUNCA menciones precios exactos ni cuotas exactas
- NUNCA menciones el nombre de la tienda aliada \u2014 solo "nuestros aliados en [ciudad]"

C\xD3MO RESPONDER SEG\xDAN LA SITUACI\xD3N:
- Pregunta qu\xE9 marcas hay \u2192 menci\xF3nalas con entusiasmo moderado
- Pregunta por precio \u2192 "El precio depende del modelo y el plazo, pero tu asesora te acomoda algo que puedas pagar tranquilo"
- No sabe si le alcanza \u2192 "Tenemos varios tipos de cr\xE9dito, tu asesora te ayuda a encontrar la mejor opci\xF3n"
- Pregunta si aprueban siendo reportado \u2192 "S\xED damos cr\xE9dito para reportados, tu asesora lo revisa contigo"
- Pregunta por garant\xEDa \u2192 "Cada marca maneja sus propias pol\xEDticas de garant\xEDa, tu asesora te explica los detalles"
- Pregunta d\xF3nde est\xE1n \u2192 "Tenemos aliados en varias ciudades de la Costa"
- Dice que lo va a pensar \u2192 "Claro que s\xED, si quieres que te escriba despu\xE9s con novedades, cu\xE9ntame"
- Manda audio/voz \u2192 "Por favor escr\xEDbeme, no puedo escuchar mensajes de voz \u{1F60A}"
- Asesora no contesta \u2192 "\xA1Qu\xE9 raro! Te paso con otra asesora"
- Aclara que busca dinero en efectivo o un pr\xE9stamo (no un producto) \u2192 dilo simple y humano, en una frase corta, sin listar el cat\xE1logo completo como si fuera una ficha de producto. Ej: "Ah, tranquilo, en Creditek no manejamos pr\xE9stamos en efectivo directo \u2014 trabajamos la compra de celulares y otros equipos a cr\xE9dito. Si te sirve eso, con gusto te ayudo \u{1F60A}"

PROHIBIDO:
- Dos preguntas en un mismo mensaje
- Preguntar qu\xE9 modelo, marca o referencia espec\xEDfica quiere el cliente
- Dos mensajes consecutivos
- Las palabras: "ey", "vos", "quer\xE9s", "miremos", "bacano", "mano"
- Decir "estudio de cr\xE9dito" \u2014 siempre di "tramitar el cr\xE9dito"
- Repetir lo que el cliente acaba de decir
- Sonar a formulario, encuesta o men\xFA numerado
- Prometer aprobaci\xF3n garantizada
- Dar precios o cuotas exactas
- Usar listas, vi\xF1etas o numeraci\xF3n
- Confirmar o negar cobertura/tienda en una ciudad espec\xEDfica (eso lo decide el sistema con datos reales, no t\xFA)

FORMATO: Mensaje real de WhatsApp. Corto (2-3 l\xEDneas m\xE1ximo). Natural. Sin t\xEDtulos, sin listas. M\xE1ximo 1 emoji.`;
}
__name(buildSystemPrompt, "buildSystemPrompt");
async function generarRespuesta(estado, mensajeCliente, contexto, anthropicKey) {
  const historial = (contexto.historial || []).slice(-8).join("\n");
  const ciudadInfo = contexto.ciudad ? `Ciudad del cliente: ${contexto.ciudad}` : "Ciudad: no confirmada a\xFAn";
  const nombreInfo = contexto.nombre ? `Nombre del cliente: ${contexto.nombre.split(" ")[0]}` : "";
  const modalidadInfo = contexto.modalidad ? `Modalidad detectada: ${contexto.modalidad}` : "";
  const productoInfo = contexto.producto ? `Inter\xE9s del cliente: ${contexto.producto}` : "";
  const instruccionCaptura = contexto.soloResponderDuda ? "INSTRUCCI\xD3N ESPECIAL: responde \xFAnicamente la duda del cliente. No hagas preguntas ni pidas datos; el sistema a\xF1adir\xE1 despu\xE9s la solicitud del \xFAnico dato faltante." : "";
  const userMessage = `CONTEXTO (usa esto, no lo preguntes de nuevo):
${ciudadInfo}
${nombreInfo}
${modalidadInfo}
${productoInfo}
Estado: ${estado}
${instruccionCaptura}

HISTORIAL RECIENTE:
${historial}

MENSAJE DEL CLIENTE:
"${mensajeCliente}"

Responde como Sof\xEDa: profesional, cercana, con seguridad comercial. Un solo objetivo en el mensaje, nunca dos preguntas. 2-3 l\xEDneas m\xE1ximo. Sin "bacano", "ey", "vos", "quer\xE9s", "mano".`;
  try {
    const ciudadesCubiertas = contexto.ciudadesCubiertas || "Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro y Cove\xF1as";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system: buildSystemPrompt(ciudadesCubiertas),
        messages: [{ role: "user", content: userMessage }]
      })
    });
    const data = await response.json();
    let texto = data?.content?.[0]?.text?.trim() || "\xBFEn qu\xE9 m\xE1s te puedo ayudar? \u{1F60A}";
    texto = texto.replace(/\bbacano\b/gi, "perfecto");
    return texto;
  } catch {
    return "\xBFMe cuentas en qu\xE9 te puedo ayudar? \u{1F60A}";
  }
}
__name(generarRespuesta, "generarRespuesta");

// src/meta.ts
var STAGING_META_MOCK_TOKEN = "META_MOCK_ONLY";
async function enviarMensajeWA(telefono, mensaje, phoneNumberId, accessToken) {
  if (accessToken === STAGING_META_MOCK_TOKEN) return;
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono.replace("+", ""),
      type: "text",
      text: { body: mensaje, preview_url: false }
    })
  });
  if (!res.ok) {
    const detalle = await res.text();
    console.error("[WA] Error:", detalle);
    throw new Error(`WhatsApp respondi\xF3 ${res.status}: ${detalle}`);
  }
}
__name(enviarMensajeWA, "enviarMensajeWA");
async function enviarBotonesWA(telefono, texto, botones, phoneNumberId, accessToken) {
  if (accessToken === STAGING_META_MOCK_TOKEN) return;
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono.replace("+", ""),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: texto },
        action: {
          buttons: botones.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } }))
        }
      }
    })
  });
  if (!res.ok) {
    const detalle = await res.text();
    console.error("[WA-BOTONES] Error:", detalle);
    throw new Error(`WhatsApp botones respondi\xF3 ${res.status}: ${detalle}`);
  }
}
__name(enviarBotonesWA, "enviarBotonesWA");
async function enviarMensajeFB(recipientId, mensaje, pageId, accessToken) {
  if (accessToken === STAGING_META_MOCK_TOKEN) return;
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: mensaje },
      messaging_type: "RESPONSE"
    })
  });
  if (!res.ok) {
    const detalle = await res.text();
    console.error("[FB] Error:", detalle);
    throw new Error(`Facebook Messenger respondi\xF3 ${res.status}: ${detalle}`);
  }
}
__name(enviarMensajeFB, "enviarMensajeFB");

// src/lead-policy.ts
var ESTADOS_PENDIENTES = [
  "nuevo",
  "contactado",
  "ciudad_identificada",
  "lead_caliente"
];
function normalizar(texto) {
  return texto.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
__name(normalizar, "normalizar");
function esConsultaDuranteCaptura(texto) {
  const t = normalizar(texto);
  if (!t || /^\d[\d\s.,-]{5,}$/.test(t)) return false;
  if (texto.includes("?") || texto.includes("\xBF")) return true;
  if (/^(que|cual|como|donde|cuando|cuanto|quien|por que)\b/.test(t)) return true;
  return /\b(cuota|precio|entidad|financieras?|proceso|presencial|personal|segur[oa]|garantia|reportad[oa]|documentos?|requisitos?|artefactos?|productos?|parlantes?|accesorios?|distribuyen|manejan|venden|puedo ir)\b/.test(t);
}
__name(esConsultaDuranteCaptura, "esConsultaDuranteCaptura");
function respuestaConsultaFrecuenteDuranteCaptura(texto) {
  const t = normalizar(texto);
  if (/\bcuota\s+inicial\b/.test(t)) {
    return "La cuota inicial depende del equipo y de la calificaci\xF3n que obtengas; el asesor te confirma el valor exacto.";
  }
  if (/\b(entidad|financieras?)\b/.test(t)) {
    return "Trabajamos con PayJoy, Alo Credit, Krediya y Addi; el asesor confirma cu\xE1l opci\xF3n aplica para tu compra.";
  }
  if (/\b(proceso|presencial|personal|puedo ir)\b/.test(t)) {
    return "El asesor te explica el proceso y te confirma c\xF3mo continuar de forma presencial.";
  }
  if (/\bsegur[oa]\b/.test(t)) {
    return "S\xED, est\xE1s hablando con el canal de atenci\xF3n de Creditek; el asesor contin\xFAa contigo el tr\xE1mite.";
  }
  if (/\b(artefactos?|productos?|parlantes?|accesorios?|distribuyen|manejan|venden)\b/.test(t)) {
    return "Manejamos celulares, parlantes, accesorios y art\xEDculos de belleza; la disponibilidad exacta te la confirma el asesor.";
  }
  return null;
}
__name(respuestaConsultaFrecuenteDuranteCaptura, "respuestaConsultaFrecuenteDuranteCaptura");
function esIntencionMoto(texto) {
  const t = normalizar(texto);
  const mencionaMoto = /\bmotos?\b|\bmotocicletas?\b|\bnkd\b/.test(t);
  const niegaMoto = /\bno\b[^.!?]{0,30}\b(motos?|motocicletas?|nkd)\b/.test(t);
  return mencionaMoto && !niegaMoto;
}
__name(esIntencionMoto, "esIntencionMoto");
function esNombreDescartable(texto) {
  const t = normalizar(texto);
  if (!t) return true;
  if (texto.includes("?") || texto.includes("\xBF")) return true;
  if (/^(que|cual|como|donde|cuando|cuanto|quien|por que)\b/.test(t)) return true;
  if (/^(gracias|hola|buenas|acepto|listo|dale|ok|okay|si|no)\b[\s.!]*$/.test(t)) return true;
  return /\b(quiero|necesito|busco|tengo|dame|credito|contado|financieras?|entidad|cuota|precio|proceso|seguro|garantia|tienda|oficina|celular|equipo|samsung|xiaomi|iphone|parlante|artefacto|producto|moto|motocicleta|nkd)\b/.test(t);
}
__name(esNombreDescartable, "esNombreDescartable");
function mensajeConsultaAsesor(texto, nombreAsesor, telefonoAsesor) {
  const asesor = nombreAsesor || "tu asesor";
  const contacto = telefonoAsesor ? ` Escr\xEDbele al ${telefonoAsesor}.` : "";
  if (/\bcuota\s+inicial\b/i.test(normalizar(texto))) {
    return `La cuota inicial depende del equipo y de la calificaci\xF3n que obtengas. ${asesor} te confirma el valor exacto.${contacto}`;
  }
  return `${asesor} te confirma esa informaci\xF3n seg\xFAn el equipo y tu proceso.${contacto}`;
}
__name(mensajeConsultaAsesor, "mensajeConsultaAsesor");

// src/logic.ts
function norm(texto) {
  return texto.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
__name(norm, "norm");
function detectaSolicitudDinero(texto) {
  const t = norm(texto);
  if (/\b(pagar|pago|contado)\b.{0,20}\befectivo\b/.test(t)) return false;
  const mencionaDinero = /\b(dinero|plata|prestamo|efectivo)\b/.test(t);
  const expresaIntencion = /\b(pense|crei|busco|quiero|necesito|solicito|dan|prestan|era)\b/.test(t);
  return mencionaDinero && expresaIntencion;
}
__name(detectaSolicitudDinero, "detectaSolicitudDinero");
function detectaCierreComercial(texto) {
  const t = norm(texto).replace(/[.!]+$/g, "").trim();
  if (/no.*(contest|respond|llam|escrib)/.test(t)) return false;
  if (/^no[\s,]+gracias$/.test(t)) return true;
  return /^no me interesa\b/.test(t) || /^no quiero (seguir|comprar|el celular|un celular|el equipo|un equipo)\b/.test(t) || /^(dejemos|deja) (asi|eso asi)\b/.test(t);
}
__name(detectaCierreComercial, "detectaCierreComercial");
function extraerDatosMinimos(texto) {
  const correo = texto.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? null;
  const celularRaw = texto.match(/(?<!\d)3(?:[\s.\-]?\d){9}(?!\d)/)?.[0] ?? null;
  const celular = celularRaw ? `57${celularRaw.replace(/\D/g, "")}` : null;
  const candidatosNumericos = [...texto.matchAll(/(?<!\d)(?:\d[\s.\-]?){6,12}(?!\d)/g)].map((m) => ({ raw: m[0], limpio: m[0].replace(/\D/g, "") })).filter((x) => x.limpio.length >= 6 && x.limpio.length <= 12);
  const cedulaMatch = candidatosNumericos.find(
    (x) => x.raw !== celularRaw && !/^3\d{9}$/.test(x.limpio)
  );
  const cedula = cedulaMatch?.limpio ?? null;
  let textoNombre = texto;
  for (const valor of [correo, celularRaw, cedulaMatch?.raw ?? null]) {
    if (valor) textoNombre = textoNombre.replace(valor, " ");
  }
  textoNombre = textoNombre.replace(/\bC\.?C\.?\b|\bc[eé]dula\b|\bcelular\b|\bcorreo\b|\by\s+mi\b|\bmi\b/gi, " ").replace(/[,.:;]/g, " ").replace(/\s{2,}/g, " ").trim();
  const nombreMatch = textoNombre.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ]{2,}(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,}){1,4})$/);
  const nombre = nombreMatch?.[1]?.trim() ?? null;
  return { nombre, cedula, celular, correo };
}
__name(extraerDatosMinimos, "extraerDatosMinimos");
function pareceReferenciaProducto(texto) {
  const t = norm(texto);
  return /\b(samsung|xiaomi|redmi|motorola|moto|iphone|honor|oppo|infinix|tecno|huawei)\b.*\d/.test(t);
}
__name(pareceReferenciaProducto, "pareceReferenciaProducto");
function resolverReengancheFin(conv, texto) {
  const producto = texto.trim();
  if (/\bsamsung\s+16\b/i.test(producto)) {
    return {
      estado: conv.ciudad_original ? "CIUDAD_MODAL" : "ESCUCHAR",
      respuesta: "\xBFTe refieres al Samsung A16? \u{1F60A}",
      producto_interes: producto,
      modelo_pendiente: "Samsung A16"
    };
  }
  if (conv.ciudad_original) {
    return {
      estado: "CIUDAD_MODAL",
      respuesta: "Para conectarte con un asesor, \xBFcu\xE1l te queda m\xE1s cerca: Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro o Cove\xF1as?",
      producto_interes: producto
    };
  }
  return {
    estado: "ESCUCHAR",
    respuesta: "\xA1Perfecto! \xBFEn qu\xE9 ciudad est\xE1s? \u{1F60A}",
    producto_interes: producto
  };
}
__name(resolverReengancheFin, "resolverReengancheFin");

// src/conversation-continuity.ts
function debeIniciarConversacion(conversacion) {
  return !conversacion;
}
__name(debeIniciarConversacion, "debeIniciarConversacion");
function normalizar2(texto) {
  return texto.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[!¡?¿.,]+/g, "");
}
__name(normalizar2, "normalizar");
var DEPARTAMENTOS = {
  sucre: "Sucre",
  cordoba: "C\xF3rdoba",
  bolivar: "Bol\xEDvar",
  atlantico: "Atl\xE1ntico",
  magdalena: "Magdalena",
  cesar: "Cesar",
  "la guajira": "La Guajira"
};
function detectarDepartamento(texto) {
  return DEPARTAMENTOS[normalizar2(texto)] ?? null;
}
__name(detectarDepartamento, "detectarDepartamento");
function esMensajeCortoContextual(texto) {
  return /^(si|ok|okay|aja|bueno|perfecto|listo|gracias)$/.test(normalizar2(texto));
}
__name(esMensajeCortoContextual, "esMensajeCortoContextual");
function preguntaPendiente(contexto) {
  if (!contexto.optinAceptado) {
    return "\xBFMe autorizas guardar tus datos para continuar?";
  }
  if (contexto.departamento && !contexto.municipio) {
    return `Perfecto \u{1F60A} \xBFEn cu\xE1l municipio de ${contexto.departamento} te encuentras?`;
  }
  if (!contexto.municipio && !contexto.tiendaAsignada) {
    return "\xBFEn qu\xE9 municipio te encuentras? \u{1F60A}";
  }
  if (!contexto.nombre) {
    return "\xBFMe regalas tu nombre completo? \u{1F60A}";
  }
  if (contexto.modalidad !== "contado" && !contexto.cedula) {
    return "\xBFY tu n\xFAmero de c\xE9dula? (para el tr\xE1mite del cr\xE9dito)";
  }
  return null;
}
__name(preguntaPendiente, "preguntaPendiente");
function resolverPreguntaDeContinuidad(texto, contexto) {
  const t = normalizar2(texto);
  const solicitaCatalogo = /\b(catalogo|equipos?|celulares?|precios?)\b/.test(t);
  if (solicitaCatalogo) {
    return contexto.leadCreado ? "El asesor de la tienda asignada te compartir\xE1 las opciones disponibles y sus precios actuales." : "Cuando terminemos el registro, el asesor de la tienda asignada te compartir\xE1 las opciones disponibles y sus precios actuales.";
  }
  const consultaEstado = /\b(me van a atender|cuando|ya quedo|quedo registrada|que sigue|no me han escrito|si quedo)\b/.test(t);
  if (!consultaEstado) return null;
  if (!contexto.leadCreado) {
    return "Tu solicitud a\xFAn no ha quedado registrada; estoy completando los datos necesarios para asignarte correctamente.";
  }
  const tienda = contexto.tiendaNombre ? ` al equipo de ${contexto.tiendaNombre}` : " al equipo que atiende tu zona";
  return `Tu solicitud qued\xF3 registrada correctamente y fue asignada${tienda}. Un asesor continuar\xE1 tu proceso lo antes posible.`;
}
__name(resolverPreguntaDeContinuidad, "resolverPreguntaDeContinuidad");

// src/message-idempotency.ts
var claveEventoMeta = /* @__PURE__ */ __name((metaId) => `meta_event_v2:${metaId}`, "claveEventoMeta");
var claveEventoDurable = /* @__PURE__ */ __name((metaId) => `meta_event_v2:${metaId}`, "claveEventoDurable");
var claveRecuperacion = /* @__PURE__ */ __name((metaId) => `meta_recovery_v1:${metaId}`, "claveRecuperacion");
function leerAuditoria(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(leerAuditoria, "leerAuditoria");
async function reservarEventoMeta(almacen, entrada) {
  const ahora = entrada.ahora || (/* @__PURE__ */ new Date()).toISOString();
  const key = claveEventoMeta(entrada.metaId);
  const existente = leerAuditoria(await almacen.get(key));
  if (existente) {
    const auditoria2 = {
      ...existente,
      fechaReintento: ahora,
      intentos: existente.intentos + 1,
      motivo: existente.resultadoFinal === "procesando" ? "evento detenido encontrado; requiere revisi\xF3n manual sin reprocesar" : `ID de Meta ya registrado por ${existente.rutaEntrada}`,
      resultadoFinal: "bloqueado_idempotencia"
    };
    await almacen.put(key, JSON.stringify(auditoria2));
    return { permitido: false, auditoria: auditoria2 };
  }
  const auditoria = {
    metaId: entrada.metaId,
    idInterno: entrada.idInterno || crypto.randomUUID(),
    rutaEntrada: entrada.rutaEntrada,
    fechaOriginal: entrada.fechaOriginal,
    fechaPrimerIngreso: ahora,
    fechaReintento: null,
    intentos: 1,
    motivo: "primer ingreso aceptado",
    resultadoFinal: "recibido"
  };
  await almacen.put(key, JSON.stringify(auditoria));
  return { permitido: true, auditoria };
}
__name(reservarEventoMeta, "reservarEventoMeta");
async function actualizarAuditoriaEvento(almacen, auditoria, resultadoFinal, motivo) {
  const actualizada = { ...auditoria, resultadoFinal, motivo };
  await almacen.put(claveEventoMeta(auditoria.metaId), JSON.stringify(actualizada));
  return actualizada;
}
__name(actualizarAuditoriaEvento, "actualizarAuditoriaEvento");
async function reservarEventoEnDurable(almacen, auditoria) {
  const key = claveEventoDurable(auditoria.metaId);
  if (await almacen.get(key)) return false;
  await almacen.put(key, auditoria);
  return true;
}
__name(reservarEventoEnDurable, "reservarEventoEnDurable");
async function finalizarEventoEnDurable(almacen, auditoria, resultadoFinal, motivo) {
  await almacen.put(claveEventoDurable(auditoria.metaId), {
    ...auditoria,
    resultadoFinal,
    motivo
  });
}
__name(finalizarEventoEnDurable, "finalizarEventoEnDurable");
async function reservarRecuperacionManual(almacen, metaId, ahora = (/* @__PURE__ */ new Date()).toISOString()) {
  const evento = leerAuditoria(await almacen.get(claveEventoMeta(metaId)));
  if (evento?.resultadoFinal === "respondido") return false;
  const key = claveRecuperacion(metaId);
  if (await almacen.get(key)) return false;
  await almacen.put(key, JSON.stringify({
    metaId,
    idInterno: crypto.randomUUID(),
    rutaEntrada: "recuperacion_manual",
    fechaOriginal: evento?.fechaOriginal || ahora,
    fechaPrimerIngreso: ahora,
    fechaReintento: ahora,
    intentos: 1,
    motivo: "recuperaci\xF3n manual reservada por operador",
    resultadoFinal: "procesando"
  }));
  return true;
}
__name(reservarRecuperacionManual, "reservarRecuperacionManual");
async function finalizarRecuperacionManual(almacen, metaId, resultadoFinal) {
  const key = claveRecuperacion(metaId);
  const auditoria = leerAuditoria(await almacen.get(key));
  if (!auditoria) return;
  await almacen.put(key, JSON.stringify({
    ...auditoria,
    motivo: resultadoFinal === "respondido" ? "recuperaci\xF3n manual enviada" : "fallo de env\xEDo en recuperaci\xF3n manual; requiere revisi\xF3n",
    resultadoFinal
  }));
}
__name(finalizarRecuperacionManual, "finalizarRecuperacionManual");

// src/commercial-kpis.ts
var HandoffPersistencePendingError = class extends Error {
  static {
    __name(this, "HandoffPersistencePendingError");
  }
  code = "meta_confirmation_persist_pending";
  constructor() {
    super("Meta confirm\xF3 el env\xEDo; falta completar la persistencia");
  }
};
var MetaDeliveryAmbiguousError = class extends Error {
  static {
    __name(this, "MetaDeliveryAmbiguousError");
  }
  code = "meta_delivery_ambiguous";
  constructor() {
    super("No se pudo confirmar si Meta recibi\xF3 el handoff");
  }
};
var HandoffManualReviewError = class extends Error {
  static {
    __name(this, "HandoffManualReviewError");
  }
  code = "meta_delivery_manual_review";
  constructor() {
    super("El handoff requiere revisi\xF3n manual; no se reenviar\xE1 autom\xE1ticamente");
  }
};
function headers(key, json = false) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...json ? { "Content-Type": "application/json" } : {}
  };
}
__name(headers, "headers");
function codigoErrorSeguro(value) {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120) || "handoff_error";
}
__name(codigoErrorSeguro, "codigoErrorSeguro");
async function reservarHandoff(supabaseUrl2, serviceKey, input, fetcher = fetch) {
  const response = await fetcher(`${supabaseUrl2}/rest/v1/aura_sofia_outbox`, {
    method: "POST",
    headers: { ...headers(serviceKey, true), Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      event_kind: "advisor_handoff",
      idempotency_key: input.idempotencyKey,
      destination_id: input.destinationId,
      destination_type: input.destinationType,
      origin: input.origin,
      reassignment_of: input.reassignmentOf || null,
      status: "reserved",
      attempts: 1,
      evidence_version: 1
    })
  });
  if (!response.ok && response.status !== 409) throw new Error(`Supabase outbox respondi\xF3 ${response.status}`);
  const responseBody = await response.text();
  let rows = [];
  if (response.status !== 409 && responseBody.trim()) {
    try {
      const parsed = JSON.parse(responseBody);
      if (!Array.isArray(parsed)) throw new Error("not-array");
      rows = parsed;
    } catch {
      throw new Error("Supabase outbox devolvi\xF3 JSON inv\xE1lido");
    }
  }
  if (rows[0]) return { permitido: true, evidencia: rows[0] };
  const existing = await fetcher(
    `${supabaseUrl2}/rest/v1/aura_sofia_outbox?idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&select=id,status,meta_response_id,sent_confirmed_at,send_started_at,error_code&limit=1`,
    { headers: headers(serviceKey) }
  );
  if (!existing.ok) throw new Error(`Supabase outbox existente respondi\xF3 ${existing.status}`);
  const [evidencia] = await existing.json();
  if (!evidencia) throw new Error("No se pudo recuperar la evidencia idempotente");
  const pendienteConfirmacion = !!evidencia.meta_response_id && evidencia.status !== "manual_review";
  const reintentoAntesDeMeta = !evidencia.send_started_at && evidencia.error_code !== "meta_rejected";
  return { permitido: evidencia.status !== "sent" && evidencia.status !== "manual_review" && (pendienteConfirmacion || reintentoAntesDeMeta), evidencia };
}
__name(reservarHandoff, "reservarHandoff");
async function buscarHandoffInicial(supabaseUrl2, serviceKey, clienteId, fetcher = fetch) {
  const response = await fetcher(
    `${supabaseUrl2}/rest/v1/aura_sofia_outbox?idempotency_key=eq.${encodeURIComponent(`advisor_handoff:${clienteId}`)}&select=id,status,meta_response_id,sent_confirmed_at,send_started_at,error_code&limit=1`,
    { headers: headers(serviceKey) }
  );
  if (!response.ok) throw new Error(`Supabase outbox inicial respondi\xF3 ${response.status}`);
  const [evidencia] = await response.json();
  return evidencia || null;
}
__name(buscarHandoffInicial, "buscarHandoffInicial");
async function confirmarHandoff(supabaseUrl2, serviceKey, evidenciaId, metaResponseId, fetcher = fetch) {
  if (!metaResponseId) throw new Error("Meta no devolvi\xF3 messages[0].id");
  const response = await fetcher(`${supabaseUrl2}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`, {
    method: "PATCH",
    headers: { ...headers(serviceKey, true), Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "sent",
      sent_confirmed_at: (/* @__PURE__ */ new Date()).toISOString(),
      evidence_version: 1,
      error_code: null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  if (!response.ok) throw new Error(`No se pudo persistir la confirmaci\xF3n Meta (${response.status})`);
}
__name(confirmarHandoff, "confirmarHandoff");
async function persistirRecepcionMeta(supabaseUrl2, serviceKey, evidenciaId, metaResponseId, fetcher = fetch) {
  if (!metaResponseId) throw new Error("Meta no devolvi\xF3 messages[0].id");
  const response = await fetcher(`${supabaseUrl2}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`, {
    method: "PATCH",
    headers: { ...headers(serviceKey, true), Prefer: "return=minimal" },
    body: JSON.stringify({
      meta_response_id: metaResponseId,
      error_code: "meta_confirmation_persist_pending",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  if (!response.ok) throw new Error(`No se pudo conservar la confirmaci\xF3n Meta (${response.status})`);
}
__name(persistirRecepcionMeta, "persistirRecepcionMeta");
async function iniciarEnvioMeta(supabaseUrl2, serviceKey, evidenciaId, fetcher = fetch) {
  const response = await fetcher(`${supabaseUrl2}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`, {
    method: "PATCH",
    headers: { ...headers(serviceKey, true), Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "reserved",
      send_started_at: (/* @__PURE__ */ new Date()).toISOString(),
      error_code: null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  if (!response.ok) throw new Error(`No se pudo registrar el inicio del env\xEDo Meta (${response.status})`);
}
__name(iniciarEnvioMeta, "iniciarEnvioMeta");
async function marcarHandoffManualReview(supabaseUrl2, serviceKey, evidenciaId, errorCode, fetcher = fetch) {
  const response = await fetcher(`${supabaseUrl2}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`, {
    method: "PATCH",
    headers: { ...headers(serviceKey, true), Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "manual_review",
      error_code: codigoErrorSeguro(errorCode),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  if (!response.ok) console.error("[KPIS-OUTBOX] no se pudo marcar revisi\xF3n manual:", response.status);
}
__name(marcarHandoffManualReview, "marcarHandoffManualReview");
async function procesarHandoffCertificado({
  supabaseUrl: supabaseUrl2,
  serviceKey,
  input,
  enviarMeta,
  fetcher = fetch
}) {
  const reserva = await reservarHandoff(supabaseUrl2, serviceKey, input, fetcher);
  if (reserva.evidencia.status === "sent" && reserva.evidencia.meta_response_id) {
    return { status: "sent", metaResponseId: reserva.evidencia.meta_response_id, evidenciaId: reserva.evidencia.id };
  }
  if (reserva.evidencia.status === "manual_review") {
    throw new HandoffManualReviewError();
  }
  if (!reserva.permitido && !reserva.evidencia.meta_response_id) {
    throw new HandoffManualReviewError();
  }
  let metaResponseId = reserva.evidencia.meta_response_id || null;
  if (reserva.evidencia.status === "reserved" && reserva.evidencia.error_code === "meta_confirmation_persist_pending" && metaResponseId) {
    await confirmarHandoff(supabaseUrl2, serviceKey, reserva.evidencia.id, metaResponseId, fetcher);
    return { status: "sent", metaResponseId, evidenciaId: reserva.evidencia.id };
  }
  if (!metaResponseId) {
    if (reserva.evidencia.send_started_at) {
      await marcarHandoffManualReview(supabaseUrl2, serviceKey, reserva.evidencia.id, "meta_delivery_ambiguous", fetcher);
      throw new HandoffManualReviewError();
    }
    await iniciarEnvioMeta(supabaseUrl2, serviceKey, reserva.evidencia.id, fetcher);
    try {
      metaResponseId = await enviarMeta();
      if (!metaResponseId) {
        throw new MetaDeliveryAmbiguousError();
      }
    } catch (error) {
      if (error instanceof MetaDeliveryAmbiguousError) {
        await marcarHandoffManualReview(supabaseUrl2, serviceKey, reserva.evidencia.id, error.code, fetcher);
        throw new HandoffManualReviewError();
      }
      await marcarHandoffError(supabaseUrl2, serviceKey, reserva.evidencia.id, error instanceof Error ? error.message : "meta_handoff_failed", fetcher);
      throw error;
    }
    try {
      await persistirRecepcionMeta(supabaseUrl2, serviceKey, reserva.evidencia.id, metaResponseId, fetcher);
    } catch {
      await marcarHandoffManualReview(supabaseUrl2, serviceKey, reserva.evidencia.id, "meta_confirmation_persist_pending", fetcher);
      throw new HandoffManualReviewError();
    }
  }
  try {
    await confirmarHandoff(supabaseUrl2, serviceKey, reserva.evidencia.id, metaResponseId, fetcher);
  } catch {
    throw new HandoffPersistencePendingError();
  }
  return { status: "sent", metaResponseId, evidenciaId: reserva.evidencia.id };
}
__name(procesarHandoffCertificado, "procesarHandoffCertificado");
async function marcarHandoffError(supabaseUrl2, serviceKey, evidenciaId, errorCode, fetcher = fetch) {
  const response = await fetcher(`${supabaseUrl2}/rest/v1/aura_sofia_outbox?id=eq.${encodeURIComponent(evidenciaId)}`, {
    method: "PATCH",
    headers: { ...headers(serviceKey, true), Prefer: "return=minimal" },
    body: JSON.stringify({ status: "error", error_code: codigoErrorSeguro(errorCode), attempts: 2, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
  if (!response.ok) console.error("[KPIS-OUTBOX] no se pudo registrar error:", response.status);
}
__name(marcarHandoffError, "marcarHandoffError");
function esLeadCertificado(row) {
  return row.event_kind === "advisor_handoff" && row.status === "sent" && !!row.meta_response_id && row.evidence_version === 1 && !row.reassignment_of;
}
__name(esLeadCertificado, "esLeadCertificado");

// src/index.ts
var AURA_PRODUCTION_SUPABASE_URL = "https://ditiwpndvmyuqcagupea.supabase.co";
var configuredSupabaseUrl = null;
function clasificarErrorArnes(error) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return String(error.code);
  }
  if (error && typeof error === "object" && "message" in error && error.message === "meta_rejected") return "meta_rejected";
  return "staging_harness_internal_error";
}
__name(clasificarErrorArnes, "clasificarErrorArnes");
function configurarEntorno(env2) {
  if (env2.ENVIRONMENT !== "production" && env2.ENVIRONMENT !== "staging") {
    throw new Error("ENVIRONMENT inv\xE1lido");
  }
  if (!env2.SUPABASE_URL) throw new Error("SUPABASE_URL es requerida");
  if (env2.ENVIRONMENT === "staging" && env2.SUPABASE_URL === AURA_PRODUCTION_SUPABASE_URL) {
    throw new Error("Staging no puede usar Supabase AURA productivo");
  }
  if (env2.ENVIRONMENT === "staging" && env2.META_TRANSPORT !== "mock") {
    throw new Error("Staging requiere transporte Meta mock");
  }
  if (env2.ENVIRONMENT === "production" && (env2.SUPABASE_URL !== AURA_PRODUCTION_SUPABASE_URL || env2.META_TRANSPORT !== "graph")) {
    throw new Error("Configuraci\xF3n productiva insegura");
  }
  configuredSupabaseUrl = env2.SUPABASE_URL;
}
__name(configurarEntorno, "configurarEntorno");
function supabaseUrl() {
  if (!configuredSupabaseUrl) throw new Error("Entorno no configurado");
  return configuredSupabaseUrl;
}
__name(supabaseUrl, "supabaseUrl");
function norm2(s) {
  return s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
__name(norm2, "norm");
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
__name(levenshtein, "levenshtein");
var CIUDADES = ["tolu", "tol\xFA", "corozal", "chinu", "chin\xFA", "cienaga de oro", "ci\xE9naga de oro", "covenas", "cove\xF1as"];
var CIUDADES_CANONICAS = ["Tolu", "Corozal", "Chinu", "Cienaga de Oro", "Covenas"];
function ciudadMasParecida(cnRaw) {
  const cn = norm2(cnRaw);
  const intentar = /* @__PURE__ */ __name((candidato) => {
    let mejor = null, mejorDist = Infinity;
    for (const c of CIUDADES_CANONICAS) {
      const d = levenshtein(candidato, norm2(c));
      if (d < mejorDist) {
        mejorDist = d;
        mejor = c;
      }
    }
    const tolerancia = mejor && norm2(mejor).length <= 6 ? 1 : 2;
    return mejor && mejorDist <= tolerancia ? { ciudad: mejor, dist: mejorDist } : null;
  }, "intentar");
  const directo = intentar(cn);
  if (directo) return directo.ciudad;
  const palabras = cn.split(/\s+/).filter(Boolean);
  let mejorTokenizado = null;
  for (let tam = 1; tam <= 3; tam++) {
    for (let i = 0; i + tam <= palabras.length; i++) {
      const candidato = palabras.slice(i, i + tam).join(" ");
      const r = intentar(candidato);
      if (r && (!mejorTokenizado || r.dist < mejorTokenizado.dist)) mejorTokenizado = r;
    }
  }
  return mejorTokenizado ? mejorTokenizado.ciudad : null;
}
__name(ciudadMasParecida, "ciudadMasParecida");
async function buscarCiudadAlias(cn, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/ciudad_alias?alias=eq.${encodeURIComponent(cn)}&select=ciudad_normalizada&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return d[0]?.ciudad_normalizada ?? null;
  } catch {
    return null;
  }
}
__name(buscarCiudadAlias, "buscarCiudadAlias");
function detectaCiudad(texto) {
  const t = norm2(texto);
  return CIUDADES.find((c) => t.includes(norm2(c))) ?? null;
}
__name(detectaCiudad, "detectaCiudad");
function pareceCiudad(texto) {
  const t = texto.trim();
  if (t.includes("?") || t.includes("\xBF")) return false;
  if (/^(que|qué|cual|cuál|como|cómo|donde|dónde|cuando|cuándo|cuanto|cuánto|quien|quién)\b/i.test(norm2(t))) return false;
  return true;
}
__name(pareceCiudad, "pareceCiudad");
function tieneIntencionReal(texto) {
  const t = norm2(texto).trim();
  if (!t) return false;
  if (/^(gracias|ok|okay|listo|chao|adios|hasta luego|hasta pronto|de nada|vale|bien|dale|mmm|ah|ahh|jaja)[\s.!]*$/i.test(t)) return false;
  if (texto.includes("?") || texto.includes("\xBF")) return true;
  if (/\b(celular|samsung|xiaomi|motorola|moto|iphone|apple|huawei|honor|computador|portatil|laptop|tablet|parlante|cable|audifonos|smart\s*tv|equipo|producto|credito|contado|precio|cuota|financiaci|cuanto|cuando|como|donde|quiero|necesito|busco|pued|tienen|\bhay\b|informacion|info|comprar|llev)/i.test(t)) return true;
  if (/\d{6,}/.test(texto)) return true;
  return false;
}
__name(tieneIntencionReal, "tieneIntencionReal");
function detectaCredito(texto) {
  return /cr[eé]d\w{0,3}to|acredit|financiad|cuota|plazo|mensual|abono/i.test(texto);
}
__name(detectaCredito, "detectaCredito");
function detectaContado(texto) {
  return /\bcontado\b|efectivo|de una|pago\s*(completo|total)/i.test(texto);
}
__name(detectaContado, "detectaContado");
var PALABRAS_RESERVADAS_ESCUCHAR = [
  "acepto",
  "credito",
  "cr\xE9dito",
  "contado",
  "si",
  "s\xED",
  "no",
  "ok",
  "dale",
  "listo",
  "telefono",
  "tel\xE9fono",
  "celular",
  "computador",
  "portatil",
  "port\xE1til",
  "tablet",
  "samsung",
  "xiaomi",
  "oppo",
  "honor",
  "infinix",
  "motorola",
  "tcl",
  "parlante",
  "bocina",
  "audifono",
  "aud\xEDfono",
  "belleza",
  "perfume",
  "maquillaje",
  "moto",
  "motocicleta"
];
function esPalabraReservadaEscuchar(texto) {
  const t = norm2(texto);
  return PALABRAS_RESERVADAS_ESCUCHAR.some((p) => new RegExp(`\\b${norm2(p)}\\b`).test(t));
}
__name(esPalabraReservadaEscuchar, "esPalabraReservadaEscuchar");
function detectaAcepta(texto) {
  if (detectaRechaza(texto)) return false;
  return /\bsi\b|\bsí\b|dale|\bok\b|claro|listo|acepto|autoriz|permiso|de\s*acuerdo|adelante|\bpuede\b|esta\s*bien|está\s*bien|\bva\b|perfecto|bueno/i.test(texto);
}
__name(detectaAcepta, "detectaAcepta");
function detectaRechaza(texto) {
  return /^no$|^no[,. ]|no\s+quiero|no\s+acepto|no\s+autoriz|no\s+permiso|no\s+puede/i.test(texto);
}
__name(detectaRechaza, "detectaRechaza");
function determinarFuente(referral, refQr, canal) {
  if (refQr) return "qr_" + refQr;
  if (referral?.source_type) {
    const url = String(referral.source_url || "").toLowerCase();
    if (url.includes("instagram")) return "instagram_ads";
    return "facebook_ads";
  }
  if (canal === "facebook_dm") return "facebook_dm";
  return "whatsapp_organico";
}
__name(determinarFuente, "determinarFuente");
function canalOrigenReal(fuente) {
  if (fuente === "facebook_ads" || fuente === "instagram_ads" || fuente === "facebook_dm") return fuente;
  return "whatsapp";
}
__name(canalOrigenReal, "canalOrigenReal");
function extraerDatosAnuncio(referral) {
  if (!referral) return {};
  return {
    anuncio_id: referral.source_id || void 0,
    anuncio_titulo: referral.headline || void 0,
    ctwa_clid: referral.ctwa_clid || void 0
  };
}
__name(extraerDatosAnuncio, "extraerDatosAnuncio");
function extraerNombre(texto) {
  if (esNombreDescartable(texto)) return null;
  const m = texto.match(/(?:soy\s+|me\s+llamo\s+|nombre[:\s]+|mi\s+nombre\s+(?:completo\s+)?es\s+)([A-Za-záéíóúÁÉÍÓÚñÑ\s]{3,40})/i) || texto.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ]{3,}(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]{2,}){0,3})$/m);
  if (!m) return null;
  const c = m[1].trim();
  const palabrasAccion = ["quiero", "necesito", "busco", "tengo", "dame", "para", "como", "esto", "cr\xE9dito", "credito", "contado", "samsung", "xiaomi", "celular", "equipo"];
  if (c.length < 5) return null;
  if (CIUDADES.some((x) => norm2(c).includes(norm2(x)))) return null;
  if (palabrasAccion.some((p) => norm2(c).includes(p))) return null;
  return c;
}
__name(extraerNombre, "extraerNombre");
function extraerCelular(texto) {
  const m = texto.match(/(?<!\d)3(?:[\s.\-]?\d){9}(?!\d)/);
  if (!m) return null;
  const limpio = m[0].replace(/[^\d]/g, "");
  return "57" + limpio;
}
__name(extraerCelular, "extraerCelular");
function extraerCedula(texto, sinCelular) {
  const limpio = sinCelular.replace(/[.,]/g, "");
  const m = limpio.match(/\b[0-9]{6,12}\b/);
  if (!m) return null;
  if (/^3\d{9}$/.test(m[0])) return null;
  return m[0];
}
__name(extraerCedula, "extraerCedula");
function pareceCelular(texto) {
  const limpio = texto.replace(/[.\s,\-]/g, "");
  return /^3\d{9}$/.test(limpio);
}
__name(pareceCelular, "pareceCelular");
function extraerCorreo(texto) {
  const m = texto.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}
__name(extraerCorreo, "extraerCorreo");
var MSG = {
  OPTIN: "\xA1Hola! Soy Sof\xEDa, de Creditek \u{1F60A} Te ayudo a llevarte tu celular nuevo hoy mismo. Antes de seguir, \xBFme autorizas guardar tus datos para contarte de nuestras promos?",
  OPTIN_NO: "Entendido, no hay problema \u{1F64F} Si cambias de opini\xF3n aqu\xED estamos. \xA1Que tengas un buen d\xEDa!",
  CIERRE_INTERES: "Entendido, no hay problema \u{1F64F} No te escribir\xE9 nuevamente sobre esta solicitud.",
  SOLO_PRODUCTOS: "Entiendo \u{1F60A} En Creditek no manejamos pr\xE9stamos de dinero en efectivo; te ayudamos a comprar celulares y otros equipos a cr\xE9dito.",
  // FIX v27, 13-jul-2026: antes preguntaba genérico "¿En qué te puedo ayudar
  // hoy?" — ignoraba que ~90% de los clientes van por un celular (dato real
  // de Oscar) y agregaba un paso conversacional de más. Ahora asume celular
  // por defecto (dejando espacio explícito para corregir) y salta directo a
  // la pregunta de ciudad, que es la que de verdad hace avanzar el flujo.
  BIENVENIDA: "\xA1Perfecto! Te ayudamos a conseguir tu celular nuevo \u2014 si buscabas otra cosa, d\xEDmelo aqu\xED mismo \u{1F60A} \xBFEn qu\xE9 ciudad est\xE1s?",
  BIENVENIDA_CONOCIDO: /* @__PURE__ */ __name((nombre) => `\xA1Hola ${nombre}! Qu\xE9 bueno que vuelves \u{1F60A} Te ayudamos a conseguir tu celular nuevo \u2014 si buscabas otra cosa, d\xEDmelo aqu\xED mismo. \xBFEn qu\xE9 ciudad est\xE1s?`, "BIENVENIDA_CONOCIDO"),
  CELULAR_FB: "\xBFMe regalas tu n\xFAmero de celular colombiano para atenderte mejor? \u{1F4F1}",
  CELULAR_FB_INVALIDO: "\xBFMe das tu celular? (10 d\xEDgitos, ej: 3001234567)",
  CIUDAD_PREGUNTA: "\xBFY en qu\xE9 ciudad est\xE1s? \u{1F60A}",
  SIN_COBERTURA: "Ahorita no tenemos tienda en esa ciudad, pero puede que te quede cerca una de estas: Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro o Cove\xF1as. \xBFCu\xE1l te queda m\xE1s cerca?",
  // FIX v24, 14-jul-2026 — Hallazgo 6: cierre honesto cuando el cliente dice
  // que ninguna de las 5 ciudades sugeridas le sirve — no se le fuerza un
  // handoff a un asesor lejano.
  SIN_ALIADO_CERCA: "Entendido, por ahora no tenemos un aliado cerca de ti, pero guardamos tu ciudad para avisarte apenas abramos algo por tu zona \u{1F64F}",
  // FIX v27, 22-jul-2026 — Bugs 1+3 del paquete FIX_Sofia_v27:
  //   Bug 1: nunca pedir celular — el auto-fill silencioso ya lo captura
  //          de la sesión WhatsApp (línea ~1196) y para Facebook DM se
  //          captura en el estado CELULAR_FB antes de llegar aquí.
  //          La firma anterior (pideCelular: boolean) tenía además un
  //          parámetro invertido: las 4 call sites pasaban
  //          `canal === 'whatsapp'` (true en WhatsApp), lo que hacía
  //          disparar la rama "with celular" JUSTO en el canal donde el
  //          celular ya se conoce — exactamente el bug reportado con
  //          evidencia del 21-jul-2026 22:04.
  //   Bug 3: redacción exacta pedida por Oscar — corta, natural, correo
  //          como opcional.
  //   DATOS_GENERAL queda como alias de DATOS_CREDITO (mismo texto, sigue
  //          referenciado por MODALIDAD_CIUDAD legacy).
  DATOS_CREDITO: "\xA1Claro que s\xED! Te conecto con un asesor, p\xE1same por favor nombre y c\xE9dula, y si tienes un correo tambi\xE9n",
  DATOS_CONTADO: "\xA1Perfecto! Te conecto con un asesor, p\xE1same tu nombre \u{1F60A}",
  DATOS_GENERAL: "\xA1Claro que s\xED! Te conecto con un asesor, p\xE1same por favor nombre y c\xE9dula, y si tienes un correo tambi\xE9n",
  FALTA_NOMBRE: "\xBFMe regalas tu nombre completo? \u{1F60A}",
  FALTA_CELULAR: "\xBFY tu n\xFAmero de celular activo?",
  CELULAR_CONFIRMA: "Tu n\xFAmero de contacto es este mismo, \xBFcierto? \u{1F60A}",
  // Fix v3 09-jul-2026: texto exacto definido por Oscar
  FALTA_CEDULA: "\xBFY tu n\xFAmero de c\xE9dula? (para el tr\xE1mite del cr\xE9dito)",
  // FIX v27, 22-jul-2026 — Bug 5 del paquete FIX_Sofia_v27: cuando el cliente
  // da un número que parece celular (3XX XXX XXXX) donde se esperaba cédula.
  CEDULA_PARECE_CELULAR: "Ese n\xFAmero parece un celular \u2014 \xBFme confirmas tu n\xFAmero de c\xE9dula?",
  // FIX v27.1, 22-jul-2026 — Bug 2 del paquete FIX_Sofia_v27_1: cliente
  // mencionó dos ciudades válidas en la misma frase y el flujo se quedaba
  // en silencio (evidencia real: 22-jul 09:45, teléfono 573116568994).
  CIUDAD_AMBIGUA: /* @__PURE__ */ __name((ciudades) => ciudades.length === 2 ? `Veo que mencionaste dos \u2014 \xBFcu\xE1l te queda mejor, ${ciudades[0]} o ${ciudades[1]}? \u{1F60A}` : `Veo que mencionaste varias \u2014 \xBFcu\xE1l te queda mejor: ${ciudades.slice(0, -1).join(", ")} o ${ciudades[ciudades.length - 1]}? \u{1F60A}`, "CIUDAD_AMBIGUA"),
  // Red de seguridad si en CIUDAD_MODAL ningún patrón conocido matchea.
  CIUDAD_REPETIR: "Disculpa, \xBFme confirmas cu\xE1l de estas te queda m\xE1s cerca: Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro o Cove\xF1as?",
  HANDOFF_MSG: /* @__PURE__ */ __name((nombre, asesor, nombreComercial, tel) => `Perfecto, ${nombre} \u{1F60A} Tu solicitud qued\xF3 registrada correctamente y fue asignada a ${nombreComercial}. ${asesor} continuar\xE1 tu proceso lo antes posible; tambi\xE9n puedes escribirle al ${tel}.`, "HANDOFF_MSG"),
  ASESOR_NO_CONTESTA: /* @__PURE__ */ __name((asesor2, tel2) => `\xA1Qu\xE9 raro! Te paso con otro asesor \u{1F60A} Escr\xEDbele a ${asesor2} al ${tel2} y dile que te mand\xF3 Sof\xEDa de Creditek.`, "ASESOR_NO_CONTESTA"),
  SIN_ASESOR: "En este momento no tenemos asesor disponible en tu zona. Te contactaremos pronto \u{1F64F}",
  VOZ: "Por favor escr\xEDbeme, no puedo escuchar mensajes de voz \u{1F60A}",
  FIN: "\xA1Con gusto! Si necesitas algo m\xE1s aqu\xED estoy \u{1F60A}",
  // FIX v24, 14-jul-2026 — ruta de motos (decisión de negocio de Oscar, no un
  // bug): Sofía no maneja motos en el flujo normal de celulares — conecta
  // directo con el contacto dedicado, sin pasar por captura de nombre/cédula/
  // celular ni asignación de tienda.
  MOTO_HANDOFF: "Para motos manejamos un contacto especial \u{1F60A} Escr\xEDbele directo a Vanesa Montiel (Sonivox / Ofero) al 3112712447 y le cuentas qu\xE9 buscas."
};
var index_default = {
  async scheduled(event, env2, ctx) {
    configurarEntorno(env2);
    if (event.cron === "0 13 * * *") {
      await marcarLeadsPerdidos(env2);
      return;
    }
    if (event.cron === "0 18 * * *") {
      await recordatorioAsesores(env2, "ronda_1pm");
      return;
    }
    if (event.cron === "0 22 * * *") {
      await recordatorioAsesores(env2, "ronda_5pm");
      return;
    }
    if (event.cron === "0 14 * * 1-5") {
      await recordatorioAsesores(env2, "ronda_9am");
      return;
    }
    if (event.cron === "*/30 * * * *") {
      await seguimientoLeadsMudos(env2);
      return;
    }
  },
  async fetch(request, env2) {
    try {
      configurarEntorno(env2);
    } catch (error) {
      return new Response(JSON.stringify({ error: "Configuraci\xF3n de entorno inv\xE1lida" }), { status: 503, headers: { "Content-Type": "application/json" } });
    }
    const url = new URL(request.url);
    const sk = env2.SUPABASE_SERVICE_KEY;
    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "Access-Control-Allow-Headers": "Content-Type, X-Worker-Secret", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname === "/__staging/test-handoff") {
      if (env2.ENVIRONMENT !== "staging") return new Response("Not found", { status: 404 });
      if (!env2.STAGING_TEST_SECRET || request.headers.get("X-Staging-Test-Secret") !== env2.STAGING_TEST_SECRET) {
        return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      }
      const body2 = await request.json();
      const allowed = /* @__PURE__ */ new Set(["success", "meta_reject", "ambiguous", "post_confirm_failure", "reassignment", "repeated_retry"]);
      if (!body2.scenario || !allowed.has(body2.scenario)) return new Response(JSON.stringify({ error: "Escenario inv\xE1lido" }), { status: 400, headers: cors });
      let metaCalls = 0;
      const key = `TEST-STAGING:${body2.scenario}:${crypto.randomUUID()}`;
      const evidenceIds = [];
      const send2 = /* @__PURE__ */ __name(async () => {
        metaCalls += 1;
        if (body2.scenario === "meta_reject") throw new Error("meta_rejected");
        if (body2.scenario === "ambiguous") throw new MetaDeliveryAmbiguousError();
        return `mock-${crypto.randomUUID()}`;
      }, "send");
      const input = { idempotencyKey: key, destinationId: "TEST-STAGING-TIENDA", destinationType: "tienda", origin: "staging_test" };
      let finalStatus = "error";
      let errorCode = null;
      const trace = [];
      try {
        if (body2.scenario === "post_confirm_failure") {
          let failFinalization = true;
          const fetcher = /* @__PURE__ */ __name(async (resource, init) => {
            const payload = init?.method === "PATCH" && typeof init.body === "string" ? JSON.parse(init.body) : null;
            if (failFinalization && payload?.status === "sent") {
              failFinalization = false;
              const forced = new Response("forced_post_confirmation_failure", { status: 500 });
              trace.push({ method: init?.method || "GET", operation: "forced_update_status_sent", status: forced.status, body_length: 30, body_empty: false });
              return forced;
            }
            const response = await fetch(resource, init);
            const bodyText = await response.clone().text();
            const path = new URL(resource.toString()).pathname;
            const operation = init?.method === "POST" ? "reserve_post" : init?.method === "PATCH" ? payload?.status === "sent" ? "update_status_sent" : "update_meta_confirmation" : "select_existing";
            let rowCount = null;
            let evidenceStatus = null;
            let hasMetaResponseId = null;
            let evidenceErrorCode = null;
            if (bodyText.trim()) {
              try {
                const rows2 = JSON.parse(bodyText);
                if (Array.isArray(rows2)) {
                  rowCount = rows2.length;
                  const row = rows2[0];
                  if (row) {
                    evidenceStatus = typeof row.status === "string" ? row.status : null;
                    hasMetaResponseId = typeof row.meta_response_id === "string" && row.meta_response_id.length > 0;
                    evidenceErrorCode = typeof row.error_code === "string" ? row.error_code : null;
                  }
                }
              } catch {
              }
            }
            trace.push({ method: init?.method || "GET", operation, path, status: response.status, body_length: bodyText.length, body_empty: bodyText.length === 0, row_count: rowCount, evidence_status: evidenceStatus, has_meta_response_id: hasMetaResponseId, error_code: evidenceErrorCode });
            return response;
          }, "fetcher");
          try {
            await procesarHandoffCertificado({ supabaseUrl: supabaseUrl(), serviceKey: sk, input, enviarMeta: send2, fetcher });
          } catch (error) {
            if (!(error instanceof HandoffPersistencePendingError)) throw error;
          }
          const recovered = await procesarHandoffCertificado({ supabaseUrl: supabaseUrl(), serviceKey: sk, input, enviarMeta: send2, fetcher });
          evidenceIds.push(recovered.evidenciaId);
          finalStatus = recovered.status;
        } else if (body2.scenario === "reassignment") {
          const initial = await procesarHandoffCertificado({ supabaseUrl: supabaseUrl(), serviceKey: sk, input, enviarMeta: send2 });
          evidenceIds.push(initial.evidenciaId);
          const audit = await reservarHandoff(supabaseUrl(), sk, {
            idempotencyKey: `${key}:reassignment`,
            destinationId: "TEST-STAGING-ALIADO",
            destinationType: "aliado",
            origin: "reassignment",
            reassignmentOf: initial.evidenciaId
          });
          evidenceIds.push(audit.evidencia.id);
          finalStatus = initial.status;
        } else if (body2.scenario === "repeated_retry") {
          const first = await procesarHandoffCertificado({ supabaseUrl: supabaseUrl(), serviceKey: sk, input, enviarMeta: send2 });
          evidenceIds.push(first.evidenciaId);
          finalStatus = first.status;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const retry = await procesarHandoffCertificado({ supabaseUrl: supabaseUrl(), serviceKey: sk, input, enviarMeta: send2 });
            finalStatus = retry.status;
          }
        } else {
          const result = await procesarHandoffCertificado({ supabaseUrl: supabaseUrl(), serviceKey: sk, input, enviarMeta: send2 });
          evidenceIds.push(result.evidenciaId);
          finalStatus = result.status;
        }
      } catch (error) {
        errorCode = clasificarErrorArnes(error);
        finalStatus = errorCode === "meta_delivery_manual_review" ? "manual_review" : "error";
      }
      const rows = evidenceIds.length ? await fetch(`${supabaseUrl()}/rest/v1/aura_sofia_outbox?id=in.(${evidenceIds.join(",")})&select=event_kind,status,meta_response_id,sent_confirmed_at,evidence_version,reassignment_of,error_code`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }) : null;
      if (rows && !rows.ok) return new Response(JSON.stringify({ error: "staging_outbox_unavailable" }), { status: 503, headers: cors });
      const outbox = rows ? await rows.json() : [];
      const certified = outbox.filter(esLeadCertificado);
      if (certified.length && certified.every((row) => row.status === "sent" && row.meta_response_id && row.evidence_version === 1)) {
        finalStatus = "sent";
        errorCode = null;
      }
      return new Response(JSON.stringify({
        scenario: body2.scenario,
        final_status: finalStatus,
        meta_call_count: metaCalls,
        certified_lead_count: certified.length,
        idempotency_key: key,
        reassignment_count: body2.scenario === "reassignment" ? 1 : 0,
        error_code: errorCode,
        ...body2.scenario === "post_confirm_failure" ? { trace } : {}
      }), { headers: cors });
    }
    const autorizado = !!env2.WORKER_SHARED_SECRET && request.headers.get("X-Worker-Secret") === env2.WORKER_SHARED_SECRET;
    if (url.pathname === "/api/stats" && request.method === "GET") {
      if (!autorizado) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      const pc = /* @__PURE__ */ __name((r) => parseInt(r.headers.get("Content-Range")?.split("/")[1] ?? "0", 10), "pc");
      const [a, b, c, d, e] = await Promise.all([
        fetch(`${supabaseUrl()}/rest/v1/clientes?select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } }),
        fetch(`${supabaseUrl()}/rest/v1/clientes?created_at=gte.${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } }),
        fetch(`${supabaseUrl()}/rest/v1/clientes?optin_datos=eq.true&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } }),
        fetch(`${supabaseUrl()}/rest/v1/clientes?estado_funnel=eq.lead_caliente&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } }),
        fetch(`${supabaseUrl()}/rest/v1/clientes?estado_funnel=eq.transferido_asesor&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } })
      ]);
      const leadsPendientes = pc(d);
      return new Response(JSON.stringify({
        total_clientes: pc(a),
        hoy: pc(b),
        optins: pc(c),
        leads: leadsPendientes,
        leads_pendientes: leadsPendientes,
        transferidos: pc(e)
      }), { headers: cors });
    }
    if (url.pathname === "/api/clients" && request.method === "GET") {
      if (!autorizado) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      const r = await fetch(`${supabaseUrl()}/rest/v1/clientes?select=*&order=created_at.desc&limit=100`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      return new Response(JSON.stringify(await r.json()), { headers: cors });
    }
    if (url.pathname === "/api/conversations" && request.method === "GET") {
      if (!autorizado) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      const tel = url.searchParams.get("telefono");
      const f = tel ? `telefono=eq.${encodeURIComponent(tel)}&` : "";
      const r = await fetch(`${supabaseUrl()}/rest/v1/conversaciones?${f}select=*&order=timestamp.desc&limit=200`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      return new Response(JSON.stringify(await r.json()), { headers: cors });
    }
    if (url.pathname === "/api/tiendas" && request.method === "GET") {
      if (!autorizado) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      const r = await fetch(`${supabaseUrl()}/rest/v1/tiendas?select=*`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      return new Response(JSON.stringify(await r.json()), { headers: cors });
    }
    if (url.pathname === "/api/ventas-por-anuncio" && request.method === "GET") {
      if (!autorizado) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      const [rTotal, rConAnuncio, rVentas] = await Promise.all([
        fetch(`${supabaseUrl()}/rest/v1/clientes?select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } }),
        fetch(`${supabaseUrl()}/rest/v1/clientes?anuncio_id=not.is.null&select=id`, { headers: { apikey: sk, Authorization: `Bearer ${sk}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } }),
        fetch(`${supabaseUrl()}/rest/v1/clientes?anuncio_id=not.is.null&select=anuncio_id&confirmacion_asesor=eq.venta_cerrada`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } })
      ]);
      const pc = /* @__PURE__ */ __name((r) => parseInt(r.headers.get("Content-Range")?.split("/")[1] ?? "0", 10), "pc");
      const ventasRows = await rVentas.json();
      const porAnuncio = {};
      ventasRows.forEach((v) => {
        porAnuncio[v.anuncio_id] = (porAnuncio[v.anuncio_id] || 0) + 1;
      });
      return new Response(JSON.stringify({
        total_clientes: pc(rTotal),
        con_anuncio_id: pc(rConAnuncio),
        ventas_por_anuncio: porAnuncio
      }), { headers: cors });
    }
    if (url.pathname === "/api/enviar-mensaje" && request.method === "POST") {
      if (!autorizado) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: cors });
      const { telefono, mensaje, meta_message_id: metaMessageId } = await request.json();
      if (!telefono || !mensaje?.trim()) {
        return new Response(JSON.stringify({ error: "Falta telefono o mensaje" }), { status: 400, headers: cors });
      }
      if (metaMessageId && !await reservarRecuperacionManual(env2.CONVERSATIONS, metaMessageId)) {
        return new Response(JSON.stringify({ error: "Recuperaci\xF3n ya respondida o ejecutada" }), { status: 409, headers: cors });
      }
      try {
        await enviarMensajeWA(telefono, mensaje.trim(), env2.PHONE_NUMBER_ID, env2.WHATSAPP_TOKEN);
        if (metaMessageId) await finalizarRecuperacionManual(env2.CONVERSATIONS, metaMessageId, "respondido");
      } catch (error) {
        if (metaMessageId) await finalizarRecuperacionManual(env2.CONVERSATIONS, metaMessageId, "error_envio");
        throw error;
      }
      await guardarConv({ telefono, contenido: mensaje.trim(), respondido_por: "admin", canal: "whatsapp" }, sk);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === env2.VERIFY_TOKEN) return new Response(challenge, { status: 200 });
      return new Response("Forbidden", { status: 403 });
    }
    if (request.method !== "POST") return new Response("OK", { status: 200 });
    const body = await request.json();
    const object = body?.object;
    if (object === "whatsapp_business_account") {
      const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return new Response("OK", { status: 200 });
      const msgId = msg.id;
      let auditoriaEvento = null;
      if (msgId) {
        const timestamp = Number(msg.timestamp) * 1e3;
        const reserva = await reservarEventoMeta(env2.CONVERSATIONS, {
          metaId: msgId,
          rutaEntrada: "webhook_whatsapp",
          fechaOriginal: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
        });
        auditoriaEvento = reserva.auditoria;
        if (!reserva.permitido) {
          console.warn("[IDEMPOTENCIA] evento bloqueado", {
            metaId: msgId,
            idInterno: reserva.auditoria.idInterno,
            rutaEntrada: "webhook_whatsapp",
            fechaOriginal: reserva.auditoria.fechaOriginal,
            fechaReintento: reserva.auditoria.fechaReintento,
            motivo: reserva.auditoria.motivo,
            resultadoFinal: reserva.auditoria.resultadoFinal
          });
          return new Response("OK", { status: 200 });
        }
      }
      const from = msg.from;
      if (msg.type !== "button") {
        const tiendaAdmin = await buscarTiendaPorTelefono(from, sk);
        if (tiendaAdmin) {
          const primerNombre = (tiendaAdmin.contacto || "").trim().split(/\s+/)[0] || "";
          const saludo = primerNombre ? `\xA1Hola ${primerNombre}!` : "\xA1Hola!";
          const linkRegistro = `https://oscarjp88-arch.github.io/consultora/creditek/erp/registro.html?origen=${encodeURIComponent(tiendaAdmin.id)}`;
          const respuestaAdmin = `${saludo} Aqu\xED tienes tu link de registro de clientes para ${tiendaAdmin.nombre_comercial || "tu tienda"}:
${linkRegistro}
Gu\xE1rdalo en favoritos \u{1F60A} \xBFNecesitas algo m\xE1s?`;
          await enviarMensajeWA(from, respuestaAdmin, env2.PHONE_NUMBER_ID, env2.WHATSAPP_TOKEN);
          if (auditoriaEvento) await actualizarAuditoriaEvento(env2.CONVERSATIONS, auditoriaEvento, "respondido", "respuesta de aliado enviada");
          console.warn("[ADMIN-ALIADO] link de registro enviado a", from);
          return new Response("OK", { status: 200 });
        }
      }
      if (msg.type === "button") {
        await manejarConfirmacionAsesor(msg, sk);
        if (auditoriaEvento) await actualizarAuditoriaEvento(env2.CONVERSATIONS, auditoriaEvento, "respondido", "confirmaci\xF3n de asesor procesada");
        return new Response("OK", { status: 200 });
      }
      if (msg.type === "audio") {
        await enviarMensajeWA(from, MSG.VOZ, env2.PHONE_NUMBER_ID, env2.WHATSAPP_TOKEN);
        if (auditoriaEvento) await actualizarAuditoriaEvento(env2.CONVERSATIONS, auditoriaEvento, "respondido", "respuesta de audio enviada");
        return new Response("OK", { status: 200 });
      }
      const MAPA_BOTON_RAPIDO = {
        optin_si: "acepto",
        optin_no: "no, gracias",
        credito: "cr\xE9dito",
        contado: "contado"
      };
      const esBotonRapido = msg.type === "interactive" && msg.interactive?.type === "button_reply";
      const botonId = esBotonRapido ? msg.interactive.button_reply.id : null;
      const texto = esBotonRapido ? MAPA_BOTON_RAPIDO[botonId || ""] ?? (msg.interactive.button_reply.title || "").trim() : (msg.text?.body ?? "").trim();
      if (!texto) return new Response("OK", { status: 200 });
      const qrMatch = texto.match(/tienda\s+(\S+)/i);
      const refQr = qrMatch ? qrMatch[1] : null;
      const referral = msg.referral || null;
      const doIdWA = env2.CONVERSACION_DO.idFromName(from);
      const doStubWA = env2.CONVERSACION_DO.get(doIdWA);
      try {
        const respuestaDO = await doStubWA.fetch("https://do/procesar", {
          method: "POST",
          body: JSON.stringify({ clienteId: from, texto, canal: "whatsapp", refQr, referral, auditoriaEvento })
        });
        if (!respuestaDO.ok) throw new Error(`ConversacionDO respondi\xF3 ${respuestaDO.status}`);
      } catch (error) {
        if (auditoriaEvento) await actualizarAuditoriaEvento(env2.CONVERSATIONS, auditoriaEvento, "error_envio", "procesamiento incompleto; requiere revisi\xF3n manual");
        console.error("[WEBHOOK-WA] procesamiento incompleto; no se reejecutar\xE1 l\xF3gica comercial autom\xE1ticamente:", error);
        throw error;
      }
      return new Response("OK", { status: 200 });
    }
    if (object === "page") {
      const messaging = body?.entry?.[0]?.messaging?.[0];
      if (!messaging?.message || messaging.message.is_echo) return new Response("OK", { status: 200 });
      const senderId = messaging.sender?.id;
      const texto = (messaging.message?.text ?? "").trim();
      if (!texto || !senderId) return new Response("OK", { status: 200 });
      const pageId = messaging.recipient?.id;
      const msgId = messaging.message?.mid;
      let auditoriaEvento = null;
      if (msgId) {
        const reserva = await reservarEventoMeta(env2.CONVERSATIONS, {
          metaId: msgId,
          rutaEntrada: "webhook_messenger",
          fechaOriginal: messaging.timestamp ? new Date(Number(messaging.timestamp)).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
        });
        auditoriaEvento = reserva.auditoria;
        if (!reserva.permitido) return new Response("OK", { status: 200 });
      }
      const doIdFB = env2.CONVERSACION_DO.idFromName("fb_" + senderId);
      const doStubFB = env2.CONVERSACION_DO.get(doIdFB);
      await doStubFB.fetch("https://do/procesar", {
        method: "POST",
        body: JSON.stringify({ clienteId: "fb_" + senderId, texto, canal: "facebook_dm", refQr: null, referral: null, pageId, auditoriaEvento })
      });
      return new Response("OK", { status: 200 });
    }
    return new Response("OK", { status: 200 });
  }
};
async function procesarMensaje(clienteId, texto, canal, refQr, referral, sendFn, env2, sk) {
  const raw = await env2.CONVERSATIONS.get(clienteId);
  let conv = raw ? JSON.parse(raw) : null;
  const ahora = Date.now();
  const esNueva = debeIniciarConversacion(
    conv ? { estado: conv.estado, ultimoMensaje: conv.ultimo_mensaje } : null
  );
  if (esNueva) {
    const clienteExistente = conv;
    const db = await buscarCliente(clienteId, sk);
    const optinYaAceptado = clienteExistente?.optin_aceptado ?? (db?.optin_datos ?? false);
    conv = {
      estado: optinYaAceptado ? "FIN" : "OPTIN",
      canal,
      historial: [],
      ultimo_mensaje: ahora,
      nombre: db?.nombre ?? clienteExistente?.nombre ?? void 0,
      celular: db?.celular ?? clienteExistente?.celular ?? void 0,
      optin_aceptado: optinYaAceptado,
      // FIX v20, 13-jul-2026: si el cliente ya existía (en esta conversación o
      // en Supabase), se conserva su fuente real ya registrada en vez de
      // recalcularla a ciegas con el mensaje actual — esto evitaba que un
      // cliente de Facebook, al escribir su primer mensaje por WhatsApp real
      // (nuevo Durable Object, sin historial), quedara reclasificado como
      // whatsapp_organico. determinarFuente() solo se usa para clientes
      // genuinamente nuevos, sin registro previo.
      fuente: clienteExistente?.fuente ?? db?.fuente ?? determinarFuente(referral, refQr, canal),
      // FIX 5, 03-jul-2026 / FIX v20, 13-jul-2026
      ...extraerDatosAnuncio(referral),
      tiendas_intentadas: []
    };
    if (refQr) {
      const t = await buscarTiendaQR(refQr, sk);
      if (t) {
        conv.tienda_id = t.id;
        conv.tienda_nombre = t.nombre;
        conv.tienda_nombre_comercial = t.nombre_comercial;
        conv.tienda_genero = t.genero;
        conv.tienda_tipo = t.tipo;
        conv.tienda_contacto = t.contacto;
        conv.tienda_telefono = t.telefono;
        conv.ciudad = t.ciudad;
      }
    }
  }
  conv.ultimo_mensaje = ahora;
  conv.ultimo_paso = conv.estado;
  conv.ultima_respuesta_cliente = texto;
  const save = /* @__PURE__ */ __name(() => {
    conv.ultimo_paso = conv.estado;
    return env2.CONVERSATIONS.put(clienteId, JSON.stringify(conv), { expirationTtl: 86400 * 7 });
  }, "save");
  await guardarConv({ telefono: clienteId, contenido: texto, respondido_por: null, canal }, sk);
  const push = /* @__PURE__ */ __name((quien, msg) => {
    conv.historial.push(quien + ": " + msg.substring(0, 200));
    if (conv.historial.length > 12) conv.historial = conv.historial.slice(-12);
  }, "push");
  push("Cliente", texto);
  let respuesta = "";
  let botones;
  if (conv.estado !== "OPTIN" && conv.estado !== "HANDOFF" && detectaCierreComercial(texto)) {
    conv.estado = "FIN";
    respuesta = MSG.CIERRE_INTERES;
    await actualizarCliente(clienteId, {
      estado_funnel: "perdido",
      razon_perdida: "rechazo_cliente",
      recordatorio_enviado_at: (/* @__PURE__ */ new Date()).toISOString()
    }, sk);
    await sendFn(respuesta);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: "bot", canal }, sk);
    push("Sofia", respuesta);
    await save();
    return;
  }
  const departamento = detectarDepartamento(texto);
  if (conv.optin_aceptado && departamento && !conv.municipio && ["ESCUCHAR", "CIUDAD_MODAL", "CIUDAD"].includes(conv.estado)) {
    conv.departamento = departamento;
    conv.estado = "CIUDAD_MODAL";
    respuesta = preguntaPendiente({
      optinAceptado: true,
      departamento
    }) || MSG.CIUDAD_PREGUNTA;
    conv.ultima_pregunta = respuesta;
    await sendFn(respuesta);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: "bot", canal }, sk);
    push("Sofia", respuesta);
    await save();
    return;
  }
  if (esMensajeCortoContextual(texto) && ["ESCUCHAR", "CIUDAD_MODAL", "CIUDAD"].includes(conv.estado) && !conv.municipio && !conv.tienda_id) {
    respuesta = preguntaPendiente({
      optinAceptado: conv.optin_aceptado,
      departamento: conv.departamento
    }) || MSG.CIUDAD_PREGUNTA;
    conv.ultima_pregunta = respuesta;
    await sendFn(respuesta);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: "bot", canal }, sk);
    push("Sofia", respuesta);
    await save();
    return;
  }
  if (conv.optin_aceptado && conv.estado !== "OPTIN") {
    const respuestaContinuidad = resolverPreguntaDeContinuidad(texto, {
      optinAceptado: conv.optin_aceptado,
      nombre: conv.nombre,
      cedula: conv.cedula,
      departamento: conv.departamento,
      municipio: conv.municipio || conv.ciudad,
      tiendaAsignada: !!conv.tienda_id,
      tiendaNombre: conv.tienda_nombre_comercial || conv.tienda_nombre,
      leadCreado: conv.lead_creado || conv.estado === "HANDOFF",
      modalidad: conv.modalidad
    });
    if (respuestaContinuidad) {
      const siguiente = conv.lead_creado || conv.estado === "HANDOFF" ? null : preguntaPendiente({
        optinAceptado: conv.optin_aceptado,
        nombre: conv.nombre,
        cedula: conv.cedula,
        departamento: conv.departamento,
        municipio: conv.municipio || conv.ciudad,
        tiendaAsignada: !!conv.tienda_id,
        leadCreado: conv.lead_creado,
        modalidad: conv.modalidad
      });
      respuesta = siguiente ? `${respuestaContinuidad}

${siguiente}` : respuestaContinuidad;
      conv.ultima_pregunta = siguiente || void 0;
      await sendFn(respuesta);
      await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: "bot", canal }, sk);
      push("Sofia", respuesta);
      await save();
      return;
    }
  }
  switch (conv.estado) {
    // ── OPTIN ────────────────────────────────────────────────────────────────
    case "OPTIN": {
      if (conv.optin_aceptado) {
        const n = (conv.nombre || "").split(" ")[0];
        respuesta = n ? MSG.BIENVENIDA_CONOCIDO(n) : MSG.BIENVENIDA;
        if (canal !== "facebook_dm" && !conv.producto_interes) conv.producto_interes = "celular (asumido)";
        conv.estado = canal === "facebook_dm" ? "CELULAR_FB" : "ESCUCHAR";
        break;
      }
      if (conv.historial.length <= 1) {
        respuesta = MSG.OPTIN;
        if (canal === "whatsapp") {
          botones = [
            { id: "optin_si", title: "\u2705 Acepto" },
            { id: "optin_no", title: "\u274C No, gracias" }
          ];
        }
        await upsertCliente({
          telefono: clienteId,
          fuente: conv.fuente,
          canal_origen: canalOrigenReal(conv.fuente),
          anuncio_id: conv.anuncio_id,
          anuncio_titulo: conv.anuncio_titulo,
          ctwa_clid: conv.ctwa_clid,
          meta_source_url: referral?.source_url || null,
          meta_ctwa_clid: referral?.ctwa_clid || null
          // FIX v1, 07-jul-2026: guardar dato crudo de Meta para auditar atribución
        }, sk);
        break;
      }
      if (detectaRechaza(texto)) {
        await upsertCliente({
          telefono: clienteId,
          optin_datos: false,
          fuente: conv.fuente,
          canal_origen: canalOrigenReal(conv.fuente),
          estado_funnel: "perdido",
          razon_perdida: "rechazo_cliente",
          recordatorio_enviado_at: (/* @__PURE__ */ new Date()).toISOString()
        }, sk);
        conv.estado = "FIN";
        respuesta = MSG.OPTIN_NO;
      } else if (detectaAcepta(texto)) {
        conv.optin_aceptado = true;
        await upsertCliente({ telefono: clienteId, optin_datos: true, optin_operativo: true, optin_comercial: true, fuente: conv.fuente, canal_origen: canalOrigenReal(conv.fuente) }, sk);
        await avanzarEstadoFunnel(clienteId, "contactado", sk);
        if (canal === "facebook_dm") {
          conv.estado = "CELULAR_FB";
          respuesta = MSG.CELULAR_FB;
        } else if (conv.tienda_id) {
          if (!conv.producto_interes) conv.producto_interes = "celular (asumido)";
          conv.estado = "ESCUCHAR";
          respuesta = MSG.BIENVENIDA;
        } else {
          if (!conv.producto_interes) conv.producto_interes = "celular (asumido)";
          conv.estado = "ESCUCHAR";
          respuesta = MSG.BIENVENIDA;
        }
      } else {
        conv.intentos_optin = (conv.intentos_optin || 0) + 1;
        if (conv.intentos_optin >= 2) {
          conv.estado = "FIN";
          respuesta = MSG.OPTIN_NO;
          break;
        }
        respuesta = MSG.OPTIN;
        if (canal === "whatsapp") {
          botones = [
            { id: "optin_si", title: "\u2705 Acepto" },
            { id: "optin_no", title: "\u274C No, gracias" }
          ];
        }
      }
      break;
    }
    // ── CELULAR_FB ───────────────────────────────────────────────────────────
    case "CELULAR_FB": {
      const cel = extraerCelular(texto);
      if (cel) {
        conv.celular = cel;
        await upsertCliente({ telefono: cel, optin_datos: true, fuente: "facebook_dm", canal_origen: "facebook_dm" }, sk);
        if (!conv.producto_interes) conv.producto_interes = "celular (asumido)";
        conv.estado = "ESCUCHAR";
        respuesta = MSG.BIENVENIDA;
      } else {
        respuesta = MSG.CELULAR_FB_INVALIDO;
      }
      break;
    }
    // ── ESCUCHAR ─────────────────────────────────────────────────────────────
    case "ESCUCHAR": {
      if (detectaSolicitudDinero(texto)) {
        respuesta = MSG.SOLO_PRODUCTOS;
        break;
      }
      const mencionaMoto = /\bmotos?\b|\bmotocicletas?\b/i.test(texto);
      const niegaMoto = /\bno\b[^.!?]{0,25}\bmotos?\b/i.test(texto);
      if (mencionaMoto && !niegaMoto) {
        respuesta = MSG.MOTO_HANDOFF;
        conv.estado = "FIN";
        break;
      }
      let ciudadMen = detectaCiudad(texto);
      let sinCobertura = false;
      const textoSinModalidadEscuchar = texto.replace(/cr[eé]d\w{0,3}to|acredit|financiad|cuota|plazo|mensual|abono|\bcontado\b|efectivo|de una|pago\s*(completo|total)/gi, "").replace(/[!¡?¿.,]+/g, "").trim();
      const posibleCiudadEscuchar = textoSinModalidadEscuchar;
      const pareceIntentoCiudad = !ciudadMen && !conv.tienda_id && posibleCiudadEscuchar.length > 2 && posibleCiudadEscuchar.split(/\s+/).length <= 4 && pareceCiudad(posibleCiudadEscuchar) && !esPalabraReservadaEscuchar(posibleCiudadEscuchar) && !/^(de|del|para|con|sin)\b/i.test(posibleCiudadEscuchar) && !detectaAcepta(posibleCiudadEscuchar) && !detectaRechaza(posibleCiudadEscuchar);
      if (pareceIntentoCiudad) {
        const intento = await buscarTiendaRandom(posibleCiudadEscuchar, [], sk);
        if (intento) {
          conv.tienda_id = intento.id;
          conv.tienda_nombre = intento.nombre;
          conv.tienda_nombre_comercial = intento.nombre_comercial;
          conv.tienda_genero = intento.genero;
          conv.tienda_tipo = intento.tipo;
          conv.tienda_contacto = intento.contacto;
          conv.tienda_telefono = intento.telefono;
          conv.ciudad = intento.ciudad;
          conv.municipio = intento.ciudad;
          await registrarTiendaAsignada(clienteId, intento, sk);
          ciudadMen = intento.ciudad;
        } else {
          sinCobertura = true;
          conv.ciudad_original = posibleCiudadEscuchar;
          conv.municipio = posibleCiudadEscuchar;
          await actualizarCliente(clienteId, { ciudad_original: posibleCiudadEscuchar }, sk);
        }
      }
      if (texto.length > 2 && !ciudadMen && !sinCobertura) conv.producto_interes = texto;
      if (ciudadMen && !conv.tienda_id) {
        const t = await buscarTiendaRandom(ciudadMen, [], sk);
        if (t) {
          conv.tienda_id = t.id;
          conv.tienda_nombre = t.nombre;
          conv.tienda_nombre_comercial = t.nombre_comercial;
          conv.tienda_genero = t.genero;
          conv.tienda_tipo = t.tipo;
          conv.tienda_contacto = t.contacto;
          conv.tienda_telefono = t.telefono;
          conv.ciudad = t.ciudad;
          conv.municipio = t.ciudad;
          await registrarTiendaAsignada(clienteId, t, sk);
        }
      }
      if (detectaCredito(texto)) conv.modalidad = "credito";
      else if (detectaContado(texto)) conv.modalidad = "contado";
      if (sinCobertura) {
        conv.estado = "CIUDAD_MODAL";
        respuesta = MSG.SIN_COBERTURA;
        break;
      }
      const ctx = {
        estado: "ESCUCHAR",
        historial: conv.historial,
        ciudad: conv.ciudad,
        tienda: conv.tienda_nombre,
        nombre: conv.nombre,
        modalidad: conv.modalidad,
        producto: conv.producto_interes,
        ciudadesCubiertas: await obtenerCiudadesCubiertas(sk)
        // FIX 04-jul-2026
      };
      const respClaude = await generarRespuesta("ESCUCHAR", texto, ctx, env2.ANTHROPIC_API_KEY);
      if (conv.modalidad && conv.tienda_id) {
        conv.estado = "DATOS_MIN";
        const pedirDatos = conv.modalidad === "contado" ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
        respuesta = respClaude + "\n\n" + pedirDatos;
      } else if (conv.modalidad && !conv.tienda_id) {
        conv.estado = "CIUDAD_MODAL";
        respuesta = respClaude + "\n\n\xBFY en qu\xE9 ciudad est\xE1s? \u{1F60A}";
      } else if (!conv.modalidad && conv.tienda_id) {
        conv.modalidad = "credito";
        conv.estado = "DATOS_MIN";
        respuesta = respClaude + "\n\n" + MSG.DATOS_CREDITO;
      } else {
        conv.modalidad = "credito";
        conv.estado = "CIUDAD_MODAL";
        respuesta = respClaude + "\n\n" + MSG.CIUDAD_PREGUNTA;
      }
      break;
    }
    // ── MODALIDAD (legado — solo alcanzable por conversaciones ya en curso) ─
    // FIX v27, 22-jul-2026 — Bug 4 del paquete FIX_Sofia_v27: ya no se
    // transiciona a MODALIDAD desde ESCUCHAR ni CIUDAD_MODAL. Este case
    // se conserva SOLO para conversaciones que ya estaban aquí al momento
    // del deploy — el detector pasivo detectaCredito/detectaContado se
    // respeta, pero si no matchea se asume crédito y se avanza (nunca
    // se repregunta activamente crédito/contado).
    case "MODALIDAD": {
      if (texto.length > 2 && !conv.producto_interes) conv.producto_interes = texto;
      if (detectaCredito(texto)) conv.modalidad = "credito";
      else if (detectaContado(texto)) conv.modalidad = "contado";
      else conv.modalidad = "credito";
      if (conv.tienda_id) {
        conv.estado = "DATOS_MIN";
        respuesta = conv.modalidad === "contado" ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
      } else {
        conv.estado = "CIUDAD_MODAL";
        respuesta = conv.ciudad_original ? MSG.SIN_COBERTURA : MSG.CIUDAD_PREGUNTA;
      }
      break;
    }
    // ── MODALIDAD_CIUDAD (legado — solo para conversaciones ya en curso) ─────
    case "MODALIDAD_CIUDAD": {
      if (texto.length > 2 && !conv.producto_interes) conv.producto_interes = texto;
      if (detectaCredito(texto)) conv.modalidad = "credito";
      else if (detectaContado(texto)) conv.modalidad = "contado";
      const textoSinModalidad = texto.replace(/cr[eé]dito|financiad|cuota|plazo|mensual|abono|\bcontado\b|efectivo|de una|pago\s*(completo|total)/gi, "").replace(/[!¡?¿.,]+/g, "").trim();
      const posibleCiudad = detectaCiudad(texto) || textoSinModalidad;
      const intentoCiudad = posibleCiudad.length > 2 && pareceCiudad(texto);
      let tiendaNoEncontrada = false;
      if (!conv.tienda_id && intentoCiudad) {
        const t = await buscarTiendaRandom(posibleCiudad, conv.tiendas_intentadas || [], sk);
        if (t) {
          conv.tienda_id = t.id;
          conv.tienda_nombre = t.nombre;
          conv.tienda_nombre_comercial = t.nombre_comercial;
          conv.tienda_genero = t.genero;
          conv.tienda_tipo = t.tipo;
          conv.tienda_contacto = t.contacto;
          conv.tienda_telefono = t.telefono;
          conv.ciudad = t.ciudad;
          await registrarTiendaAsignada(clienteId, t, sk);
        } else {
          tiendaNoEncontrada = true;
        }
      }
      if (conv.modalidad && conv.tienda_id) {
        conv.estado = "DATOS_MIN";
        const pedirDatos = conv.modalidad === "contado" ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
        respuesta = pedirDatos;
      } else if (tiendaNoEncontrada && conv.modalidad) {
        conv.estado = "CIUDAD_MODAL";
        respuesta = MSG.SIN_COBERTURA;
      } else if (tiendaNoEncontrada && !conv.modalidad) {
        respuesta = MSG.SIN_COBERTURA + "\n\n\xBFLo quieres a cr\xE9dito o de contado? \u{1F60A}";
        if (canal === "whatsapp") {
          botones = [{ id: "credito", title: "\u{1F4B3} Cr\xE9dito" }, { id: "contado", title: "\u{1F4B5} Contado" }];
        }
      } else if (conv.modalidad && !conv.tienda_id) {
        conv.estado = "CIUDAD_MODAL";
        respuesta = "\xBFY en qu\xE9 ciudad est\xE1s? \u{1F60A}";
      } else if (!conv.modalidad && conv.tienda_id) {
        respuesta = "\xBFLo vas a pagar a cr\xE9dito o de contado? \u{1F60A}";
        if (canal === "whatsapp") {
          botones = [{ id: "credito", title: "\u{1F4B3} Cr\xE9dito" }, { id: "contado", title: "\u{1F4B5} Contado" }];
        }
      } else if (!intentoCiudad) {
        const ctx = {
          estado: "MODALIDAD_CIUDAD",
          historial: conv.historial,
          ciudad: conv.ciudad,
          tienda: conv.tienda_nombre,
          nombre: conv.nombre,
          modalidad: conv.modalidad,
          producto: conv.producto_interes
        };
        const respClaude = await generarRespuesta("MODALIDAD_CIUDAD", texto, ctx, env2.ANTHROPIC_API_KEY);
        respuesta = respClaude + "\n\n\xBFLo quieres a cr\xE9dito o de contado? \xBFY en qu\xE9 ciudad est\xE1s? \u{1F60A}";
      } else {
        respuesta = "\xBFLo quieres a cr\xE9dito o de contado? \xBFY en qu\xE9 ciudad est\xE1s? \u{1F60A}";
      }
      break;
    }
    // ── CIUDAD_MODAL ─────────────────────────────────────────────────────────
    case "CIUDAD_MODAL": {
      if (conv.modelo_pendiente && detectaAcepta(texto)) {
        conv.producto_interes = conv.modelo_pendiente;
        conv.modelo_pendiente = void 0;
        respuesta = MSG.CIUDAD_REPETIR;
        break;
      }
      if (conv.modelo_pendiente && detectaRechaza(texto)) {
        conv.modelo_pendiente = void 0;
        respuesta = MSG.CIUDAD_REPETIR;
        break;
      }
      if (pareceReferenciaProducto(texto)) {
        const reenganche = resolverReengancheFin(conv, texto);
        conv.estado = reenganche.estado;
        conv.producto_interes = reenganche.producto_interes;
        conv.modelo_pendiente = reenganche.modelo_pendiente;
        respuesta = reenganche.respuesta;
        break;
      }
      conv.modelo_pendiente = void 0;
      const ciudadTexto = texto.trim().replace(/[!¡?¿.,]+/g, "").trim();
      const tNorm = norm2(ciudadTexto);
      const canonicasAlias = [
        { alias: /\btolu\b/, canonica: "Tol\xFA" },
        { alias: /\bcorozal\b/, canonica: "Corozal" },
        { alias: /\bchinu\b/, canonica: "Chin\xFA" },
        { alias: /\bcienaga(?:\s+de\s+oro)?\b/, canonica: "Ci\xE9naga de Oro" },
        { alias: /\bcoven(?:as)?\b/, canonica: "Cove\xF1as" }
      ];
      const ciudadesMencionadas = canonicasAlias.map((x) => ({ canonica: x.canonica, pos: tNorm.search(x.alias) })).filter((x) => x.pos >= 0).sort((a, b) => a.pos - b.pos).map((x) => x.canonica);
      if (ciudadesMencionadas.length >= 2) {
        respuesta = MSG.CIUDAD_AMBIGUA(ciudadesMencionadas);
        break;
      }
      const tienda = await buscarTiendaRandom(ciudadTexto, conv.tiendas_intentadas || [], sk);
      if (tienda) {
        conv.tienda_id = tienda.id;
        conv.tienda_nombre = tienda.nombre;
        conv.tienda_nombre_comercial = tienda.nombre_comercial;
        conv.tienda_genero = tienda.genero;
        conv.tienda_tipo = tienda.tipo;
        conv.tienda_contacto = tienda.contacto;
        conv.tienda_telefono = tienda.telefono;
        conv.ciudad = tienda.ciudad;
        conv.municipio = tienda.ciudad;
        await registrarTiendaAsignada(clienteId, tienda, sk);
        if (!conv.modalidad) conv.modalidad = "credito";
        conv.estado = "DATOS_MIN";
        respuesta = conv.modalidad === "contado" ? MSG.DATOS_CONTADO : MSG.DATOS_CREDITO;
      } else {
        const yaTeniaSinCobertura = !!conv.ciudad_original;
        conv.ciudad_original = ciudadTexto;
        conv.municipio = ciudadTexto;
        const yaMandoSinCobertura = yaTeniaSinCobertura || conv.historial.some((h) => h.startsWith("Sofia: ") && h.includes("no tenemos tienda en esa ciudad"));
        if (yaMandoSinCobertura) {
          conv.estado = "FIN";
          respuesta = MSG.SIN_ALIADO_CERCA;
        } else {
          respuesta = MSG.SIN_COBERTURA;
        }
        await actualizarCliente(clienteId, { ciudad_original: ciudadTexto }, sk);
      }
      if (!respuesta) respuesta = MSG.CIUDAD_REPETIR;
      break;
    }
    // ── DATOS_MIN ────────────────────────────────────────────────────────────
    case "DATOS_MIN": {
      if (esIntencionMoto(texto)) {
        respuesta = MSG.MOTO_HANDOFF;
        conv.estado = "FIN";
        break;
      }
      if (esConsultaDuranteCaptura(texto)) {
        const fija = respuestaConsultaFrecuenteDuranteCaptura(texto);
        const ctx = {
          estado: "DATOS_MIN",
          historial: conv.historial,
          ciudad: conv.ciudad,
          tienda: conv.tienda_nombre,
          nombre: conv.nombre,
          modalidad: conv.modalidad,
          producto: conv.producto_interes,
          soloResponderDuda: true
        };
        const respuestaDuda = fija || await generarRespuesta("DATOS_MIN", texto, ctx, env2.ANTHROPIC_API_KEY);
        const siguienteDato = !conv.nombre ? MSG.FALTA_NOMBRE : conv.modalidad === "credito" && !conv.cedula ? MSG.FALTA_CEDULA : "";
        respuesta = siguienteDato ? `${respuestaDuda}

${siguienteDato}` : respuestaDuda;
        break;
      }
      const correo = extraerCorreo(texto);
      const textoSinCorreo = correo ? texto.replace(correo, "") : texto;
      const celular = extraerCelular(textoSinCorreo);
      const textoSinCel = celular ? textoSinCorreo.replace(celular.replace("57", ""), "") : textoSinCorreo;
      const cedula = extraerCedula(textoSinCorreo, textoSinCel);
      const textoSinCelNiCedula = cedula ? textoSinCel.replace(cedula, "") : textoSinCel;
      const textoParaNombre = textoSinCelNiCedula.replace(/\bC\.?C\.?\b|\bc[eé]dula\b|\bcelular\b|\by\s+mi\b|\bmi\b/gi, "").replace(/[,.:;]/g, "").replace(/\s{2,}/g, " ").trim();
      const datosAgrupados = extraerDatosMinimos(texto);
      const nombre = extraerNombre(textoParaNombre) || extraerNombre(texto) || datosAgrupados.nombre;
      const cedulaFinal = datosAgrupados.cedula && (!cedula || datosAgrupados.cedula.length > cedula.length) ? datosAgrupados.cedula : cedula;
      const celularFinal = celular || datosAgrupados.celular;
      const correoFinal = correo || datosAgrupados.correo;
      if (nombre && !conv.nombre) conv.nombre = nombre;
      if (celularFinal && !conv.celular) conv.celular = celularFinal;
      if (cedulaFinal && !conv.cedula) conv.cedula = cedulaFinal;
      if (correoFinal && !conv.correo) conv.correo = correoFinal;
      if (!celular && !conv.celular && canal === "whatsapp") {
        conv.celular = clienteId;
      }
      const upd = {};
      if (conv.nombre) upd.nombre = conv.nombre;
      if (conv.celular) upd.telefono_contacto = conv.celular;
      if (conv.cedula) upd.cedula = conv.cedula;
      await actualizarCliente(clienteId, upd, sk);
      if (conv.nombre || conv.cedula) {
        await avanzarEstadoFunnel(clienteId, "lead_caliente", sk);
      }
      const faltaCelular = !conv.celular;
      if (faltaCelular) {
        respuesta = canal === "whatsapp" && !detectaRechaza(texto) ? MSG.CELULAR_CONFIRMA : MSG.FALTA_CELULAR;
        break;
      }
      const faltaNombre = !conv.nombre;
      const faltaCedula = conv.modalidad === "credito" && !conv.cedula;
      if (faltaNombre) {
        respuesta = MSG.FALTA_NOMBRE;
        break;
      }
      if (faltaCedula) {
        respuesta = pareceCelular(texto) ? MSG.CEDULA_PARECE_CELULAR : MSG.FALTA_CEDULA;
        break;
      }
      if (!conv.tienda_id) {
        conv.estado = "CIUDAD";
        respuesta = MSG.CIUDAD_PREGUNTA;
        break;
      }
      await hacerHandoff(conv, clienteId, sendFn, env2, sk, canal);
      await save();
      return;
    }
    // ── CIUDAD ───────────────────────────────────────────────────────────────
    case "CIUDAD": {
      const ciudadTexto = texto.trim().replace(/[!¡?¿.,]+/g, "").trim();
      const tienda = await buscarTiendaRandom(ciudadTexto, conv.tiendas_intentadas || [], sk);
      if (tienda) {
        conv.tienda_id = tienda.id;
        conv.tienda_nombre = tienda.nombre;
        conv.tienda_nombre_comercial = tienda.nombre_comercial;
        conv.tienda_genero = tienda.genero;
        conv.tienda_tipo = tienda.tipo;
        conv.tienda_contacto = tienda.contacto;
        conv.tienda_telefono = tienda.telefono;
        conv.ciudad = tienda.ciudad;
        conv.municipio = tienda.ciudad;
        await registrarTiendaAsignada(clienteId, tienda, sk);
        await hacerHandoff(conv, clienteId, sendFn, env2, sk, canal);
        await save();
        return;
      } else {
        const yaTeniaSinCobertura = !!conv.ciudad_original;
        conv.ciudad_original = ciudadTexto;
        conv.municipio = ciudadTexto;
        await actualizarCliente(clienteId, { ciudad_original: ciudadTexto }, sk);
        const yaMandoSinCobertura = yaTeniaSinCobertura || conv.historial.some((h) => h.startsWith("Sofia: ") && h.includes("no tenemos tienda en esa ciudad"));
        if (yaMandoSinCobertura) {
          conv.estado = "FIN";
          respuesta = MSG.SIN_ALIADO_CERCA;
        } else {
          respuesta = MSG.SIN_COBERTURA;
        }
      }
      break;
    }
    // ── HANDOFF ──────────────────────────────────────────────────────────────
    case "HANDOFF": {
      const noContesto = /no.*contest|no.*respond|no.*llama|no.*escrib/i.test(texto);
      if (noContesto) {
        const siguiente = await buscarTiendaRandom(conv.ciudad || "", conv.tiendas_intentadas || [], sk);
        if (siguiente) {
          conv.tienda_id = siguiente.id;
          conv.tienda_nombre = siguiente.nombre;
          conv.tienda_nombre_comercial = siguiente.nombre_comercial;
          conv.tienda_genero = siguiente.genero;
          conv.tienda_tipo = siguiente.tipo;
          conv.tienda_contacto = siguiente.contacto;
          conv.tienda_telefono = siguiente.telefono;
          (conv.tiendas_intentadas || []).push(siguiente.id);
          const nombreAsesor = siguiente.contacto.split(" ")[0];
          respuesta = MSG.ASESOR_NO_CONTESTA(nombreAsesor, siguiente.telefono);
          const inicial = await buscarHandoffInicial(supabaseUrl(), sk, clienteId);
          if (inicial?.id) {
            try {
              await procesarHandoffCertificado({
                supabaseUrl: supabaseUrl(),
                serviceKey: sk,
                input: {
                  idempotencyKey: `advisor_reassignment:${clienteId}:${siguiente.id}`,
                  destinationId: siguiente.id,
                  destinationType: siguiente.tipo === "aliado" ? "aliado" : "tienda",
                  origin: "reassignment",
                  reassignmentOf: inicial.id
                },
                enviarMeta: /* @__PURE__ */ __name(() => notificarAsesor(conv, siguiente, env2), "enviarMeta")
              });
            } catch {
              console.warn("[HANDOFF-REASSIGNMENT] persistencia pendiente o env\xEDo no confirmado");
            }
          } else {
            console.warn("[HANDOFF-REASSIGNMENT] sin evidencia inicial; revisi\xF3n manual");
          }
        } else {
          respuesta = MSG.SIN_ASESOR;
        }
      } else if (tieneIntencionReal(texto)) {
        const nombreAsesor = (conv.tienda_contacto || "").split(" ")[0] || "tu asesor";
        respuesta = mensajeConsultaAsesor(texto, nombreAsesor, conv.tienda_telefono || "");
      } else {
        respuesta = MSG.FIN;
      }
      break;
    }
    // ── FIN ──────────────────────────────────────────────────────────────────
    case "FIN": {
      if (esMensajeCortoContextual(texto) || !tieneIntencionReal(texto)) {
        respuesta = MSG.FIN;
        break;
      }
      if (pareceReferenciaProducto(texto)) {
        const reenganche = resolverReengancheFin(conv, texto);
        conv.estado = reenganche.estado;
        conv.producto_interes = reenganche.producto_interes;
        conv.modelo_pendiente = reenganche.modelo_pendiente;
        respuesta = reenganche.respuesta;
        break;
      }
      const siguiente = preguntaPendiente({
        optinAceptado: conv.optin_aceptado,
        nombre: conv.nombre,
        cedula: conv.cedula,
        departamento: conv.departamento,
        municipio: conv.municipio || conv.ciudad,
        tiendaAsignada: !!conv.tienda_id,
        leadCreado: conv.lead_creado,
        modalidad: conv.modalidad
      });
      respuesta = siguiente || MSG.FIN;
      conv.ultima_pregunta = siguiente || void 0;
      if (siguiente) {
        conv.estado = conv.tienda_id ? "DATOS_MIN" : conv.departamento || conv.municipio ? "CIUDAD_MODAL" : "ESCUCHAR";
      }
      break;
    }
  }
  if (respuesta) {
    if (respuesta.includes("?")) conv.ultima_pregunta = respuesta;
    await sendFn(respuesta, botones);
    await guardarConv({ telefono: clienteId, contenido: respuesta, respondido_por: "bot", canal }, sk);
    push("Sofia", respuesta);
  }
  await save();
}
__name(procesarMensaje, "procesarMensaje");
async function hacerHandoff(conv, clienteId, sendFn, env2, sk, canal) {
  if (!conv.tienda_telefono || !conv.tienda_contacto) {
    await sendFn(MSG.CIUDAD_PREGUNTA);
    conv.estado = "CIUDAD";
    return;
  }
  if (!conv.nombre) {
    console.warn("[HANDOFF-WARN] conv.nombre vac\xEDo al hacer handoff", {
      clienteId,
      canal,
      estado: conv.estado,
      tienda: conv.tienda_id,
      cedula: !!conv.cedula
    });
  }
  const nombreCorto = (conv.nombre || "").split(" ")[0] || "amigo";
  const nombreAsesor = conv.tienda_contacto.split(" ")[0];
  const tel = conv.tienda_telefono;
  const nombreComercial = conv.tienda_nombre_comercial || `Creditek ${conv.ciudad ?? "tu ciudad"}`;
  const tiendaId = conv.tienda_id;
  if (!tiendaId) throw new Error("handoff sin destination_id");
  const destinoTipo = conv.tienda_tipo === "aliado" ? "aliado" : "tienda";
  await procesarHandoffCertificado({
    supabaseUrl: supabaseUrl(),
    serviceKey: sk,
    input: {
      idempotencyKey: `advisor_handoff:${clienteId}`,
      destinationId: tiendaId,
      destinationType: destinoTipo,
      origin: canal
    },
    enviarMeta: /* @__PURE__ */ __name(() => notificarAsesor(conv, { id: tiendaId, nombre: conv.tienda_nombre || "", contacto: conv.tienda_contacto || "", telefono: tel, ciudad: conv.ciudad || "" }, env2), "enviarMeta")
  });
  await actualizarCliente(clienteId, { estado_funnel: "transferido_asesor", tienda_id: conv.tienda_id, ciudad_normalizada: conv.ciudad, fecha_transferido_asesor: (/* @__PURE__ */ new Date()).toISOString() }, sk);
  conv.lead_creado = true;
  conv.estado = "HANDOFF";
  const msg = MSG.HANDOFF_MSG(nombreCorto, nombreAsesor, nombreComercial, tel);
  await sendFn(msg);
  await guardarConv({ telefono: clienteId, contenido: msg, respondido_por: "bot", canal }, sk);
  if (!conv.tiendas_intentadas) conv.tiendas_intentadas = [];
  conv.tiendas_intentadas.push(conv.tienda_id || "");
}
__name(hacerHandoff, "hacerHandoff");
async function manejarConfirmacionAsesor(msg, sk) {
  const telefonoAsesorRaw = msg.from;
  const telefonoAsesor = telefonoAsesorRaw.replace(/^57(?=\d{10}$)/, "");
  const claveBoton = (msg.button?.payload || msg.button?.text || "").trim();
  const mapaConfirmacion = {
    "Contact\xE9 al cliente": "contactado",
    "No pude contactarlo": "no_contactado",
    "Cerr\xE9 la venta": "venta_cerrada"
  };
  const estadoConfirmacion = mapaConfirmacion[claveBoton];
  if (!estadoConfirmacion) {
    console.warn("[ASESOR-BOTON] texto de bot\xF3n no reconocido:", claveBoton);
    return;
  }
  try {
    const rTienda = await fetch(
      `${supabaseUrl()}/rest/v1/tiendas?telefono=eq.${encodeURIComponent(telefonoAsesor)}&select=id&limit=1`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    const tiendas = await rTienda.json();
    const tiendaId = tiendas[0]?.id;
    if (!tiendaId) {
      console.warn("[ASESOR-BOTON] no se encontr\xF3 tienda para", telefonoAsesor);
      return;
    }
    const rCliente = await fetch(
      `${supabaseUrl()}/rest/v1/clientes?tienda_id=eq.${tiendaId}&estado_funnel=eq.transferido_asesor&confirmacion_asesor=is.null&order=fecha_estado_actualizado.desc&limit=1&select=telefono`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    const clientes = await rCliente.json();
    const clienteTelefono = clientes[0]?.telefono;
    if (!clienteTelefono) {
      console.warn("[ASESOR-BOTON] no hay cliente pendiente para tienda", tiendaId);
      return;
    }
    await actualizarCliente(clienteTelefono, { confirmacion_asesor: estadoConfirmacion }, sk);
    console.log("[ASESOR-BOTON] confirmado:", clienteTelefono, "->", estadoConfirmacion);
  } catch (e) {
    console.error("[ASESOR-BOTON-EXCEPTION]", e);
  }
}
__name(manejarConfirmacionAsesor, "manejarConfirmacionAsesor");
async function notificarAsesor(conv, tienda, env2) {
  if (env2.ENVIRONMENT === "staging") {
    if (env2.MOCK_META_SCENARIO === "reject") throw new Error("Meta staging rechaz\xF3 el env\xEDo");
    if (env2.MOCK_META_SCENARIO === "ambiguous") throw new MetaDeliveryAmbiguousError();
    return `mock-${crypto.randomUUID()}`;
  }
  const modalidadTexto = conv.modalidad === "credito" ? "a cr\xE9dito" : conv.modalidad === "contado" ? "de contado" : "modalidad por confirmar";
  const interes = conv.producto_interes ? `${conv.producto_interes} (${modalidadTexto})` : modalidadTexto;
  const celularLocal = conv.celular ? conv.celular.replace(/^57(?=\d{10}$)/, "") : null;
  const partesResumen = [
    `Nombre: ${conv.nombre || "Sin nombre"}`,
    `Ciudad: ${conv.ciudad || tienda.ciudad || "N/D"}`,
    `Inter\xE9s: ${interes}`,
    `C\xE9dula: ${conv.cedula || "N/D"}`,
    `Celular: ${celularLocal || "N/D"}`
  ];
  if (conv.correo) partesResumen.push(`Correo: ${conv.correo}`);
  const resumen = partesResumen.join(" | ");
  const digits = tienda.telefono.replace(/\D/g, "");
  const destino = digits.length === 10 ? "57" + digits : digits;
  const nombreAsesor = tienda.contacto.split(" ")[0];
  console.log("[HANDOFF] env\xEDo a asesor iniciado");
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/v19.0/${env2.PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env2.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destino,
        type: "template",
        template: {
          name: "aviso_asesor_creditek",
          language: { code: "es_CO" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: nombreAsesor },
              { type: "text", text: resumen }
            ]
          }]
        }
      })
    });
  } catch {
    console.error("[HANDOFF] resultado de env\xEDo indeterminado");
    throw new MetaDeliveryAmbiguousError();
  }
  console.log("[HANDOFF] Meta status:", res.status, "confirmed:", res.ok);
  if (!res.ok) throw new Error(`Meta handoff respondi\xF3 ${res.status}`);
  let resJson;
  try {
    resJson = await res.json();
  } catch {
    throw new MetaDeliveryAmbiguousError();
  }
  const messageId = resJson.messages?.[0]?.id;
  if (!messageId) throw new MetaDeliveryAmbiguousError();
  return messageId;
}
__name(notificarAsesor, "notificarAsesor");
async function enviarRecordatorioAsesor(tienda, resumen, env2) {
  const digits = tienda.telefono.replace(/\D/g, "");
  const destino = digits.length === 10 ? "57" + digits : digits;
  const nombreAsesor = tienda.contacto.split(" ")[0];
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${env2.PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env2.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destino,
        type: "template",
        template: {
          name: "aviso_asesor_creditek",
          language: { code: "es_CO" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: nombreAsesor },
              { type: "text", text: resumen }
            ]
          }]
        }
      })
    });
    const resJson = await res.json();
    console.log("[RECORDATORIO-ASESOR] status:", res.status, "para:", destino, "respuesta:", JSON.stringify(resJson));
  } catch (e) {
    console.error("[RECORDATORIO-ASESOR-EXCEPTION]", e);
  }
}
__name(enviarRecordatorioAsesor, "enviarRecordatorioAsesor");
async function recordatorioAsesores(env2, ronda) {
  const sk = env2.SUPABASE_SERVICE_KEY;
  const corte = new Date(Date.now() - 2 * 60 * 60 * 1e3).toISOString();
  try {
    const r = await fetch(
      `${supabaseUrl()}/rest/v1/clientes?estado_funnel=eq.transferido_asesor&confirmacion_asesor=is.null&recordatorio_asesor_enviado_en=is.null&fecha_transferido_asesor=lte.${corte}&select=telefono,nombre,tienda_id,ciudad,producto_interes,cedula,telefono_contacto`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    if (!r.ok) {
      console.error("[RECORDATORIO-ASESOR] error consultando clientes:", r.status, await r.text());
      return;
    }
    const clientes = await r.json();
    if (!clientes.length) {
      console.log(`[RECORDATORIO-ASESOR] ${ronda}: nada pendiente`);
      return;
    }
    const tiendaIds = [...new Set(clientes.map((c) => c.tienda_id).filter(Boolean))];
    if (!tiendaIds.length) {
      console.warn(`[RECORDATORIO-ASESOR] ${ronda}: clientes pendientes sin tienda_id`);
      return;
    }
    const rt = await fetch(
      `${supabaseUrl()}/rest/v1/tiendas?id=in.(${tiendaIds.join(",")})&select=id,contacto,telefono`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    if (!rt.ok) {
      console.error("[RECORDATORIO-ASESOR] error consultando tiendas:", rt.status, await rt.text());
      return;
    }
    const tiendas = await rt.json();
    const tiendaMap = {};
    tiendas.forEach((t) => {
      tiendaMap[t.id] = { contacto: t.contacto, telefono: t.telefono };
    });
    let enviados = 0;
    for (const c of clientes) {
      const tienda = tiendaMap[c.tienda_id];
      if (!tienda?.telefono || !tienda?.contacto) {
        console.warn("[RECORDATORIO-ASESOR] sin tienda/telefono para", c.telefono);
        continue;
      }
      const resumen = [
        "Recordatorio \u2014 \xBFc\xF3mo va este cliente?",
        `Nombre: ${c.nombre || "Sin nombre"}`,
        `Ciudad: ${c.ciudad || "N/D"}`,
        `Inter\xE9s: ${c.producto_interes || "N/D"}`,
        `C\xE9dula: ${c.cedula || "N/D"}`,
        `Celular: ${c.telefono_contacto || "N/D"}`
      ].join(" | ");
      await enviarRecordatorioAsesor(tienda, resumen, env2);
      await actualizarCliente(c.telefono, { recordatorio_asesor_enviado_en: (/* @__PURE__ */ new Date()).toISOString() }, sk);
      enviados++;
    }
    console.log(`[RECORDATORIO-ASESOR] ${ronda}: ${enviados} recordatorio(s) enviados`);
  } catch (e) {
    console.error("[RECORDATORIO-ASESOR-EXCEPTION]", e);
  }
}
__name(recordatorioAsesores, "recordatorioAsesores");
var VARIANTES_SEGUIMIENTO_LEAD = [
  "\xBFSigues por ah\xED? \u{1F60A} Qued\xE9 pendiente de ayudarte con tu celular nuevo",
  "Hola, \xBFa\xFAn te interesa? Te ayudo a encontrar tu equipo en un momentico \u{1F60A}",
  "\xA1Hola de nuevo! Cualquier cosa que necesites para tu celular nuevo, aqu\xED estoy \u{1F60A}"
];
async function seguimientoLeadsMudos(env2) {
  const sk = env2.SUPABASE_SERVICE_KEY;
  const estadosPendientes = ESTADOS_PENDIENTES.join(",");
  const ahora = /* @__PURE__ */ new Date();
  const colombiaOffset = -5 * 60;
  const utcMinutes = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const colombiaMinutes = (utcMinutes + colombiaOffset + 1440) % 1440;
  const horaColombia = Math.floor(colombiaMinutes / 60);
  if (horaColombia < 8 || horaColombia >= 20) {
    console.log("[SEGUIMIENTO-LEAD] fuera de horario Colombia (8am-8pm), no se env\xEDa nada");
    return;
  }
  try {
    const r = await fetch(
      `${supabaseUrl()}/rest/v1/clientes?estado_funnel=in.(${estadosPendientes})&optin_datos=eq.true&recordatorio_enviado_at=is.null&select=telefono,nombre`,
      { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
    );
    if (!r.ok) {
      console.error("[SEGUIMIENTO-LEAD] error consultando clientes:", r.status, await r.text());
      return;
    }
    const candidatos = await r.json();
    if (!candidatos.length) {
      console.log("[SEGUIMIENTO-LEAD] sin candidatos");
      return;
    }
    const ahoraMs = Date.now();
    let enviados = 0;
    for (const c of candidatos) {
      const rc = await fetch(
        `${supabaseUrl()}/rest/v1/conversaciones?telefono=eq.${encodeURIComponent(c.telefono)}&order=timestamp.desc&limit=1&select=respondido_por,timestamp`,
        { headers: { apikey: sk, Authorization: `Bearer ${sk}` } }
      );
      if (!rc.ok) {
        console.error("[SEGUIMIENTO-LEAD] error consultando conversaciones de", c.telefono, rc.status);
        continue;
      }
      const ultimos = await rc.json();
      const ultimo = ultimos[0];
      if (!ultimo || ultimo.respondido_por !== "bot") continue;
      const antiguedadMin = (ahoraMs - new Date(ultimo.timestamp).getTime()) / 6e4;
      if (antiguedadMin < 60 || antiguedadMin > 240) continue;
      const variante = VARIANTES_SEGUIMIENTO_LEAD[Math.floor(Math.random() * VARIANTES_SEGUIMIENTO_LEAD.length)];
      await enviarMensajeWA(c.telefono, variante, env2.PHONE_NUMBER_ID, env2.WHATSAPP_TOKEN);
      await guardarConv({ telefono: c.telefono, contenido: variante, respondido_por: "bot", canal: "whatsapp" }, sk);
      await actualizarCliente(c.telefono, { recordatorio_enviado_at: (/* @__PURE__ */ new Date()).toISOString() }, sk);
      enviados++;
    }
    console.log(`[SEGUIMIENTO-LEAD] enviados: ${enviados} de ${candidatos.length} candidatos`);
  } catch (e) {
    console.error("[SEGUIMIENTO-LEAD-EXCEPTION]", e);
  }
}
__name(seguimientoLeadsMudos, "seguimientoLeadsMudos");
async function buscarCliente(telefono, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=nombre,optin_datos,celular,fuente,canal_origen&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) {
      console.error("[SUPABASE-ERROR] buscarCliente fall\xF3:", r.status, await r.text());
      return null;
    }
    const d = await r.json();
    return d[0] ?? null;
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] buscarCliente:", e);
    return null;
  }
}
__name(buscarCliente, "buscarCliente");
async function buscarTiendaQR(refQr, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/tiendas?ref_qr=eq.${encodeURIComponent(refQr)}&select=id,nombre,nombre_comercial,genero,ciudad,contacto,telefono,tipo&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) {
      console.error("[SUPABASE-ERROR] buscarTiendaQR fall\xF3:", r.status, await r.text());
      return null;
    }
    const d = await r.json();
    return d[0] ?? null;
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] buscarTiendaQR:", e);
    return null;
  }
}
__name(buscarTiendaQR, "buscarTiendaQR");
var _tiendaPorTelefonoCache = null;
async function buscarTiendaPorTelefono(telefono, key) {
  const limpio = telefono.replace(/^57/, "");
  const ahora = Date.now();
  if (!_tiendaPorTelefonoCache || _tiendaPorTelefonoCache.expira <= ahora) {
    try {
      const r = await fetch(`${supabaseUrl()}/rest/v1/tiendas?activa=eq.true&select=id,telefono,nombre_comercial,contacto,ref_qr,tipo`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (r.ok) {
        const data = await r.json();
        const valores = /* @__PURE__ */ new Map();
        for (const t of data) {
          if (t.telefono) valores.set(t.telefono, { id: t.id, nombre_comercial: t.nombre_comercial, contacto: t.contacto, ref_qr: t.ref_qr });
        }
        _tiendaPorTelefonoCache = { valores, expira: ahora + 10 * 60 * 1e3 };
      }
    } catch {
    }
  }
  return _tiendaPorTelefonoCache?.valores.get(limpio) ?? null;
}
__name(buscarTiendaPorTelefono, "buscarTiendaPorTelefono");
var _ciudadesCache = null;
function formatearListaCiudades(ciudades) {
  if (ciudades.length <= 1) return ciudades[0] || "";
  return ciudades.slice(0, -1).join(", ") + " y " + ciudades[ciudades.length - 1];
}
__name(formatearListaCiudades, "formatearListaCiudades");
async function obtenerCiudadesCubiertas(key) {
  const ahora = Date.now();
  if (_ciudadesCache && _ciudadesCache.expira > ahora) return _ciudadesCache.valor;
  const FALLBACK = "Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro y Cove\xF1as";
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/tiendas?activa=eq.true&select=ciudad`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return _ciudadesCache?.valor || FALLBACK;
    const data = await r.json();
    const unicas = Array.from(new Set(data.map((t) => t.ciudad).filter(Boolean)));
    const texto = unicas.length ? formatearListaCiudades(unicas) : FALLBACK;
    _ciudadesCache = { valor: texto, expira: ahora + 10 * 60 * 1e3 };
    return texto;
  } catch {
    return _ciudadesCache?.valor || FALLBACK;
  }
}
__name(obtenerCiudadesCubiertas, "obtenerCiudadesCubiertas");
async function buscarTiendaRandom(ciudad, excluir, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/tiendas?activa=eq.true&select=id,nombre,nombre_comercial,genero,ciudad,contacto,telefono,tipo`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) {
      console.error("[SUPABASE-ERROR] buscarTiendaRandom fall\xF3:", r.status, await r.text());
      return null;
    }
    const data = await r.json();
    let cn = norm2(ciudad);
    if (cn) {
      const aliasEncontrado = await buscarCiudadAlias(cn, key);
      if (aliasEncontrado) {
        cn = norm2(aliasEncontrado);
      } else {
        const parecida = ciudadMasParecida(ciudad);
        if (parecida) cn = norm2(parecida);
      }
    }
    const matches = data.filter((t) => {
      if (!t.ciudad || !t.telefono) return false;
      if (excluir.includes(t.id)) return false;
      const ciu = norm2(t.ciudad);
      return ciu.includes(cn) || cn.includes(ciu.split("/")[0].trim());
    });
    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];
    const ids = matches.map((t) => t.id);
    const rc = await fetch(`${supabaseUrl()}/rest/v1/clientes?tienda_id=in.(${ids.join(",")})&select=tienda_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const conteos = {};
    if (rc.ok) {
      const asignados = await rc.json();
      for (const a of asignados) conteos[a.tienda_id] = (conteos[a.tienda_id] || 0) + 1;
    }
    matches.sort((a, b) => (conteos[a.id] || 0) - (conteos[b.id] || 0));
    return matches[0];
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] buscarTiendaRandom:", e);
    return null;
  }
}
__name(buscarTiendaRandom, "buscarTiendaRandom");
async function upsertCliente(data, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/clientes?on_conflict=telefono`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(data) });
    if (!r.ok) console.error("[SUPABASE-ERROR] upsertCliente fall\xF3:", r.status, await r.text(), "payload:", JSON.stringify(data));
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] upsertCliente:", e, "payload:", JSON.stringify(data));
  }
}
__name(upsertCliente, "upsertCliente");
async function actualizarCliente(telefono, data, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}`, { method: "PATCH", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(data) });
    if (!r.ok) console.error("[SUPABASE-ERROR] actualizarCliente fall\xF3:", r.status, await r.text(), "telefono:", telefono, "payload:", JSON.stringify(data));
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] actualizarCliente:", e, "telefono:", telefono);
  }
}
__name(actualizarCliente, "actualizarCliente");
async function marcarLeadsPerdidos(env2) {
  const key = env2.SUPABASE_SERVICE_KEY;
  const estadosPendientes = ESTADOS_PENDIENTES.join(",");
  try {
    const limite = new Date(Date.now() - 5 * 24 * 3600 * 1e3).toISOString();
    const rSel = await fetch(
      `${supabaseUrl()}/rest/v1/clientes?estado_funnel=in.(${estadosPendientes})&fecha_estado_actualizado=lt.${limite}&select=telefono,nombre,producto_interes`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!rSel.ok) {
      console.error("[SUPABASE-ERROR] marcarLeadsPerdidos (select) fall\xF3:", rSel.status, await rSel.text());
      return;
    }
    const perdidos = await rSel.json();
    const r = await fetch(
      `${supabaseUrl()}/rest/v1/clientes?estado_funnel=in.(${estadosPendientes})&fecha_estado_actualizado=lt.${limite}`,
      {
        method: "PATCH",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ estado_funnel: "perdido", razon_perdida: "no_respondio" })
      }
    );
    if (!r.ok) {
      console.error("[SUPABASE-ERROR] marcarLeadsPerdidos fall\xF3:", r.status, await r.text());
      return;
    }
    for (const c of perdidos) {
      await enviarReenganche(c, env2);
    }
    console.log("[REENGANCHE] procesados:", perdidos.length);
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] marcarLeadsPerdidos:", e);
  }
}
__name(marcarLeadsPerdidos, "marcarLeadsPerdidos");
async function enviarReenganche(cliente, env2) {
  const nombreCorto = (cliente.nombre || "").split(" ")[0] || "Hola";
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${env2.PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env2.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cliente.telefono,
        type: "template",
        template: {
          name: "reenganche_creditek",
          language: { code: "es_CO" },
          components: [{ type: "body", parameters: [{ type: "text", text: nombreCorto }] }]
        }
      })
    });
    const resJson = await res.json();
    console.log("[REENGANCHE-DEBUG]", cliente.telefono, res.status, JSON.stringify(resJson));
    if (res.ok) {
      await env2.CONVERSATIONS.delete(cliente.telefono);
    } else {
      console.warn("[REENGANCHE] no se pudo enviar, se conserva el estado:", cliente.telefono);
    }
  } catch (e) {
    console.error("[REENGANCHE-EXCEPTION]", cliente.telefono, e);
  }
}
__name(enviarReenganche, "enviarReenganche");
var ORDEN_FUNNEL = {
  "nuevo": 0,
  "contactado": 1,
  "ciudad_identificada": 2,
  "lead_caliente": 3,
  "transferido_asesor": 4
};
var FECHA_COLUMNA = {
  contactado: "fecha_contactado",
  ciudad_identificada: "fecha_ciudad_identificada",
  lead_caliente: "fecha_lead_caliente",
  transferido_asesor: "fecha_transferido_asesor"
};
async function avanzarEstadoFunnel(telefono, nuevoEstado, key) {
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=estado_funnel`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return;
    const d = await r.json();
    const actual = d[0]?.estado_funnel || "nuevo";
    const rangoActual = ORDEN_FUNNEL[actual] ?? 0;
    const rangoNuevo = ORDEN_FUNNEL[nuevoEstado] ?? 0;
    if (nuevoEstado === "perdido" || rangoNuevo > rangoActual) {
      const payload = { estado_funnel: nuevoEstado };
      const columnaFecha = FECHA_COLUMNA[nuevoEstado];
      if (columnaFecha) payload[columnaFecha] = (/* @__PURE__ */ new Date()).toISOString();
      await actualizarCliente(telefono, payload, key);
    }
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] avanzarEstadoFunnel:", e);
  }
}
__name(avanzarEstadoFunnel, "avanzarEstadoFunnel");
async function registrarTiendaAsignada(telefono, tienda, key) {
  await actualizarCliente(telefono, { tienda_id: tienda.id, ciudad_normalizada: tienda.ciudad, ciudad: tienda.ciudad }, key);
  await avanzarEstadoFunnel(telefono, "ciudad_identificada", key);
}
__name(registrarTiendaAsignada, "registrarTiendaAsignada");
async function guardarConv(data, key) {
  const direccion = data.respondido_por === null ? "entrada" : "salida";
  const payload = { telefono: data.telefono, tipo_mensaje: "text", contenido: data.contenido, respondido_por: data.respondido_por, direccion, canal: data.canal, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/conversaciones`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(payload) });
    if (!r.ok) console.error("[SUPABASE-ERROR] guardarConv fall\xF3:", r.status, await r.text(), "payload:", JSON.stringify(payload));
  } catch (e) {
    console.error("[SUPABASE-EXCEPTION] guardarConv:", e, "payload:", JSON.stringify(payload));
  }
}
__name(guardarConv, "guardarConv");
var ConversacionDO = class {
  static {
    __name(this, "ConversacionDO");
  }
  state;
  env;
  constructor(state, env2) {
    this.state = state;
    this.env = env2;
  }
  async fetch(request) {
    const body = await request.json();
    const sendFn = body.canal === "whatsapp" ? (m, botones) => botones && botones.length ? enviarBotonesWA(body.clienteId, m, botones, this.env.PHONE_NUMBER_ID, this.env.WHATSAPP_TOKEN) : enviarMensajeWA(body.clienteId, m, this.env.PHONE_NUMBER_ID, this.env.WHATSAPP_TOKEN) : async (m) => {
      const senderId = body.clienteId.replace(/^fb_/, "");
      try {
        await enviarMensajeFB(senderId, m, body.pageId, this.env.META_PAGE_ACCESS_TOKEN || this.env.META_ACCESS_TOKEN);
      } catch (e) {
      }
    };
    await this.state.blockConcurrencyWhile(async () => {
      const auditoria = body.auditoriaEvento || null;
      if (auditoria) {
        const permitido = await reservarEventoEnDurable(this.state.storage, auditoria);
        if (!permitido) {
          await actualizarAuditoriaEvento(
            this.env.CONVERSATIONS,
            auditoria,
            "bloqueado_idempotencia",
            "ID de Meta ya reservado en almacenamiento durable"
          );
          return;
        }
        await actualizarAuditoriaEvento(this.env.CONVERSATIONS, auditoria, "procesando", "procesamiento iniciado en Durable Object");
      }
      try {
        await procesarMensaje(
          body.clienteId,
          body.texto,
          body.canal,
          body.refQr,
          body.referral,
          sendFn,
          this.env,
          this.env.SUPABASE_SERVICE_KEY
        );
        if (auditoria) {
          await finalizarEventoEnDurable(this.state.storage, auditoria, "respondido", "procesamiento finalizado");
          await actualizarAuditoriaEvento(this.env.CONVERSATIONS, auditoria, "respondido", "procesamiento finalizado");
        }
      } catch (error) {
        if (auditoria) {
          await finalizarEventoEnDurable(this.state.storage, auditoria, "error_envio", "fallo durante procesamiento o env\xEDo; no reprocesar autom\xE1ticamente");
          await actualizarAuditoriaEvento(this.env.CONVERSATIONS, auditoria, "error_envio", "fallo durante procesamiento o env\xEDo; no reprocesar autom\xE1ticamente");
        }
        throw error;
      }
    });
    return new Response("OK");
  }
};
export {
  ConversacionDO,
  clasificarErrorArnes,
  index_default as default
};
//# sourceMappingURL=index.js.map

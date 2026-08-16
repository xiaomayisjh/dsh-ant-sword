/**
 * Proxy 环境监控器 — 诊断报告生成器
 *
 * 设计原则：为 agent 服务，输出结构化诊断报告，不做流式日志。
 * - 累积收集，运行结束后统一输出
 * - 按严重级别分类：errors > undefined > function calls
 * - 同一路径去重计数，不重复输出
 *
 * 用法：
 *   1. 复制到项目 env/ 目录
 *   2. 按需修改「项目配置区」中的 cookie/URL 等
 *   3. 在目标 JS 之前 require 此文件
 *   4. 运行后自动输出诊断报告（或手动调 __monitor__.report()）
 */

const __monitor__ = (function () {

    // ===== 数据收集 =====
    const _errors = [];                // { path, operation, message }
    const _undefinedGets = {};         // path → count
    const _functionCalls = {};         // path → { count, args: Set (样本，最多3个) }
    const _successfulGets = {};        // path → count （默认隐藏）

    const _proxied = new WeakSet();

    // ===== toString 伪装（Proxy 方式，防 .prototype 检测） =====
    const _origToString = Function.prototype.toString;
    const _spoofedFuncs = new WeakMap(); // fn → name

    function safeFunction(fn, name) {
        if (name) Object.defineProperty(fn, "name", { value: name, configurable: true });
        _spoofedFuncs.set(fn, name || fn.name || "");
        return fn;
    }

    Function.prototype.toString = new Proxy(_origToString, {
        apply(target, thisArg, args) {
            if (_spoofedFuncs.has(thisArg)) {
                return `function ${_spoofedFuncs.get(thisArg)}() { [native code] }`;
            }
            return Reflect.apply(target, thisArg, args);
        }
    });
    // 注册 toString 自身，防递归检测
    _spoofedFuncs.set(Function.prototype.toString, "toString");

    // ===== 记录函数（去重累计） =====
    function recordUndefined(path) {
        _undefinedGets[path] = (_undefinedGets[path] || 0) + 1;
    }

    function recordSuccess(path) {
        _successfulGets[path] = (_successfulGets[path] || 0) + 1;
    }

    function recordCall(path, args) {
        if (!_functionCalls[path]) _functionCalls[path] = { count: 0, args: [] };
        const entry = _functionCalls[path];
        entry.count++;
        // 收集不同的参数样本，最多 3 组
        if (entry.args.length < 3) {
            const summary = args.map(summarize).join(", ");
            if (!entry.args.includes(summary)) entry.args.push(summary);
        }
    }

    function recordError(path, operation, err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 同一 path+message 去重
        const key = `${path}|${msg}`;
        if (!_errors.some(e => `${e.path}|${e.message}` === key)) {
            _errors.push({ path, operation, message: msg });
        }
    }

    function summarize(v) {
        if (v === undefined) return "undefined";
        if (v === null) return "null";
        const t = typeof v;
        if (t === "function") return `fn:${v.name || "?"}`;
        if (t === "string") return v.length > 60 ? `"${v.slice(0, 60)}…"` : `"${v}"`;
        if (t === "number" || t === "boolean") return String(v);
        if (t === "symbol") return v.toString();
        if (Array.isArray(v)) return `Array(${v.length})`;
        try {
            const name = v.constructor?.name;
            return name && name !== "Object" ? `[${name}]` : `{…}`;
        } catch { return "{…}"; }
    }

    // ===== 不记录的属性（引擎内部 / 会导致递归） =====
    const SKIP = new Set([
        "constructor", "prototype", "__proto__",
        "toJSON", "hasOwnProperty", "isPrototypeOf",
        "propertyIsEnumerable", "valueOf",
        "inspect", "then", "asymmetricMatch", "nodeType",
        "$$typeof", "@@__IMMUTABLE_ITERABLE__@@",
    ]);

    // ===== 核心 Proxy 工厂 =====
    function createProxy(target, name, depth) {
        if (depth > 3) return target;
        if (target === null || target === undefined) return target;
        const t = typeof target;
        if (t !== "object" && t !== "function") return target;
        if (_proxied.has(target)) return target;

        const proxy = new Proxy(target, {
            get(obj, prop, receiver) {
                // Symbol 属性静默转发
                if (typeof prop === "symbol") {
                    if (prop === Symbol.toStringTag) {
                        const tag = Reflect.get(obj, prop, receiver);
                        return tag !== undefined ? tag : undefined;
                    }
                    return Reflect.get(obj, prop, receiver);
                }
                if (SKIP.has(prop)) return Reflect.get(obj, prop, receiver);

                const chain = `${name}.${prop}`;
                let value;
                try {
                    value = Reflect.get(obj, prop, receiver);
                } catch (err) {
                    recordError(chain, "get", err);
                    return undefined;
                }

                // 分流记录
                if (value === undefined) {
                    recordUndefined(chain);
                } else {
                    recordSuccess(chain);
                }

                // 函数：包装以拦截调用
                if (typeof value === "function") {
                    // 内置对象方法 bind 到原始 target，防 internal slot TypeError
                    const needsBind = (obj instanceof Map || obj instanceof Set ||
                        obj instanceof Date || obj instanceof RegExp ||
                        obj instanceof Promise || ArrayBuffer.isView(obj));

                    const wrappedFn = function (...args) {
                        recordCall(chain, args);
                        try {
                            const thisArg = (this === proxy) ? obj : this;
                            return needsBind
                                ? value.apply(obj, args)
                                : value.apply(thisArg, args);
                        } catch (err) {
                            recordError(chain, "call", err);
                            throw err;
                        }
                    };
                    safeFunction(wrappedFn, prop);
                    return wrappedFn;
                }

                // 子对象递归代理
                if (value && typeof value === "object") {
                    try { return createProxy(value, chain, depth + 1); }
                    catch { return value; }
                }
                return value;
            },

            set(obj, prop, value, receiver) {
                if (typeof prop === "symbol") return Reflect.set(obj, prop, value, receiver);
                // set 只在出错时记录
                try {
                    return Reflect.set(obj, prop, value, receiver);
                } catch (err) {
                    recordError(`${name}.${prop}`, "set", err);
                    return false;
                }
            },

            has(obj, prop) {
                return Reflect.has(obj, prop);
            },

            getOwnPropertyDescriptor(obj, prop) {
                return Reflect.getOwnPropertyDescriptor(obj, prop);
            },

            ownKeys(obj) {
                return Reflect.ownKeys(obj);
            },

            ...(typeof target === "function" ? {
                apply(fn, thisArg, args) {
                    recordCall(name, args);
                    try {
                        return Reflect.apply(fn, thisArg, args);
                    } catch (err) {
                        recordError(name, "call", err);
                        throw err;
                    }
                },
                construct(fn, args, newTarget) {
                    recordCall(`new ${name}`, args);
                    try {
                        return Reflect.construct(fn, args, newTarget);
                    } catch (err) {
                        recordError(`new ${name}`, "construct", err);
                        throw err;
                    }
                }
            } : {})
        });

        _proxied.add(target);
        return proxy;
    }

    // ===== 环境初始化 =====
    function init(config) {
        config = config || {};

        // --- 隐藏 Node.js 特征 ---
        const nodeFeatures = ["process", "Buffer", "__dirname", "__filename", "module", "exports", "require"];

        // =========================================================
        //  项目配置区 — 按实际目标修改以下值
        // =========================================================
        const COOKIE  = config.cookie   || "";
        const URL     = config.url      || "https://example.com";
        const DOMAIN  = config.domain   || new globalThis.URL(URL).hostname;

        // --- 最小浏览器环境 ---
        const fakeDocument = {
            cookie: COOKIE,
            referrer: "",
            title: "",
            domain: DOMAIN,
            URL: URL,
            characterSet: "UTF-8",
            readyState: "complete",
            hidden: false,
            visibilityState: "visible",
            head: {},
            body: {},
            documentElement: { style: {} },
            getElementById:        safeFunction(function getElementById()        { return null; }, "getElementById"),
            getElementsByTagName:  safeFunction(function getElementsByTagName()  { return [];   }, "getElementsByTagName"),
            getElementsByClassName:safeFunction(function getElementsByClassName(){ return [];   }, "getElementsByClassName"),
            querySelector:         safeFunction(function querySelector()         { return null; }, "querySelector"),
            querySelectorAll:      safeFunction(function querySelectorAll()      { return [];   }, "querySelectorAll"),
            createElement:         safeFunction(function createElement(tag)      { return { tagName: (tag||"").toUpperCase(), style: {}, childNodes: [], setAttribute(){}, getAttribute(){ return null; }, appendChild(c){ return c; }, addEventListener(){} }; }, "createElement"),
            createTextNode:        safeFunction(function createTextNode(t)       { return { textContent: t }; }, "createTextNode"),
            addEventListener:      safeFunction(function addEventListener()      {}, "addEventListener"),
            removeEventListener:   safeFunction(function removeEventListener()   {}, "removeEventListener"),
        };

        const fakeNavigator = {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            platform: "MacIntel",
            language: "zh-CN",
            languages: ["zh-CN", "zh"],
            cookieEnabled: true,
            appName: "Netscape",
            vendor: "Google Inc.",
            onLine: true,
            hardwareConcurrency: 8,
            webdriver: false,
        };

        const fakeLocation = {
            href: URL,
            protocol: "https:",
            host: DOMAIN,
            hostname: DOMAIN,
            port: "",
            pathname: new globalThis.URL(URL).pathname,
            search: new globalThis.URL(URL).search,
            hash: "",
            origin: `https://${DOMAIN}`,
        };

        const fakeScreen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055, colorDepth: 24, pixelDepth: 24 };

        const fakeStorage = {
            getItem:    safeFunction(function getItem()    { return null; }, "getItem"),
            setItem:    safeFunction(function setItem()    {}, "setItem"),
            removeItem: safeFunction(function removeItem() {}, "removeItem"),
            length: 0,
        };

        // 代理包装
        const proxiedDocument  = createProxy(fakeDocument,  "document",  0);
        const proxiedNavigator = createProxy(fakeNavigator, "navigator", 0);
        const proxiedLocation  = createProxy(fakeLocation,  "location",  0);
        const proxiedScreen    = createProxy(fakeScreen,    "screen",    0);

        // window
        const fakeWindow = {
            document: proxiedDocument,
            navigator: proxiedNavigator,
            location: proxiedLocation,
            screen: proxiedScreen,
            // 标准全局
            setTimeout, setInterval, clearTimeout, clearInterval,
            parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
            encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
            atob: typeof atob !== "undefined" ? atob : (s) => Buffer.from(s, "base64").toString("binary"),
            btoa: typeof btoa !== "undefined" ? btoa : (s) => Buffer.from(s, "binary").toString("base64"),
            Math, JSON, Date, RegExp, Array, Object, String, Number, Boolean,
            Symbol, Error, TypeError, RangeError, ReferenceError,
            Map, Set, WeakMap, WeakSet, Promise, Proxy, Reflect,
            ArrayBuffer, DataView, Int8Array, Uint8Array, Uint8ClampedArray,
            Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array,
            console,
            localStorage: fakeStorage,
            sessionStorage: { ...fakeStorage },
            addEventListener:    safeFunction(function addEventListener()    {}, "addEventListener"),
            removeEventListener: safeFunction(function removeEventListener() {}, "removeEventListener"),
            requestAnimationFrame: safeFunction(function requestAnimationFrame(cb) { return setTimeout(cb, 16); }, "requestAnimationFrame"),
            getComputedStyle: safeFunction(function getComputedStyle() { return {}; }, "getComputedStyle"),
            matchMedia: safeFunction(function matchMedia() { return { matches: false, addListener(){}, removeListener(){} }; }, "matchMedia"),
            innerWidth: 1920, innerHeight: 1080, outerWidth: 1920, outerHeight: 1080,
            devicePixelRatio: 1, screenX: 0, screenY: 0, scrollX: 0, scrollY: 0,
        };

        // Node.js 特征隐藏
        for (const feat of nodeFeatures) {
            Object.defineProperty(fakeWindow, feat, { value: undefined, writable: false, enumerable: false });
        }
        fakeWindow.window = fakeWindow;
        fakeWindow.self = fakeWindow;
        fakeWindow.top = fakeWindow;
        fakeWindow.parent = fakeWindow;
        fakeWindow.globalThis = fakeWindow;

        const proxiedWindow = createProxy(fakeWindow, "window", 0);

        // 挂载全局
        global.window    = proxiedWindow;
        global.self      = proxiedWindow;
        global.document  = proxiedDocument;
        global.navigator = proxiedNavigator;
        global.location  = proxiedLocation;
        global.screen    = proxiedScreen;
    }

    // ===== 诊断报告 =====
    function report() {
        const lines = [];
        const errorCount    = _errors.length;
        const undefCount    = Object.keys(_undefinedGets).length;
        const callCount     = Object.keys(_functionCalls).length;
        const okCount       = Object.keys(_successfulGets).length;

        lines.push("");
        lines.push("========== ENV PATCH REPORT ==========");
        lines.push("");

        // --- ERRORS ---
        if (errorCount > 0) {
            lines.push(`[ERRORS] (${errorCount}) — must fix:`);
            for (const e of _errors) {
                lines.push(`  ${e.path} [${e.operation}] → ${e.message}`);
            }
            lines.push("");
        }

        // --- UNDEFINED ---
        if (undefCount > 0) {
            lines.push(`[UNDEFINED] (${undefCount}) — likely need patching:`);
            const sorted = Object.entries(_undefinedGets).sort((a, b) => b[1] - a[1]);
            for (const [path, count] of sorted) {
                lines.push(`  ${path}  (×${count})`);
            }
            lines.push("");
        }

        // --- FUNCTION CALLS ---
        if (callCount > 0) {
            lines.push(`[CALLS] (${callCount}) — function calls observed:`);
            const sorted = Object.entries(_functionCalls).sort((a, b) => b[1].count - a[1].count);
            for (const [path, info] of sorted) {
                const argSamples = info.args.length > 0 ? `  args: [${info.args.join("] [")}]` : "";
                lines.push(`  ${path}  (×${info.count})${argSamples}`);
            }
            lines.push("");
        }

        // --- SUMMARY ---
        lines.push(`Summary: ${errorCount} errors, ${undefCount} undefined, ${callCount} calls, ${okCount} ok (hidden)`);
        lines.push("=======================================");
        lines.push("");

        console.log(lines.join("\n"));

        return { errors: _errors, undefined: _undefinedGets, calls: _functionCalls };
    }

    // 进程退出时自动输出报告
    process.on("exit", report);

    return { init, report, safeFunction, createProxy };
})();

module.exports = __monitor__;

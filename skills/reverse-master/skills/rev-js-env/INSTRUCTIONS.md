---
name: rev-js-env
description: Extract browser JavaScript into Node.js and patch the minimum browser environment. Use after a JS crypto entry is found and the user needs vm/jsdom/webpack module extraction, Proxy environment monitoring, sdenv-style runtime fitting, or a standalone signing interface.
---

# env-patch

对 **$ARGUMENTS** 执行补环境方案：从 webpack bundle 提取加密相关模块，在 Node.js 中通过 Proxy 监控补齐浏览器环境，使加密代码独立运行。

**前置条件**：已知加密入口（模块 ID、函数名、所在脚本）。如果还没有，先用 `/find-crypto-entry` 定位。

---

## 核心原则：改 JS 导出函数，不改 JS 逻辑

`env/main.js` 是你的本地副本。**需要访问内部函数，直接改 JS 导出到 `global`**——这是补环境方案相比浏览器调试的根本优势。

**可以改（纯导出/观察，不影响原始逻辑）**：
- 导出内部函数 → 在定义处加 `global.__encrypt__ = fn`
- 拦截中间值 → 在赋值处加 `global.__capture__(value)`
- 添加日志 → `console.log("debug:", variable)` 辅助调试

**不要改（会改变代码行为，触发风控）**：
- 不要注释或绕过检测代码 — 应该通过补环境让检测正常通过
- 不要替换依赖或修改算法逻辑 — 服务端可能校验结果一致性

原则：**尽可能保持原始 JS 的执行逻辑不变**，只添加导出语句。环境缺什么就补什么（在 `proxy_monitor.js` 中），而不是改 JS 来跳过。

**示例**：webpack 模块内部函数 `i` 是加密入口，直接在 `env/main.js` 中加一行：
```javascript
// 原代码
exports.encrypt = i;
// 加一行导出，不改动任何原有逻辑
global.__encrypt__ = i;  // [ENV-PATCH] 导出加密函数
```

不要试图从外部通过 `require` 返回值或 hook 原型链来间接获取内部函数——加一行导出就能解决的事。

---

## 路径约定

Skill 目录（模板所在位置）的绝对路径通过 skill 加载时的 `Base directory` 获得。在整个流程中记为 `$SKILL_DIR`。

**所有引用模板文件时，必须使用 `$SKILL_DIR` 拼接绝对路径，禁止用相对路径猜测。**

## 模板脚本

本 skill 自带两个模板，位于 `$SKILL_DIR/scripts/`：

| 文件 | 用途 | 使用方式 |
|------|------|---------|
| `$SKILL_DIR/scripts/proxy_monitor.js` | Proxy 环境监控器，运行结束后输出结构化诊断报告 | 复制到项目 `env/` 目录，修改配置区的 cookie/URL |
| `$SKILL_DIR/scripts/webpack_runtime.js` | 最小 webpack runtime，兼容 v4/v5 | 复制到项目 `env/` 目录，填入提取的模块 |

复制命令：
```bash
cp "$SKILL_DIR/scripts/proxy_monitor.js" <project>/env/
cp "$SKILL_DIR/scripts/webpack_runtime.js" <project>/env/
```

**重要**：模板是通用起点，实际项目几乎都需要根据目标 JS 的具体情况修改（补额外属性、调整 runtime helpers 等）。所有修改只能在项目 `env/` 目录下的副本上进行，**禁止修改 `scripts/` 下的原始模板**。

---

## 执行流程

### Step 1: 准备项目结构并下载原始 JS

**1a. 创建目录结构**：

```
<project>/
├── source/     # 原始 JS（本步骤下载）
├── env/        # 本步骤创建
├── nodejs/     # 本步骤创建
├── python/     # 后续创建
└── docs/
    └── progress.md  # 更新进展
```

如果目录不存在，创建它们。

**1b. 下载原始 JS 到 `source/`**：

**必须先完成此步，后续所有步骤依赖本地文件。** 使用 curl 或 wget 将加密入口所在的 JS 文件下载到 `source/` 目录：

```bash
curl -o <project>/source/<filename>.js "<script_url>"
```

**前置检查**：`ls <project>/source/` 确认文件存在且大小合理（非空），再进入下一步。不存在则必须下载，不得跳过。

---

### Step 2: 复制模板到项目

**必须先将模板复制到项目 `env/` 目录，后续所有操作只在项目副本上进行，禁止直接引用 `$SKILL_DIR` 下的原始模板。**

```bash
cp "$SKILL_DIR/scripts/proxy_monitor.js" <project>/env/
cp "$SKILL_DIR/scripts/webpack_runtime.js" <project>/env/
```

**前置检查**：确认复制成功：
```bash
ls <project>/env/proxy_monitor.js <project>/env/webpack_runtime.js
```

---

### Step 3: 准备 main.js

根据原始 JS 类型选择不同路径：

**情况 A — 非 webpack 单文件**（如 OB 混淆、独立 SDK）：
直接复制到 `env/main.js`。

**情况 B — webpack bundle**：
按以下步骤提取模块：
1. **先读源文件，确认 webpack 格式**。用 `head`/`Read` 查看文件开头和入口模块附近的代码，确认：模块表变量名、模块定义格式（`id:function(` 还是 `"id":function(`）、是否有多 chunk。**禁止凭 MCP 会话中的记忆直接写提取脚本，必须基于本地文件的实际格式。**
2. 从入口模块开始，搜索 `__webpack_require__(ID)` 或短名调用找出所有依赖
3. 编写 `nodejs/extract_modules.js` 提取模块，用 `<project>/env/webpack_runtime.js`（Step 2 的副本）作为模板构建 `env/main.js`
4. 运行后根据 `__webpack_modules__[id] is not a function` 报错逐步补充缺失模块

短名识别：模块函数第三个参数即 require，如 `function(ei, eo, ec)` 中 `ec` 就是 require。正则：`/[a-z]{1,2}\((\d{3,6})\)/g`（注意匹配 1-2 字母，不要只匹配单字母）。

**3b. 格式化（必须执行）**：

生成 `env/main.js` 后，**必须格式化**。webpack bundle 几乎都是压缩的单行文件，不格式化则后续报错行号无意义，严重影响调试效率。

```bash
npx prettier --write --tab-width 2 <project>/env/main.js 2>/dev/null || npx js-beautify -r <project>/env/main.js
```

**检查点**：格式化后用 `wc -l <project>/env/main.js` 确认行数 > 100（压缩文件格式化前通常只有 1 行）。`source/` 中的原始文件不动。

**3c. 导出加密入口（必须执行）**：

格式化后，在 `env/main.js` 中找到加密函数定义处，**直接修改 JS，加一行导出到 global**（参见「核心原则」）。例如：`global.__encrypt__ = i;`。这样 Step 6 的 `sign.js` 直接调用 `global.__encrypt__` 即可，不需要复杂的提取逻辑。

---

### Step 4: Proxy 监控首次运行

1. `env/proxy_monitor.js` 已在 Step 2 复制到位
2. 用 `evaluate_script` 从浏览器获取 cookie 和 URL
3. 编写 `env/run.js`：

```javascript
const monitor = require("./proxy_monitor");
monitor.init({ cookie: "...", url: "https://..." });
const main = require("./main.js");
// 调用入口函数，触发加密逻辑
// 超时退出：setTimeout(() => process.exit(0), 10000);
```

4. 运行 `node env/run.js`，读取诊断报告

---

### Step 5: 补环境迭代

分两阶段处理报告，两阶段都完成才能进入下一步。

#### 阶段 A：修 ERRORS（代码能跑）

`[ERRORS]` 中的项必须修复，否则代码无法运行。通常是缺失的环境 API。

#### 阶段 B：补 UNDEFINED（指纹完整）

**这是核心步骤**。`[UNDEFINED]` 中的属性是代码访问了但环境中没有的，大部分参与指纹生成。不补会导致签名被风控识别。

**处理规则：默认全补，只跳过确认无关的**。具体流程：

1. 收集报告中所有 UNDEFINED 路径
2. 用 `evaluate_script` 批量从浏览器获取这些属性的真实值：
```javascript
evaluate_script({ function: `() => JSON.stringify({
    "document.createEvent": typeof document.createEvent,
    "document.fonts": !!document.fonts,
    "window.chrome": !!window.chrome,
    "window.indexedDB": !!window.indexedDB,
    "navigator.storage": !!navigator.storage,
    // ... 报告中的每个 undefined 路径
})` })
```
3. 浏览器中也是 undefined → 跳过（两边一致，不影响）
4. 浏览器中有值 → **必须补**，用 `evaluate_script` 取具体值，写入 `proxy_monitor.js` 的 `init()` 中对应的 fake 对象
5. 补完后重新运行，直到 UNDEFINED 列表中只剩浏览器也没有的属性

**退出条件**：ERRORS = 0，且 UNDEFINED 中每一项都已确认浏览器中也是 undefined。

补环境的代码直接修改项目 `env/proxy_monitor.js` 的 `init()` 函数中的 fake 对象。

---

### Step 6: 封装签名接口

编写 `env/sign.js` 封装调用接口。加密函数已在 Step 3c 导出到 `global`，这里直接调用：

```javascript
require("./proxy_monitor").init({ cookie: "", url: "..." });
// process 退出时不输出报告
process.removeAllListeners("exit");
require("./main.js");

function sign(input) {
    // 直接调用 Step 3c 导出的全局函数
    return global.__encrypt__(JSON.stringify(input));
}
module.exports = sign;
```

接口设计目标：输入明文参数，输出加密结果。如果调用时需要额外参数（如加密模式），在浏览器中断点观察真实调用方式，然后直接模拟。

---

### Step 7: 验证

**签名格式验证**：运行 `sign.js`，检查输出格式是否与浏览器中观察到的一致。

**实际请求验证**：编写 `python/test_request.py`，用生成的签名发送真实 API 请求（1 次即可）。

验证必须检查两个层面：

1. **HTTP 层**：状态码 200
2. **业务层**：响应中包含实际业务数据（不能只看状态码）

编写验证脚本前，先用 `evaluate_script` 或 `get_network_request` 在浏览器中观察一次正常响应的结构，确定业务数据的判断依据（如哪个字段非空、列表长度 > 0 等）。

判定标准：

- 拿到业务数据 → 通过，补环境完成
- 200 但业务数据为空（如列表为空、count=0）→ **未通过**，签名可能被风控降级（返回空数据而非拒绝）
- 出现 403 → 签名错误或缺少 cookie/header
- 出现 412 / forbidden → 风控检测未通过

**验证失败时的排查流程**：

不要直接回到 Step 5 盲目补环境。先定位问题是**请求参数不全**还是**环境不全**：

1. **对比浏览器请求**：在浏览器中触发一次真实请求，用 `get_network_request` 获取完整请求参数，逐字段对比 Python 脚本发送的参数，找出缺失或不同的字段
2. **对比加密明文**：在浏览器中断点拦截加密前的明文对象，对比 Python 脚本构造的明文，检查是否缺少字段（如环境检测结果、指纹值等）
3. 明文字段缺失 → 补充字段（可能需要从浏览器获取值或理解生成逻辑）
4. 明文一致但结果仍被拒 → 才回到 Step 5 检查环境补丁

验证通过后更新 `docs/progress.md`，标记阶段完成。

---

## 常见问题

**`__webpack_modules__[id] is not a function`**
依赖缺失。从报错的 id 在原始 JS 中搜索并提取该模块，加入 `main.js`。

**签名生成了但请求 403/412**
回到 Step 4 阶段 B，检查 UNDEFINED 列表是否还有未补的指纹属性。用浏览器完整 cookie 重试。

**VM/JSVMP 保护的代码**
补环境的优势正在于此——不需要理解 VM 内部逻辑，只需要满足它对外部环境的需求。

# JSHook Reverse Tool

**AI-powered JavaScript Reverse Engineering Skill for Claude Code**
**AI 驱动的 JavaScript 逆向工程工具（Claude Code Skill）**

---

## Features | 功能特性

### Core Capabilities | 核心能力

| Feature | 功能 | Description | 描述 |
|---------|------|-------------|------|
| Smart Code Collection | 智能代码收集 | Summary/Priority/Incremental modes, prevents token overflow | 摘要/优先级/增量模式，防止 Token 溢出 |
| AI Deobfuscation | AI 反混淆 | 20+ obfuscation types, auto-restore code | 支持 20+ 种混淆类型，自动还原代码 |
| Code Understanding | 代码理解 | AI-assisted semantic analysis and business logic | AI 辅助语义理解和业务逻辑分析 |
| Crypto Detection | 加密检测 | AES/RSA/MD5/SHA and custom algorithm detection | 自动识别标准算法和自定义加密 |
| CDP Debugger | CDP 调试器 | Breakpoints, stepping, variable inspection, watch expressions | 断点、单步、变量查看、监视表达式 |
| Hook Injection | Hook 注入 | Function interception, network monitoring, property hijacking | 函数拦截、网络监控、属性劫持 |
| Anti-Detection | 反检测伪装 | 16 stealth features, 5 platform presets, fingerprint spoofing | 16 项反检测功能、5 种平台预设、指纹伪造 |
| Browser Automation | 浏览器自动化 | Auto-detect Chrome/Edge on any drive (C-Z) | 自动检测任意盘符的 Chrome/Edge |
| DOM Inspector | DOM 检查 | Element query, structure analysis, clickable element detection | 元素查询、结构分析、可点击元素定位 |
| Page Controller | 页面控制 | Navigation, click, input, screenshot, performance metrics | 导航、点击、输入、截图、性能监控 |

### Technical Highlights | 技术亮点

- **CDP Connection** | **CDP 连接** — Chrome DevTools Protocol, stable and reliable | 稳定可靠
- **AST Analysis** | **AST 分析** — Babel-based code parsing, pattern recognition, constant detection | 基于 Babel 的代码解析、模式识别、常量检测
- **Security Audit** | **安全审计** — Weak algorithm detection, insecure config warnings, strength scoring | 弱算法检测、不安全配置告警、强度评分
- **Resource Management** | **资源管理** — Proper CDP session cleanup, memory leak prevention | 完善的 CDP 会话清理，防止内存泄漏
- **Type Safety** | **类型安全** — Strict TypeScript type checking | 严格的 TypeScript 类型检查

---

## Installation | 安装

```bash
git clone https://github.com/wuji66dde/jshook-skill.git
cd jshook-skill
npm install
npm run build
```

---

## Configuration | 配置

Copy `.env.example` to `.env` and set your API keys:
复制 `.env.example` 到 `.env` 并配置 API 密钥：

```bash
cp .env.example .env
```

```env
# OpenAI API
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4

# Or Anthropic | 或使用 Anthropic
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Default LLM Provider | 默认 LLM 提供商
DEFAULT_LLM_PROVIDER=openai

# Remote Debugging Port | 远程调试端口 (optional)
REMOTE_DEBUGGING_PORT=9222
```

---

## Usage as Claude Code Skill | 作为 Claude Code Skill 使用

Add this repository URL to your Claude Code skill configuration:
将此仓库 URL 添加到 Claude Code Skill 配置中：

```
https://github.com/wuji66dde/jshook-skill
```

Then use commands directly in Claude Code:
然后在 Claude Code 中直接使用命令：

```
/jshook-reverse collect https://example.com
/jshook-reverse search "encrypt"
/jshook-reverse deobfuscate "var _0x1234=..."
```

---

## Commands Reference | 命令参考

### Code Collection & Search | 代码收集与搜索

```bash
# Collect code | 收集代码
collect <url>
collect <url> --smart-mode=summary
collect <url> --smart-mode=priority --priorities=encrypt,sign
collect <url> --compress --max-total-size=5000000

# Search in scripts | 搜索脚本
search <keyword>
search "X-Bogus" --context=10
search "function.*encrypt" --regex --max-matches=50
```

### Code Analysis | 代码分析

```bash
# AI deobfuscation | AI 反混淆
deobfuscate <code>

# Code understanding | 代码理解
understand <code>
understand <code> --focus=security

# AI summary | AI 摘要
summarize code <code>
summarize collected
summarize collected --batch

# Crypto detection | 加密检测
detect-crypto <code>
```

### Browser Control | 浏览器控制

```bash
# Browser lifecycle | 浏览器生命周期
browser launch          # Auto-detect & launch | 自动检测并启动
browser status          # Check status | 查看状态
browser close           # Close browser | 关闭浏览器
```

### Debugger | 调试器

```bash
# Debugger control | 调试器控制
debugger enable
debugger disable
debugger status
debugger init-advanced  # Init Watch/XHR/Event/Blackbox | 初始化高级功能

# Breakpoints | 断点管理
breakpoint set-url https://example.com/app.js 100
breakpoint set-url https://example.com/app.js 100 0 'x > 10'  # Conditional | 条件断点
breakpoint set-script <scriptId> <line>
breakpoint list
breakpoint remove <id>
breakpoint clear

# Execution control | 执行控制
debug-step pause
debug-step resume
debug-step into         # Step Into | 单步进入
debug-step over         # Step Over | 单步跳过
debug-step out          # Step Out | 单步跳出

# Expression evaluation | 表达式求值
debug-eval window.location.href
debug-eval document.cookie
debug-eval JSON.stringify(userData)

# Variable inspection | 变量查看
debug-vars
debug-vars <callFrameId>
```

### Script Management | 脚本管理

```bash
script list             # List all loaded scripts | 列出所有已加载脚本
script get <scriptId>   # Get script source | 获取脚本源码
script find *app.js     # Find by URL pattern | 按 URL 模式查找
script search encrypt   # Search in scripts | 搜索脚本内容
```

### Watch Expressions | 监视表达式

```bash
watch add "window.location.href" "Current URL"
watch add "userData.token"
watch list
watch evaluate          # Evaluate all watches | 求值所有监视表达式
watch remove <id>
watch export
watch import <json>
watch clear
```

### XHR Breakpoints | XHR 断点

```bash
xhr-breakpoint set */api/*
xhr-breakpoint set *sign*
xhr-breakpoint list
xhr-breakpoint remove <id>
xhr-breakpoint clear
```

### Event Breakpoints | 事件断点

```bash
event-breakpoint set click
event-breakpoint set-mouse       # All mouse events | 所有鼠标事件
event-breakpoint set-keyboard    # All keyboard events | 所有键盘事件
event-breakpoint set-timer       # Timer events | 定时器事件
event-breakpoint set-websocket   # WebSocket events | WebSocket 事件
event-breakpoint list
event-breakpoint remove <id>
event-breakpoint clear
```

### Blackbox | 脚本黑盒化

```bash
blackbox set *jquery*.js
blackbox set *node_modules/*
blackbox set-common     # Blackbox common libs | 黑盒化常用库
blackbox list
blackbox remove <pattern>
blackbox clear
```

### Hook Injection | Hook 注入

```bash
# Quick generate | 快速生成
hook generate function encryptData
hook generate fetch */api/*
hook generate xhr *sign*
hook generate property window.navigator
hook generate cookie
hook generate websocket
hook generate eval
hook generate timer

# Management | 管理
hook list
hook remove <id>
hook enable <id>
hook disable <id>
hook clear
hook anti-debug         # Anti-debug bypass | 反调试绕过
hook export json
hook-data               # View captured data | 查看捕获数据
hook-data <hookId>
hook-types              # List hook types | 列出 Hook 类型
```

### Anti-Detection Stealth | 反检测伪装

```bash
stealth inject                          # Default injection | 默认注入
stealth inject-preset windows-chrome    # Platform preset | 平台预设
stealth inject-preset mac-safari
stealth inject-preset mac-chrome
stealth inject-preset linux-chrome
stealth inject-preset windows-edge
stealth set-ua windows                  # Set User-Agent
stealth presets                         # List presets | 列出预设
stealth status                          # Injection status | 注入状态
stealth features                        # List all features | 列出所有功能
```

**Stealth Features (16 items) | 反检测功能（16 项）：**

| Feature | 功能 | Description | 描述 |
|---------|------|-------------|------|
| hideWebdriver | 隐藏 WebDriver | Hide `navigator.webdriver` | 隐藏 WebDriver 属性 |
| mockChrome | 模拟 Chrome | Simulate `window.chrome` object | 模拟 Chrome 对象 |
| canvasNoise | Canvas 噪声 | Session-level random seed fingerprint noise | 会话级随机种子指纹噪声 |
| webglVendor | WebGL 厂商 | Override WebGL vendor/renderer | 覆盖 WebGL 厂商和渲染器 |
| audioNoise | Audio 噪声 | AudioContext fingerprint noise | AudioContext 指纹噪声 |
| navigatorProps | Navigator 属性 | Consistent platform/vendor/cores/memory | 一致的平台/厂商/核心数/内存 |
| permissionsAPI | Permissions API | Fix Permissions API detection | 修复 Permissions API 检测 |
| batteryAPI | Battery API | Simulate Battery API | 模拟 Battery API |
| mediaDevices | MediaDevices | Simulate media devices | 模拟媒体设备 |
| notifications | Notifications | Simulate Notifications API | 模拟 Notifications API |
| networkInfo | NetworkInfo | Simulate NetworkInformation API | 模拟网络信息 API |
| hasFocus | hasFocus | Override `document.hasFocus()` | 覆盖 hasFocus |

### DOM Inspector | DOM 检查器

```bash
dom query #login-button
dom query-all .product-item 20
dom structure 3 true            # Depth 3, include text | 深度 3，包含文本
dom clickable 登录               # Find clickable by text | 按文本查找可点击元素
dom style #header
dom wait .loading-spinner 5000  # Wait for element | 等待元素出现
```

### Page Controller | 页面控制器

```bash
page navigate https://example.com
page reload
page back
page forward
page click #submit-button
page type #username admin
page select #country US
page hover .menu-item
page scroll 0 500
page wait-selector .result
page wait-nav
page eval document.title
page url
page title
page content
page screenshot output.png
page metrics
```

### Utility | 工具命令

```bash
stats                   # Collection & cache stats | 收集和缓存统计
stats --type=cache
clear                   # Clear all data | 清除所有数据
```

---

## Reverse Engineering Workflow | 逆向工程工作流

A typical JS reverse engineering session:
典型的 JS 逆向工程流程：

```
1. Launch browser & collect | 启动浏览器并收集
   browser launch
   collect https://target.com

2. Reconnaissance | 快速侦查
   search "encrypt"
   search "sign"
   search "token"
   detect-crypto <suspicious_code>

3. Locate target function | 定位目标函数
   script list
   script find *app*.js
   script search "X-Bogus"

4. Dynamic analysis | 动态分析
   debugger enable
   breakpoint set-url https://target.com/app.js 1234
   xhr-breakpoint set */api/sign*
   debug-step pause → into → over
   debug-vars
   debug-eval <expression>

5. Hook & monitor | Hook 监控
   hook generate function encryptData
   hook generate fetch */api/*
   hook-data

6. Deobfuscate & understand | 反混淆与理解
   deobfuscate <obfuscated_code>
   understand <clean_code> --focus=security

7. Reproduce | 复现逻辑
   Based on analysis results, reproduce the encryption/signing logic
   根据分析结果，复现加密/签名逻辑
```

---

## Project Structure | 项目结构

```
jshook-skill/
├── src/
│   ├── skill/                  # Skill entry & router | Skill 入口和路由
│   │   └── SkillRouter.ts      # Command dispatcher (30+ commands) | 命令分发器
│   ├── modules/
│   │   ├── collector/          # Code collection | 代码收集
│   │   │   ├── CodeCollector.ts        # Main collector | 主收集器
│   │   │   ├── SmartCodeCollector.ts   # Smart modes | 智能模式
│   │   │   ├── CodeCompressor.ts       # Compression | 压缩
│   │   │   ├── CodeCache.ts            # Caching | 缓存
│   │   │   ├── DOMInspector.ts         # DOM inspection | DOM 检查
│   │   │   └── PageController.ts       # Page control | 页面控制
│   │   ├── debugger/           # CDP debugger | CDP 调试器
│   │   │   ├── DebuggerManager.ts      # Core debugger | 核心调试管理
│   │   │   ├── RuntimeInspector.ts     # Runtime inspection | 运行时检查
│   │   │   ├── ScriptManager.ts        # Script management | 脚本管理
│   │   │   ├── WatchExpressionManager.ts   # Watch expressions | 监视表达式
│   │   │   ├── XHRBreakpointManager.ts     # XHR breakpoints | XHR 断点
│   │   │   ├── EventBreakpointManager.ts   # Event breakpoints | 事件断点
│   │   │   └── BlackboxManager.ts      # Script blackboxing | 脚本黑盒化
│   │   ├── crypto/             # Crypto detection | 加密检测
│   │   │   ├── CryptoDetector.ts       # Main detector | 主检测器
│   │   │   ├── CryptoDetectorEnhanced.ts   # AST analysis | AST 分析
│   │   │   └── CryptoRules.ts          # Detection rules | 检测规则
│   │   ├── deobfuscator/       # Deobfuscation | 反混淆
│   │   │   ├── Deobfuscator.ts         # Main deobfuscator | 主反混淆器
│   │   │   ├── AdvancedDeobfuscator.ts # Advanced patterns | 高级模式
│   │   │   ├── ASTOptimizer.ts         # AST optimization | AST 优化
│   │   │   ├── JSVMPDeobfuscator.ts    # JSVMP cracking | JSVMP 破解
│   │   │   └── PackerDeobfuscator.ts   # Packer unpacking | Packer 解包
│   │   ├── hook/               # Hook injection | Hook 注入
│   │   │   ├── HookManager.ts          # Hook management | Hook 管理
│   │   │   ├── HookCodeBuilder.ts      # Code generation | 代码生成
│   │   │   ├── HookTypeRegistry.ts     # Type registry | 类型注册
│   │   │   └── AIHookGenerator.ts      # AI-assisted hooks | AI 辅助生成
│   │   ├── stealth/            # Anti-detection | 反检测
│   │   │   └── StealthScripts2025.ts   # Stealth scripts | 隐身脚本
│   │   ├── analyzer/           # Code analysis | 代码分析
│   │   │   ├── CodeAnalyzer.ts         # Code analyzer | 代码分析器
│   │   │   └── AISummarizer.ts         # AI summarizer | AI 摘要器
│   │   └── browser/            # Browser management | 浏览器管理
│   │       └── BrowserModeManager.ts   # Browser modes | 浏览器模式
│   ├── services/
│   │   └── LLMService.ts      # LLM API service | LLM API 服务
│   ├── types/
│   │   └── index.ts            # TypeScript types | 类型定义
│   ├── utils/                  # Utilities | 工具类
│   └── skill.ts                # Entry point | 入口文件
├── skill.json                  # Skill configuration | Skill 配置
├── package.json
└── tsconfig.json
```

---

## Development | 开发

```bash
# Dev mode (hot reload) | 开发模式（热重载）
npm run dev

# Build | 构建
npm run build

# Format code | 格式化代码
npm run format
```

---

## Requirements | 环境要求

- **Node.js** >= 18.0.0
- **Browser** | **浏览器**: Chrome or Edge (auto-detected | 自动检测)
- **LLM API Key** | **LLM API 密钥**: OpenAI or Anthropic (for AI features | AI 功能需要)

---

## License | 许可证

GPL-3.0

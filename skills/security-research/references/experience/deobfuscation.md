# Deobfuscation Experience

反混淆的目标是恢复可验证逻辑，不是一次性“美化”。每一步都保留中间文件并做语法或行为检查。

## Applies When

- JavaScript 出现 `_0x`、字符串数组、控制流平坦化、`eval`、`Function`、Webpack bundle、JSVMP。
- Python 出现 `marshal`、`base64`、`zlib`、`eval/exec`、PyInstaller、pyarmor 痕迹。
- PowerShell 出现 UTF-16LE base64、反引号拼接、`IEX`、压缩流。
- VBA/Office 出现字符串拼接、Chr/Asc、隐藏流、AutoOpen。
- Native 样本中字符串运行时解密或配置加密。

## General Workflow

1. 保存原始文件到 `source/original/`。
2. 做指纹：大小、hash、语言、混淆类型、入口点。
3. 每种变换单独一步，输出 `intermediate/stepN.*`。
4. 每步后做语法检查或抽样行为对比。
5. 最终输出和脚本一起保存，脚本比结果更可复用。

## JavaScript

首选路线：

1. 如果是签名/参数定位，先用 `reverse-master` 的 `rev-js-crypto-entry`，不要先整包反混淆。
2. 如果是常见 obfuscator.io/string-array/control-flow，先用 `reverse-master` 的 `rev-js-deobfuscator-cli`。
3. 如果需要定制 AST，读 `reverse-master` 的 `rev-js-ast`。
4. 用 `reverse-master-skills/scripts/reusable/js/obfuscation-fingerprint.js` 先做特征报告。

关键经验：

- 静态搜不到字符串时，先从调用方、请求构造器、XHR/fetch 断点找边界。
- `Step 2` 常量折叠和 `Step 5` 死代码移除要循环，不要只跑一次。
- Webpack bundle 先拆模块再处理。
- 反调试删除后要重新 parse-check。
- 不确定语义的变量不要强行重命名。

## Python

路线：

- 简单 base64/hex/zlib/gzip/rot13 层：先用 `reverse-master-skills/scripts/reusable/python/layer_decoder.py`。
- marshal/pyc：提取 code object 后用对应 Python 版本反编译。
- PyInstaller：先抽取归档，再处理 pyc 和运行时资源。
- pyarmor 或商业保护：记录版本、导入钩子、运行时文件，转动态分析或内存提取。

验证：

```bash
python -m py_compile recovered.py
python recovered.py --help
```

## PowerShell

常见顺序：

1. UTF-16LE base64 解码。
2. 展开反引号和字符串拼接。
3. 解压 Deflate/Gzip/Base64 组合。
4. 替换 `IEX` 为输出或写文件。
5. 用 ScriptBlockLogging 或隔离 PowerShell 观察最终脚本。

不要直接执行未知 payload；把执行边界替换成打印/保存。

## VBA / Office

工具路线：

```bash
olevba document.docm
oledump.py -s A document.docm
oledump.py -s A -v document.docm
```

记录 AutoOpen/Document_Open、外部进程、下载器、字符串解码函数和 IOC。

## Pitfalls

- 把格式化当成反混淆，实际字符串和控制流没有恢复。
- 对所有样本套同一个 AST transform，引入语义错误。
- 删除死代码前没有检查副作用。
- 解码脚本覆盖原始文件。
- 忽略语言运行时版本，导致 pyc/marshal 反编译失败。
- 只保存 deobf 输出，不保存生成它的脚本和参数。

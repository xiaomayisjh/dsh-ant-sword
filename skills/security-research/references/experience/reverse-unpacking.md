# Reverse And Unpacking Experience

本文件用于二进制、移动、Python 打包、样本分析和 CTF 逆向中的脱壳路线选择。

## Applies When

- 高熵节区、异常入口点、少量导入、TLS callback、自解压、自修改、反调试。
- DIE/Detect-It-Easy、pestudio、file、strings 指向 UPX、PyInstaller、AutoIt、.NET packer、APK 加固、壳名称。
- 静态反编译只有壳代码，核心逻辑运行后才出现。

## Triage First

先做不破坏样本的静态体检：

```bash
file sample
sha256sum sample
diec sample
strings -a -n 8 sample | head
python scripts/reusable/pe_entropy_triage.py sample --json triage.json
```

记录：

- 文件格式、架构、入口点、编译器/壳识别
- 节区名、权限、raw/virtual size、熵值
- 导入表是否稀疏，是否只有 `LoadLibrary`/`GetProcAddress`
- TLS callback、overlay、资源段、异常节名

## Route Matrix

| Signal | Route | Validation |
|---|---|---|
| UPX 标识或典型节区 | 先 `upx -d` 到副本 | 解包后入口点/导入/字符串恢复 |
| PyInstaller | `pyinstxtractor` 后处理 `.pyc` | 能列出 `PYZ` 和入口脚本 |
| .NET | dnSpy/ILSpy/de4dot 类工具 | IL 可读且入口函数合理 |
| AutoIt | myAutToExe/Exe2Aut 类工具 | 恢复 `.au3` 或脚本资源 |
| Windows native packer | x64dbg 找 OEP，dump，Scylla 修 IAT | Dump 能重新加载并进入原逻辑 |
| Android 加固 | 交给 `reverse-master` 的 `rev-bin-dex-dumper` | dump DEX 非空，可被 jadx 解析 |
| Python 混淆/打包 | 交给 `reverse-master` 的 `rev-python-de4py` 或 `layer_decoder.py` | 输出能 `py_compile` 或反编译 |

## Native Dump Workflow

1. 在副本上调试，保留原始样本 hash。
2. 通过 ESP 定律、跨节跳转、`VirtualAlloc`/`VirtualProtect`/`WriteProcessMemory`、反调试返回点定位 OEP。
3. 在 OEP 处 dump 内存映像，保存为 `dump/raw/`。
4. 修 IAT，保存为 `dump/fixed/`。
5. 用 PE 工具重新检查入口点、导入表、节区权限、字符串恢复情况。
6. 用最小运行验证：启动、关键函数命中、或核心字符串/配置可提取。

## Output Layout

```text
analysis/
  original/
    sample.bin
    sample.sha256
  triage/
    die.txt
    pe_entropy.json
    strings.txt
  dump/
    raw/
    fixed/
  notes/
    unpacking.md
```

## Pitfalls

- 没有 hash 和原始副本，后续无法判断 dump 是否来自同一版本。
- 只看壳名就套流程，忽略混合壳或二次保护。
- dump 后不修 IAT，静态工具误判为仍然加壳。
- 运行时 dump 没有记录断点、模块基址、OEP 和内存范围。
- Android dump 只看文件存在，不验证 DEX magic、大小和 jadx 可解析性。
- Python 解层时直接执行未知样本；优先用静态解码和隔离环境。

## Promotion Checklist

把脱壳经验升级为稳定 playbook 前，至少记录：

- 壳/打包器指纹
- 工具版本和命令
- 成功样本 hash
- 失败样本或不适用条件
- dump 验证方式

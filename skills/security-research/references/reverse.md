# 逆向工程参考

## IDA Pro

如果需要通过 IDA MCP 读取函数、交叉引用、字符串、段信息或反编译结果，先确认 IDA 当前数据库就是本次目标文件。若无法确认、未加载目标、自动分析未完成，或可能是上一次任务遗留的 IDB，先请求用户在 IDA 中打开需要分析的文件并等待自动分析完成，再使用 IDA MCP。不要基于未确认的 IDA MCP 状态继续分析。

```python
# 常用 IDAPython 片段

# 获取所有函数
import idautils, idc, idaapi
for func in idautils.Functions():
    print(hex(func), idc.get_func_name(func))

# 交叉引用
for ref in idautils.CodeRefsTo(ea, flow=False):
    print(hex(ref))

# 重命名函数
idc.set_name(ea, "my_func", idc.SN_CHECK)

# 批量注释
idc.set_cmt(ea, "comment", 0)

# 搜索字节序列
ea = idc.find_binary(0, idc.SEARCH_DOWN, "FF D0")  # call rax

# 枚举字符串
for s in idautils.Strings():
    print(str(s))

# 导出反编译结果
cfunc = idaapi.decompile(ea)
print(cfunc)
```

**常用快捷键：**
- `F5` 反编译
- `N` 重命名
- `X` 交叉引用
- `G` 跳转地址
- `Space` 切换图/文本视图
- `Alt+T` 文本搜索
- `Alt+B` 字节搜索

## Ghidra

```python
# Ghidra Script (Java/Python)

# 获取当前程序所有函数
from ghidra.program.model.listing import Function
fm = currentProgram.getFunctionManager()
for func in fm.getFunctions(True):
    print(func.getName(), func.getEntryPoint())

# 搜索字节
from ghidra.program.model.mem import MemoryAccessException
searchBytes = bytes([0x48, 0x89, 0xE5])  # push rbp; mov rbp,rsp
# 通过 Memory.findBytes() 搜索

# 修改函数名
func.setName("renamed_func", SourceType.USER_DEFINED)

# 获取注释
listing = currentProgram.getListing()
cu = listing.getCodeUnitAt(toAddr(0x401000))
cu.setComment(CodeUnit.PLATE_COMMENT, "entry point")
```

**Ghidra CLI 批量分析：**
```bash
analyzeHeadless /path/to/project ProjectName \
    -import target.exe \
    -postScript MyScript.py \
    -scriptPath /path/to/scripts \
    -deleteProject
```

## Binary Ninja

```python
import binaryninja as bn

bv = bn.open_view("target.bin")
bv.update_analysis_and_wait()

# 遍历函数
for func in bv.functions:
    print(func.name, hex(func.start))

# MLIL 中间语言分析
for block in func.medium_level_il:
    for instr in block:
        print(instr)

# 打补丁
bv.write(addr, b"\x90\x90")  # NOP

# 自定义类型
t = bn.Type.int(4, True)
bv.define_data_var(addr, t)
```

## Radare2 / r2

```bash
# 基本分析
r2 -A target          # 自动分析
aaa                   # 深度分析
afl                   # 列出函数
pdf @ main            # 反汇编 main
pdc @ main            # 伪代码

# 搜索
/ password            # 搜索字符串
/x 4889e5             # 搜索字节
/R pop rdi            # 搜索 ROP gadget

# 修改
wa nop @ 0x401000     # 写 NOP
wx 9090 @ 0x401000    # 写字节

# 调试模式
r2 -d target
db 0x401000           # 设断点
dc                    # 继续运行
dr                    # 查看寄存器

# 脚本
r2 -q -c "aaa; afl" target > funcs.txt
```

## GDB / pwndbg / peda

```bash
# pwndbg 常用命令
start                 # 运行到 main
context               # 查看上下文（寄存器/栈/代码）
n / s / ni / si       # 步过/步入
finish                # 运行到函数返回
telescope $rsp 20     # 查看栈内容（带解析）
vmmap                 # 内存映射
heap                  # 堆状态
bins                  # 堆 bin 状态
got                   # GOT 表
plt                   # PLT 表

# 断点
b *0x401000           # 地址断点
b main                # 函数断点
watch *0x601080       # 内存写监视
rwatch *addr          # 内存读监视

# 内存操作
x/20gx $rsp           # 查看栈
x/10i $rip            # 查看指令
set *0x601080 = 0x41  # 修改内存
search-pattern "/bin/sh"  # 搜索字符串

# 条件断点
b *0x401234 if $rdi == 0

# GDB 脚本
gdb -x script.gdb target
```

```python
# .gdbinit 示例
set disassembly-flavor intel
set follow-fork-mode child
set pagination off
set logging on
```

## x64dbg / WinDbg (Windows)

```
# x64dbg 常用
F2       设断点
F7/F8    步入/步过
F9       运行
Ctrl+G   跳转地址
Ctrl+F   搜索

# WinDbg 命令
bp 0x401000          # 断点
bl                   # 列出断点
g                    # 继续
p / t                # 步过/步入
k                    # 调用栈
dq rsp L10           # 查看栈
u rip L20            # 反汇编
.logopen c:\log.txt  # 开启日志
lm                   # 列出模块
!peb                 # 进程环境块
!teb                 # 线程环境块
```

## Frida 动态插桩

```python
import frida, sys

# 附加到进程
session = frida.attach("target.exe")

# 基本 hook 脚本
script = session.create_script("""
// Hook 函数
Interceptor.attach(ptr("0x401000"), {
    onEnter: function(args) {
        console.log("Called! arg0=" + args[0]);
        console.log("arg0 str: " + args[0].readUtf8String());
    },
    onLeave: function(retval) {
        console.log("Return: " + retval);
        retval.replace(1);  // 修改返回值
    }
});

// Hook API
Interceptor.attach(Module.getExportByName("kernel32.dll", "CreateFileW"), {
    onEnter: function(args) {
        console.log("CreateFile: " + args[0].readUtf16String());
    }
});

// 内存读写
var addr = ptr("0x401000");
console.log(hexdump(addr, { length: 64 }));
Memory.writeByteArray(addr, [0x90, 0x90]);

// 枚举模块
Process.enumerateModules().forEach(function(m) {
    console.log(m.name, m.base, m.size);
});

// 追踪所有调用
Stalker.follow(Process.getCurrentThreadId(), {
    events: { call: true },
    onReceive: function(events) {
        console.log(Stalker.parse(events));
    }
});
""")

script.on('message', lambda msg, data: print(msg))
script.load()
sys.stdin.read()
```

```bash
# Frida CLI
frida -p PID -l hook.js
frida -n "process_name" -l hook.js
frida-trace -n "target" -i "CreateFile*"  # 自动生成 hook
frida-ps -a                                # 列出进程
```

## 常见反调试绕过

```python
# IsDebuggerPresent
Interceptor.attach(Module.getExportByName("kernel32.dll", "IsDebuggerPresent"), {
    onLeave: function(retval) { retval.replace(0); }
});

# CheckRemoteDebuggerPresent
Interceptor.attach(Module.getExportByName("kernel32.dll", "CheckRemoteDebuggerPresent"), {
    onLeave: function(retval) {
        // pbDebuggerPresent 参数置 0
        this.args[1].writeInt(0);
    }
});

# NtQueryInformationProcess (ProcessDebugPort)
# 时间检测绕过：patch RDTSC 指令
```

## PE/ELF 文件分析

```python
# pefile (Windows PE)
import pefile
pe = pefile.PE("target.exe")

# 导入表
for entry in pe.DIRECTORY_ENTRY_IMPORT:
    print(entry.dll.decode())
    for imp in entry.imports:
        print("  ", hex(imp.address), imp.name)

# 导出表
for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
    print(hex(pe.OPTIONAL_HEADER.ImageBase + exp.address), exp.name)

# 节区信息
for section in pe.sections:
    print(section.Name, hex(section.VirtualAddress), 
          section.SizeOfRawData, section.get_entropy())

# 资源
for resource_type in pe.DIRECTORY_ENTRY_RESOURCE.entries:
    print(resource_type.name or resource_type.id)
```

```python
# pyelftools (Linux ELF)
from elftools.elf.elffile import ELFFile

with open("target", "rb") as f:
    elf = ELFFile(f)
    
    # 节区
    for section in elf.iter_sections():
        print(section.name, hex(section['sh_addr']))
    
    # 符号
    symtab = elf.get_section_by_name('.symtab')
    for sym in symtab.iter_symbols():
        print(sym.name, hex(sym['st_value']))
    
    # 动态链接
    dynamic = elf.get_section_by_name('.dynamic')
```

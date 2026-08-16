# CTF Crypto - Modern Cipher Attacks (Part 3)

Custom-construction and protocol-level weaknesses: hash-state inversion, CRC32 brute-force, noisy oracles, sponge collisions, CBC IV forgery, padding-oracle-to-bitflip chaining, SPN key recovery, and flawed MAC/HMAC arithmetic. For core AES/CBC/padding-oracle technique, see [modern-ciphers.md](modern-ciphers.md). For the hash/protocol/ECB set, see [modern-ciphers-2.md](modern-ciphers-2.md).

## Table of Contents
- [Custom Hash State Reversal via Known Intermediates (BackdoorCTF 2016)](#custom-hash-state-reversal-via-known-intermediates-backdoorctf-2016)
- [CRC32 Brute-Force for Small Payloads (BackdoorCTF 2016)](#crc32-brute-force-for-small-payloads-backdoorctf-2016)
- [Noisy RSA LSB Oracle with Post-Hoc Error Correction (SharifCTF 7 2016)](#noisy-rsa-lsb-oracle-with-post-hoc-error-correction-sharifctf-7-2016)
- [Sponge Hash Collision via Meet-in-the-Middle on Partial State (BKP 2017)](#sponge-hash-collision-via-meet-in-the-middle-on-partial-state-bkp-2017)
- [CBC IV Forgery + Block Truncation for Authentication Bypass (0CTF 2017)](#cbc-iv-forgery--block-truncation-for-authentication-bypass-0ctf-2017)
- [Padding Oracle to CBC Bitflip Command Injection (BSidesSF 2017)](#padding-oracle-to-cbc-bitflip-command-injection-bsidessf-2017)
- [SPN Cipher Partial Key Recovery via S-Box Intersection (SharifCTF 7 2016)](#spn-cipher-partial-key-recovery-via-s-box-intersection-sharifctf-7-2016)
- [AES-CFB IV Recovery from Timestamp-Seeded PRNG](#aes-cfb-iv-recovery-from-timestamp-seeded-prng)
- [Three-Round XOR Protocol Key Cancellation](#three-round-xor-protocol-key-cancellation)
- [AES-CBC UnicodeDecodeError Side-Channel Oracle](#aes-cbc-unicodedecodeerror-side-channel-oracle)
- [SHA-256 Basis Attack for XOR-Aggregate Hash Bypass](#sha-256-basis-attack-for-xor-aggregate-hash-bypass)
- [Custom MAC Forgery via XOR Block Cancellation with Key Rotation (PlaidCTF 2018)](#custom-mac-forgery-via-xor-block-cancellation-with-key-rotation-plaidctf-2018)
- [Bit-by-Bit HMAC Key Recovery via XOR Plus Addition Arithmetic (Midnight Sun CTF 2018)](#bit-by-bit-hmac-key-recovery-via-xor-plus-addition-arithmetic-midnight-sun-ctf-2018)

---

## Custom Hash State Reversal via Known Intermediates (BackdoorCTF 2016)

**Pattern:** A homemade iterative hash processes the message in fixed blocks and leaks (or lets you observe) intermediate states. If the per-block state update is invertible in the unknowns, isolate each block's contribution and brute-force it independently instead of attacking the whole preimage.

**Key insight:** invert the state-update equation to express one block's hash value from adjacent known intermediates, collapsing a large preimage search into independent per-block searches (each block often only 3-4 bytes of entropy).

```python
# state_{i+1} = update(state_i, block_i); if update is invertible in block_i:
for i in range(num_blocks):
    target = invert_update(state[i], state[i+1])   # isolate block_i's value
    for cand in itertools.product(PRINTABLE, repeat=BLOCK_LEN):
        if block_hash(bytes(cand)) == target:
            recovered.append(bytes(cand)); break
```

---

## CRC32 Brute-Force for Small Payloads (BackdoorCTF 2016)

**Pattern:** CRC32 is a non-cryptographic checksum, and ZIP stores the CRC32 of each entry in the (unencrypted) local file header even when the data is encrypted. For very small files the CRC32 alone identifies the content: enumerate all candidate strings and match the stored checksum.

**Key insight:** with content ≤ 6 printable bytes the search space (95^6 ≈ 7.4e11 worst case, far less for known charset/length) is brute-forceable, and CRC32 is not collision-resistant, so a match almost certainly recovers the plaintext.

```python
import zlib, itertools, string
target = 0x1a2b3c4d                       # CRC32 from the ZIP header
charset = (string.ascii_letters + string.digits + "_{}").encode()
for n in range(1, 7):
    for cand in itertools.product(charset, repeat=n):
        b = bytes(cand)
        if zlib.crc32(b) & 0xffffffff == target:
            print("recovered:", b); raise SystemExit
```

Also works to recover short flags/passwords whenever only a CRC32 is exposed. For larger data CRC32 is many-to-one, so corroborate with a second constraint.

---

## Noisy RSA LSB Oracle with Post-Hoc Error Correction (SharifCTF 7 2016)

**Pattern:** A standard RSA LSB (parity) oracle recovers plaintext bit-by-bit via binary search over the modulus, but here the oracle answers incorrectly on a small fraction of queries. Run the textbook attack anyway, then repair the result using the known plaintext charset.

**Key insight:** sporadic oracle errors only perturb the low-order bound refinements. Recover the full range, then check the decoded output against the expected charset (ASCII/flag format); flip the oracle verdict at the positions where the decode is out-of-charset and re-run the affected interval bisections until the plaintext becomes well-formed.

```python
lo, hi = 0, N
mult = 1
for i in range(N.bit_length()):
    c2 = (c * pow(2, e*(i+1), N)) % N     # multiply plaintext by 2 each step
    if oracle_is_odd(c2):                  # LSB after doubling -> which half
        lo = (lo + hi + 1) // 2
    else:
        hi = (lo + hi) // 2
m = hi
# Post-hoc: if bytes(m) contains non-printable noise, revisit the steps whose
# oracle answer produced those bytes, flip them, and re-bisect that sub-range.
```

---

## Sponge Hash Collision via Meet-in-the-Middle on Partial State (BKP 2017)

**Pattern:** A sponge-construction hash with rate `r` smaller than the full state `b` leaves `c = b - r` capacity bits that the message does not directly control each absorb step. When the effective search is split across a controllable half and an uncontrolled half, a meet-in-the-middle collapses the collision cost.

**Key insight:** precompute forward absorptions keyed on the uncontrolled state bytes and store them; then search backward from the target for a match. This turns a 2^48-style birthday cost into two 2^24 tables.

```python
# Forward table on uncontrolled bytes, backward search for a match
forward = {}
for x in range(2**24):
    forward[permute(absorb(state0, encode(x)))[:HALF]] = x
for y in range(2**24):
    key = inverse_from_target(target, encode(y))[:HALF]
    if key in forward:
        print("collision:", forward[key], y); break
```

---

## CBC IV Forgery + Block Truncation for Authentication Bypass (0CTF 2017)

**Pattern:** A token is `IV || CBC-encrypted(fields)` with an embedded MAC/marker and *no length integrity*. Two independent malleability facts combine: (1) flipping IV bytes flips the corresponding plaintext bytes of block 0 (`P0 = D(C0) XOR IV`); (2) dropping trailing ciphertext blocks silently truncates the decrypted message because CBC has no built-in length check.

**Key insight:** if authentication data sits in block 0 or in a suffix, XOR the IV to rewrite block 0 to a privileged value, and/or strip trailing blocks to cut off a check — forging a valid-looking authenticated token without the key.

```python
# Flip byte j of plaintext block 0 from known->desired via the IV
iv_forged = bytearray(iv)
iv_forged[j] ^= known_p0[j] ^ desired_p0[j]
token = bytes(iv_forged) + ciphertext[:BLOCK*keep_blocks]   # truncate suffix
```

---

## Padding Oracle to CBC Bitflip Command Injection (BSidesSF 2017)

**Pattern:** Two primitives chained on the same CBC ciphertext. First a padding oracle recovers the plaintext of an encrypted parameter (so you learn the exact bytes and their block alignment). Then CBC bitflipping edits the previous ciphertext block to inject shell metacharacters into the now-known plaintext, achieving command injection through an "encrypted" field the app trusts.

**Key insight:** the padding oracle is reconnaissance (learn plaintext + offsets); the bitflip is the payload (`C_{i-1}[k] ^= P_known[k] ^ P_target[k]`). You need the recovered plaintext first so the flip lands on the right bytes.

```python
# 1) padding oracle -> recover intermediate D(C_i), hence plaintext P_i
# 2) inject: change plaintext byte k of block i to desired char
c_prev = bytearray(cipher_block(i-1))
c_prev[k] ^= p_known[i][k] ^ ord(';')      # e.g. splice in "; cat /flag ;"
forged = cipher[:BLOCK*(i-1)] + bytes(c_prev) + cipher[BLOCK*i:]
```

---

## SPN Cipher Partial Key Recovery via S-Box Intersection (SharifCTF 7 2016)

**Pattern:** A substitution-permutation-network cipher (custom or reduced) with a key applied per S-box position. Instead of brute-forcing the full key, attack each S-box independently: for each position, keep only the sub-key candidates consistent with a known plaintext-ciphertext pair, then intersect candidate sets across multiple pairs.

**Key insight:** divide-and-conquer turns an exponential key space into independent per-S-box searches; each additional (P, C) pair intersects the surviving candidates until one sub-key per position remains.

```python
candidates = [set(range(SBOX_KEYSPACE)) for _ in range(NUM_SBOXES)]
for P, C in known_pairs:
    for pos in range(NUM_SBOXES):
        ok = {k for k in candidates[pos] if partial_encrypt(P, pos, k) == C_slice(C, pos)}
        candidates[pos] &= ok            # intersect across pairs
key = [next(iter(s)) for s in candidates]
```

---

## AES-CFB IV Recovery from Timestamp-Seeded PRNG

**Pattern:** The IV (or a per-message nonce) is generated by a PRNG seeded from the current time. If the server discloses an approximate timestamp — a `Date` header, a log line, or a bounded request window — the seed space is tiny. Enumerate candidate seeds, regenerate the IV, and decrypt.

**Key insight:** CFB turns the block cipher into a stream keyed by the IV; recovering the IV (via the guessable seed) plus one known-plaintext block reveals keystream and hence the rest. Search seeds across the plausible time window and confirm with a known prefix or valid padding/charset.

```python
import random
for seed in range(t_lo, t_hi + 1):        # window from Date header, etc.
    random.seed(seed)
    iv = bytes(random.getrandbits(8) for _ in range(16))
    pt = aes_cfb_decrypt(key_or_keystream, iv, ct)
    if pt.startswith(KNOWN_PREFIX):
        print("seed", seed, pt); break
```

---

## Three-Round XOR Protocol Key Cancellation

**Pattern:** A "secure" handshake XORs a secret key into three exchanged messages (a Shamir-three-pass-style scheme done with XOR). Because XOR is commutative and self-inverse, XORing the three intercepted transcript values cancels the per-round masks and leaves the plaintext (or the key).

**Key insight:** if `A = M ⊕ Ka`, `B = A ⊕ Kb`, `C = B ⊕ Ka` (masks reused/commuting), then `A ⊕ B ⊕ C` collapses the reused key terms. XOR is the wrong primitive for a commutative three-pass because the masks cancel.

```python
recovered = bytes(a ^ b ^ c for a, b, c in zip(msg1, msg2, msg3))
```

---

## AES-CBC UnicodeDecodeError Side-Channel Oracle

**Pattern:** No explicit padding oracle, but the server decrypts then `.decode('utf-8')`s the plaintext and reacts differently (exception, 500, distinct error) when the bytes are not valid UTF-8. That differential is a plaintext-validity oracle usable much like a padding oracle to recover bytes via CBC bit manipulation.

**Key insight:** any observable that depends on decrypted-byte validity (UTF-8 decode success, JSON parse, charset check) is an oracle. Flip `C_{i-1}` bytes and classify responses by whether the forced plaintext byte lands in the valid range, recovering intermediate values one byte at a time.

```python
# For each byte position, vary C_{i-1}[k] until the decode-error signal flips,
# revealing D(C_i)[k]; then P_i[k] = D(C_i)[k] ^ C_{i-1}[k].
for k in range(BLOCK-1, -1, -1):
    for guess in range(256):
        cprev[k] = guess
        if not decode_error(send(cprev + c_block)):
            inter[k] = guess ^ pad_value(k); break
```

---

## SHA-256 Basis Attack for XOR-Aggregate Hash Bypass

**Pattern:** A scheme authenticates a set of items by XOR-aggregating their SHA-256 digests (`tag = H(x1) ⊕ H(x2) ⊕ ...`). Treat each 256-bit digest as a vector over GF(2); collect enough item digests to span the target and solve a linear system for a subset whose XOR equals the required tag — forging authorization without any secret.

**Key insight:** XOR of hashes is linear over GF(2), so authentication reduces to linear algebra. Gather >256 candidate items, build the digest matrix, and Gaussian-eliminate to express the target tag as a subset XOR.

```python
# Solve M^T x = target over GF(2); x selects which items to include
import numpy as np  # or sage/galois for exact GF(2) elimination
rows = [bits(hashlib.sha256(item).digest()) for item in candidates]  # each 256 bits
sol = gf2_solve(np.array(rows).T, bits(target_tag))   # subset achieving the tag
```

---

## Custom MAC Forgery via XOR Block Cancellation with Key Rotation (PlaidCTF 2018)

**Pattern:** A homemade MAC XORs a periodically repeating keystream over message blocks. Because the key rotation repeats, you can craft several queries whose *filler* blocks XOR-cancel across the period, so the residual MAC equals that of a target command you never legitimately submitted.

**Key insight:** when the key repeats every P blocks, arrange three (or P+1) queries so aligned filler blocks appear an even number of times and cancel under XOR, leaving the MAC of the desired message expressible as a XOR combination of observed MACs.

```python
# With period P and MAC linear in per-block key: choose fillers so they cancel
# mac(target) = mac(q1) ^ mac(q2) ^ mac(q3)   (aligned fillers appear evenly)
forged_tag = mac_q1 ^ mac_q2 ^ mac_q3
```

---

## Bit-by-Bit HMAC Key Recovery via XOR Plus Addition Arithmetic (Midnight Sun CTF 2018)

**Pattern:** A flawed "HMAC" computes `H = sha256((key XOR msg) + msg)` (mixing XOR and integer addition). Chosen-message queries leak the key one bit at a time.

**Key insight:** query `msg = 0` yields `sha256(key)`. Query `msg = 2^i` yields `sha256((key XOR 2^i) + 2^i)`; whether that equals `sha256(key)` (i.e. XOR+add collapse to a no-op) reveals whether bit `i` of the key is set — because `(k XOR 2^i) + 2^i == k` exactly when bit `i` of `k` is 1 (no carry) versus flips otherwise.

```python
base = query(0)                            # sha256(key)
key_bits = 0
for i in range(KEYBITS):
    if query(1 << i) == base:              # bit i set -> XOR+add cancels
        key_bits |= (1 << i)
```

The XOR-then-add mixing is not a PRF; each independent bit probe turns the "MAC" into a per-bit distinguisher.

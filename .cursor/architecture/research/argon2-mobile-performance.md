# Argon2id Performance on Mobile and CI — Research

## Context

The test `test_argon2_performance_suitable_for_mobile` fails in GitHub CI with:
```
Argon2id too slow for mobile (3844 ms)
```

Threshold: 50ms < elapsed < 3000ms. CI exceeded the upper bound.

## Research Summary

### Industry Recommendations

- **CipherTools / PHC**: Target **50–250ms** for interactive logins on the *slowest* device. "Measure on your slowest device, then increase memory or iterations until you reach ~250ms per hash."
- **Interactive mobile preset**: Argon2id, 64 MiB, 3 iterations, **p=1** (not p=4).
- **Rule of thumb**: "Target 50–250ms per hash for interactive logins. Users won't notice a quarter-second delay."

### Real-World Mobile Benchmarks

| Device / Environment | Argon2 64MB | Implementation | Source |
|---------------------|-------------|----------------|--------|
| Pixel 2 (2017) | ~3 s | Native C (KeePassDX) | [keepass2android#306](https://github.com/PhilippC/keepass2android/issues/306) |
| Snapdragon 835 | ~5 s | Native C (after fix) | Same issue |
| Samsung S7 (2016) | ~32 s | C# (before fix) | Same issue |
| Nexus 6P | Minutes | C# (70 rounds, 16 threads) | Same issue |
| GitHub Actions (2 vCPU) | ~3.8 s | Rust argon2 crate | This project |

### Findings

1. **3–5 seconds is normal** for Argon2id 64MB on real 2017–2018 smartphones with native implementations.
2. **CI is comparable to old phones**: 3.8s on GitHub’s 2 vCPU runners is in the same range as Pixel 2 / Snapdragon 835.
3. **3s threshold is too strict**: It rejects both CI and real older devices that complete in 3–5s.
4. **Parallelism**: Our p=4 vs recommended p=1 for mobile. On 2 vCPUs, p=4 may not help and can add overhead.

## Conclusion

The 3000ms cap does not match real-world mobile behavior. 3–5 seconds is typical for 64MB Argon2id on older phones. CI at 3.8s is consistent with that.

## Recommendation (Applied)

**Change parallelism p: 4 → 1** — least compromise on security:

- **Memory (64 MB)** and **iterations (3)** unchanged — main GPU/ASIC defenses preserved.
- **p=1** is the CipherTools/PHC interactive mobile preset.
- Crypto SE: "Parallelism should not make a large difference with regard to security. Adding threads only changes the latency of a single password hash, while the CPU time taken (over all threads) remains approximately the same."
- On constrained/CI (2 vCPU), p=4 adds thread overhead; p=1 is typically faster.

**Expected speedup**: ~2–4x on CI and single-core mobile (3.8s → ~1–2s).

**Breaking change**: Different p produces different keys. Existing encrypted wallets cannot be decrypted with new params. Users must re-enter password and re-create/import wallet, or a migration path (try legacy params, re-encrypt) must be implemented.

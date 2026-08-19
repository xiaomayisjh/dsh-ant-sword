# 安装问题修复总结

## 问题描述

运行 `dsh web` 时遇到错误：
```
Error: duplicate loader entry id: agent-teams
```

## 根本原因

在 `~/.dsh/profiles/web/package.json` 中，`dsh.profile.bundles` 数组包含了重复的 bundle 声明：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-ant-sword-harness",
  "@nanmicoder/dsh-agent-teams",  // ❌ 重复
  "dshmarket"                      // ❌ 重复
]
```

因为：
1. `@nanmicoder/dsh-agent-teams` 和 `dshmarket` 有自己的 `cordis.patch.yml`，会自动导出各自的 ID
2. `@deepseek-ai/dsh-ant-sword-harness` 的 `cordis.patch.yml` 也声明了这些 ID
3. 导致 ID 冲突

## 解决方案

从 `bundles` 数组中移除这两个包，让它们只通过 `ant-sword-harness` 来加载：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-ant-sword-harness"
]
```

## 修复步骤

1. **修复 web profile 配置**：
   - 编辑 `~/.dsh/profiles/web/package.json`
   - 从 `bundles` 数组移除 `@nanmicoder/dsh-agent-teams` 和 `dshmarket`

2. **重新安装（使用正确的安装脚本）**：
   ```powershell
   # Windows
   .\install-ant-sword.ps1 -Release .release/ant-sword-v0.1.0-rc.19
   ```
   
   ```bash
   # Linux/macOS
   ./install-ant-sword.sh --release .release/ant-sword-v0.1.0-rc.19
   ```

3. **验证修复**：
   ```bash
   # 确认 agent-teams 只出现一次
   dsh web --dump-config 2>&1 | grep -c "id: agent-teams"
   # 应该输出: 1
   ```

## 设计说明

`scripts/install-profile.mjs` 第 133 行的 `stripBundleLayers` 函数就是为了处理这个问题：

```javascript
stripBundleLayers(profileDir, ['@nanmicoder/dsh-agent-teams', 'dshmarket'])
```

这个函数会从 profile 的 `bundles` 数组中移除这些包，因为：
- 它们作为 `ant-sword-harness` 的 npm 依赖被安装
- 它们应该只通过 `ant-sword-harness` 的 `cordis.patch.yml` 来加载
- 不应该作为独立的 bundle layer

## 状态

✅ **已修复并验证**
- agent-teams 只出现 1 次（正确）
- dsh-market 正确加载
- `dsh web` 可以正常启动

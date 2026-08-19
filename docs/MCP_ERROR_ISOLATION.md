# MCP 错误隔离 (MCP Error Isolation)

## 概述

MCP 错误隔离确保单个 MCP 服务器的失败不会影响其他健康服务器的运行。这提高了系统的可用性和稳定性。

## 问题背景

在之前的实现中：
- `failOnStartupError: true` - 任何服务器启动失败都会导致整个 bundle 加载失败
- 服务器失败会回滚所有其他服务器的挂载
- 用户无法使用任何 MCP 工具，即使某些服务器是健康的

## 当前实现

### 核心特性

1. **独立失败处理**：每个 MCP 服务器有独立的生命周期
2. **错误报告**：失败的服务器会记录警告日志，但不阻止其他服务器
3. **零影响挂载**：健康服务器正常挂载，失败服务器被跳过
4. **热重载支持**：可以单独重载某个服务器而不影响其他服务器

### 实现细节

#### 启动配置

```typescript
const config: McpClientConfig = {
  // ...
  failOnStartupError: false,  // 启动失败不抛出异常
  reconnect: {
    enabled: true,
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    maxAttempts: 5
  }
}
```

#### 错误隔离

```typescript
private async reconcileServer(
  serverName: string,
  desired: McpServerConfig | undefined,
): Promise<void> {
  const current = this.fibers.get(serverName)
  if (current !== undefined) await this.disposeServer(serverName, current)
  
  if (desired === undefined || desired.enabled === false) return
  if (desired.transport === 'stdio' && !this.canResolveCommand(desired.command ?? '')) return
  
  try {
    const fiber = await this.mount(desired)
    this.fibers.set(serverName, fiber)
  } catch (error) {
    // 错误被隔离，只记录日志，不影响其他服务器
    this.reportFailure(serverName, 'failed to load', error)
  }
}
```

#### 批量协调

```typescript
prepare(next: AntSwordRuntimeConfig, previous: AntSwordRuntimeConfig): RuntimePreparedChange {
  // ...
  return {
    commit: () => this.enqueue(async () => {
      const changed = [...new Set([...previous.keys(), ...desired.keys()])]
        .filter(name => {
          const before = previous.get(name)
          const after = desired.get(name)
          return before === undefined || after === undefined || !sameConfig(before, after)
        })
      
      // 并行协调所有变更的服务器
      // 每个服务器的失败都被隔离
      await Promise.all(changed.map(name => this.reconcileServer(name, desired.get(name))))
      
      this.configs = desired  // 总是更新配置，即使某些服务器失败
    }),
    // ...
  }
}
```

## 使用场景

### 场景 1：部分服务器不可用

**配置**：
```json
{
  "mcpServers": [
    { "serverName": "kali", "transport": "stdio", "command": "kali-server-mcp" },
    { "serverName": "metasploit", "transport": "stdio", "command": "metasploitmcp" },
    { "serverName": "hexstrike", "transport": "stdio", "command": "hexstrike-ai" }
  ]
}
```

**情况**：`metasploitmcp` 命令不存在

**结果**：
- ✅ `kali` 服务器成功挂载
- ❌ `metasploit` 服务器失败，记录警告日志
- ✅ `hexstrike` 服务器成功挂载

**日志输出**：
```
[WARN] MCP server "metasploit" failed to load; skipping this server: Command not found: metasploitmcp
```

### 场景 2：运行时配置更新

**初始状态**：
- `server-a`: 健康运行，command = `old`

**更新配置**：
```json
{
  "mcpServers": [
    { "serverName": "server-a", "transport": "stdio", "command": "new" },
    { "serverName": "server-b", "transport": "stdio", "command": "bad" }
  ]
}
```

**情况**：`server-b` 的命令不存在

**结果**：
- ✅ `server-a` 从 `old` 更新到 `new`
- ❌ `server-b` 挂载失败，记录警告
- ✅ `server-a` 继续可用（未回滚）

### 场景 3：热重载单个服务器

```typescript
// 通过 API 重载某个服务器
await runtime.mcp.reload('kali')
```

**行为**：
- 只有 `kali` 服务器会被重启
- 其他服务器（`metasploit`、`hexstrike` 等）不受影响
- 如果 `kali` 重载失败，会尝试恢复之前的连接

## 测试覆盖

### 测试 1：多服务器错误隔离

```typescript
it('isolates one failed server without rolling back healthy servers', async () => {
  const { ctx, mounts, failNextMount, warnings } = fakeContext()
  const reconciler = new McpReconciler(ctx, undefined, () => true)
  
  const initial = configWithServers([{ serverName: 'healthy', command: 'old' }])
  await reconciler.prepare(initial, initial).commit()
  
  failNextMount('broken')

  const next = configWithServers([
    { serverName: 'healthy', command: 'new' },
    { serverName: 'broken', command: 'bad' },
  ])
  
  await expect(reconciler.prepare(next, initial).commit()).resolves.toBeUndefined()
  
  expect(reconciler.isMounted('healthy')).toBe(true)
  expect(reconciler.isMounted('broken')).toBe(false)
  expect(warnings).toHaveBeenCalledWith(expect.stringContaining('broken'))
})
```

### 测试 2：重载不影响其他服务器

```typescript
it('reloads one server without disturbing another server', async () => {
  const { ctx, mounts } = fakeContext()
  const reconciler = new McpReconciler(ctx, undefined, () => true)
  
  const initial = configWithServers([
    { serverName: 'first', command: 'one' },
    { serverName: 'second', command: 'two' },
  ])
  await reconciler.prepare(initial, initial).commit()

  await reconciler.reload('first')
  
  expect(mounts.map(item => item.config.command).sort()).toEqual(['one', 'one', 'two'])
  expect(reconciler.isMounted('first')).toBe(true)
  expect(reconciler.isMounted('second')).toBe(true)
})
```

## API

### 查询服务器状态

```http
GET /ant-sword/runtime-status
```

响应：
```json
{
  "mcpServers": [
    {
      "serverName": "kali",
      "enabled": true,
      "mounted": true,
      "transport": "stdio",
      "command": "kali-server-mcp"
    },
    {
      "serverName": "metasploit",
      "enabled": true,
      "mounted": false,
      "transport": "stdio",
      "command": "metasploitmcp"
    }
  ]
}
```

### 重载服务器

通过 UI 或 API 触发单个服务器的重载：

```typescript
// POST /ant-sword/runtime-status/reload
{
  "serverName": "kali"
}
```

### 探测服务器

测试服务器配置是否有效：

```typescript
// POST /ant-sword/runtime-status/probe
{
  "serverName": "kali"
}
```

响应：
```json
{
  "toolCount": 15,
  "tools": [
    { "name": "mcp__kali__nmap", "description": "Run nmap scan" },
    // ...
  ]
}
```

## 故障排查

### 服务器未挂载

1. **检查命令是否存在**：
   ```bash
   which <command>  # Linux/macOS
   where <command>  # Windows
   ```

2. **查看日志**：
   ```bash
   # DSH 日志会包含警告信息
   [WARN] MCP server "xxx" failed to load; skipping this server: <error details>
   ```

3. **检查配置**：
   - 确认 `enabled: true`
   - 确认 `transport` 类型正确
   - stdio: 需要 `command`
   - streamable-http: 需要 `url`

### 重载失败

重载操作可能失败的原因：
- 服务器配置无效
- 命令不存在
- 网络连接问题（HTTP transport）

如果重载失败，系统会尝试恢复之前的连接。

### 性能问题

如果某个服务器持续重连失败：
- 设置 `enabled: false` 禁用该服务器
- 或从配置中完全移除

## 最佳实践

1. **渐进式部署**：
   - 先禁用新服务器（`enabled: false`）
   - 测试配置是否正确
   - 启用服务器

2. **监控日志**：
   - 关注 `[WARN]` 级别的 MCP 相关日志
   - 定期检查哪些服务器未挂载

3. **配置验证**：
   - 在应用配置前使用 probe API 测试
   - 确保命令路径正确

4. **容错配置**：
   - 不要假设所有服务器都会成功挂载
   - 设计工作流时考虑部分服务器不可用的情况

## 向后兼容性

- ✅ 现有配置无需修改
- ✅ 之前正常工作的服务器继续正常工作
- ✅ 配置结构保持不变
- ✅ API 保持兼容

唯一的变化是行为：失败的服务器不再阻止其他服务器挂载。

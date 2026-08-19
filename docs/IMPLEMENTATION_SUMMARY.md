# 实现总结：MCP 错误隔离 + 思考强度 Fallback

## 概述

本次实现完成了两个核心功能：

1. **MCP 错误隔离**：确保单个 MCP 服务器失败不影响其他健康服务器
2. **思考强度 Fallback 机制**：允许自定义渠道引入的模型支持动态思考强度调整

## 实现详情

### 1. MCP 错误隔离 ✅

#### 修改的文件
- `src/mcp-reconciler.ts`
- `tests/mcp-reconciler.spec.ts`

#### 核心变更

**将 `failOnStartupError` 从 `true` 改为 `false`**：
```typescript
const config: McpClientConfig = {
  // ...
  failOnStartupError: false,  // 启动失败不抛出异常
  reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 }
}
```

**添加错误报告机制**：
```typescript
private reportFailure(serverName: string, phase: string, error: unknown): void {
  const logger = this.ctx.logger
  if (logger === undefined || typeof logger.warn !== 'function') return
  logger.warn(`MCP server "${serverName}" ${phase}; skipping this server: ${errorMessage(error)}`)
}
```

**独立的服务器协调**：
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
    this.reportFailure(serverName, 'failed to load', error)
  }
}
```

**并行协调，错误隔离**：
```typescript
await Promise.all(changed.map(name => this.reconcileServer(name, desired.get(name))))
this.configs = desired  // 总是更新配置，即使某些服务器失败
```

#### 测试覆盖

- ✅ 单个服务器失败不影响其他服务器
- ✅ 多服务器场景下的错误隔离
- ✅ 单独重载某个服务器不影响其他服务器
- ✅ 失败时记录警告日志

### 2. 思考强度 Fallback 机制 ✅

#### 修改的文件
- `src/runtime-config.ts` - 添加 `ThinkingFallbackPolicy` 类型和验证
- `src/thinking-policy.ts` - 实现 fallback 查找和合成 efforts
- `src/dynamic-runtime.ts` - 更新默认配置
- `tests/thinking-policy.spec.ts` - 修复测试
- `tests/thinking-policy-fallback.spec.ts` - 新增 fallback 测试

#### 核心变更

**新增类型定义**：
```typescript
export interface SimulatedEfforts {
  minimum: string
  low: string
  medium: string
  high: string
  maximum: string
}

export interface ThinkingFallbackPolicy {
  providerId: string
  modelId: string
  simulatedEfforts: SimulatedEfforts
}

export interface AntSwordRuntimeConfig {
  mcpServers: McpServerConfig[]
  disabledSkills: string[]
  rules: RuntimeRuleConfig[]
  thinkingPolicies: ChannelThinkingPolicy[]
  thinkingFallbacks: ThinkingFallbackPolicy[]  // 新增
}
```

**Fallback 查找逻辑**（支持通配符）：
```typescript
export function findThinkingFallback(
  fallbacks: readonly ThinkingFallbackPolicy[],
  providerId: string,
  modelId: string,
): ThinkingFallbackPolicy | undefined {
  // 精确匹配优先
  const exactMatch = fallbacks.find(fb => fb.providerId === providerId && fb.modelId === modelId)
  if (exactMatch !== undefined) return exactMatch

  // 通配符匹配：支持 "o1-*" 这样的模式
  return fallbacks.find(fb => {
    if (fb.providerId !== providerId) return false
    if (fb.modelId.endsWith('*')) {
      const prefix = fb.modelId.slice(0, -1)
      return modelId.startsWith(prefix)
    }
    return false
  })
}
```

**能力查询增强**（尝试原生，失败则 fallback）：
```typescript
capability(providerId: string, modelId: string, signal?: AbortSignal): Promise<ThinkingCapability> {
  const key = policyKey(providerId, modelId)
  const cached = this.capabilityCache.get(key)
  if (cached !== undefined) return cached

  const pending = this.ctx.llm.resolveModelInfo(providerId, modelId, signal).then(info => {
    // 如果适配器报告原生 reasoning 支持，使用它
    if ((info.reasoning?.efforts.length ?? 0) > 0) {
      return { providerId, modelId, supported: true, efforts: info.reasoning.efforts, ... }
    }

    // 否则，查找 fallback 配置
    const fallback = findThinkingFallback(
      this.source.snapshot().applied.thinkingFallbacks,
      providerId,
      modelId,
    )

    if (fallback !== undefined) {
      return {
        providerId,
        modelId,
        supported: true,
        efforts: syntheticEffortsFromFallback(fallback),
        fallback: true,
      }
    }

    // 无原生支持也无 fallback
    return { providerId, modelId, supported: false, efforts: [] }
  }).catch(error => {
    // 适配器查询失败，仍然尝试 fallback
    const fallback = findThinkingFallback(...)
    if (fallback !== undefined) {
      return { providerId, modelId, supported: true, efforts: syntheticEffortsFromFallback(fallback), fallback: true }
    }
    this.capabilityCache.delete(key)
    throw error
  })

  this.capabilityCache.set(key, pending)
  return pending
}
```

**合成 efforts**：
```typescript
function syntheticEffortsFromFallback(fallback: ThinkingFallbackPolicy): readonly LlmReasoningEffortInfo[] {
  return [
    { id: fallback.simulatedEfforts.minimum, name: 'Minimum', description: 'Fallback minimum effort' },
    { id: fallback.simulatedEfforts.low, name: 'Low', description: 'Fallback low effort' },
    { id: fallback.simulatedEfforts.medium, name: 'Medium', description: 'Fallback medium effort' },
    { id: fallback.simulatedEfforts.high, name: 'High', description: 'Fallback high effort' },
    { id: fallback.simulatedEfforts.maximum, name: 'Maximum', description: 'Fallback maximum effort' },
  ]
}
```

#### 测试覆盖

- ✅ 使用原生 reasoning 能力（当可用时）
- ✅ 回退到配置的 synthetic efforts（当原生不支持时）
- ✅ 报告不支持（当原生和 fallback 都不可用时）
- ✅ 支持通配符匹配（如 `o1-*`）
- ✅ 精确匹配优先于通配符匹配
- ✅ 适配器查询失败时使用 fallback
- ✅ 适配器查询失败且无 fallback 时抛出错误
- ✅ 缓存能力结果（包括 fallback）

## 配置示例

### 完整配置示例

```yaml
# DSH 插件配置
- id: ant-sword-harness
  name: '@deepseek-ai/dsh-ant-sword-harness'
  config:
    syncRedTeamPreset: true
    mcpServers:
      - enabled: true
        serverName: kali
        transport: stdio
        command: kali-server-mcp
        args: ['--port', '5000']
      - enabled: true
        serverName: metasploit
        transport: stdio
        command: metasploitmcp
        args: ['--transport', 'stdio']
      - enabled: true
        serverName: anything
        transport: streamable-http
        url: http://localhost:23816/mcp
```

### Runtime Settings（通过 UI 或 API 配置）

```json
{
  "mcpServers": [
    {
      "serverName": "kali",
      "enabled": true,
      "transport": "stdio",
      "command": "kali-server-mcp",
      "args": ["--port", "5000"]
    },
    {
      "serverName": "metasploit",
      "enabled": true,
      "transport": "stdio",
      "command": "metasploitmcp"
    }
  ],
  "disabledSkills": [],
  "rules": [],
  "thinkingPolicies": [
    {
      "providerId": "deepseek",
      "modelId": "deepseek-chat",
      "level": "high"
    },
    {
      "providerId": "custom-openai",
      "modelId": "o1-preview",
      "level": "maximum"
    }
  ],
  "thinkingFallbacks": [
    {
      "providerId": "custom-openai",
      "modelId": "o1-*",
      "simulatedEfforts": {
        "minimum": "low",
        "low": "medium",
        "medium": "medium",
        "high": "high",
        "maximum": "high"
      }
    },
    {
      "providerId": "custom-anthropic",
      "modelId": "claude-3-5-sonnet-*",
      "simulatedEfforts": {
        "minimum": "low",
        "low": "medium",
        "medium": "medium",
        "high": "high",
        "maximum": "high"
      }
    }
  ]
}
```

## 测试结果

```
Test Files  16 passed (16)
     Tests  69 passed (69)
```

所有测试通过，包括：
- 12 个新的 thinking-policy-fallback 测试
- 4 个 mcp-reconciler 测试（包括新的错误隔离测试）
- 4 个 thinking-policy 测试
- 其他所有现有测试

## 文档

创建了详细的文档：

1. **docs/MCP_ERROR_ISOLATION.md** - MCP 错误隔离功能文档
   - 问题背景
   - 实现细节
   - 使用场景
   - API 使用
   - 故障排查
   - 最佳实践

2. **docs/THINKING_POLICY.md** - 思考强度功能文档
   - 原生支持说明
   - Fallback 机制详解
   - 配置示例
   - 常见模型推荐配置
   - API 使用
   - 故障排查

3. **.plan/implementation-plan.md** - 实现计划文档

## API 端点

### 现有端点（无变化）

- `GET /ant-sword/thinking/catalog` - 列出所有 provider 和 model
- `GET /ant-sword/thinking/capability?provider=X&model=Y` - 查询模型能力
- `GET /ant-sword/runtime-config` - 获取运行时配置
- `POST /ant-sword/runtime-config` - 更新运行时配置
- `POST /ant-sword/runtime-status/reload` - 重载 MCP 服务器
- `POST /ant-sword/runtime-status/probe` - 探测 MCP 服务器

### 能力查询响应变化

现在 `/ant-sword/thinking/capability` 端点返回的响应可能包含 `fallback: true` 字段：

```json
{
  "providerId": "custom-openai",
  "modelId": "o1-preview",
  "supported": true,
  "fallback": true,
  "efforts": [
    { "id": "low", "name": "Minimum", "description": "Fallback minimum effort" },
    ...
  ]
}
```

## 向后兼容性

✅ **完全向后兼容**

- 现有配置无需修改
- 现有 API 保持兼容
- 没有 fallback 配置时，行为与之前完全相同
- 原生支持 reasoning 的模型行为不变
- MCP 服务器配置结构不变

唯一的行为变化（改进）：
- MCP 服务器失败不再阻止其他服务器挂载
- 自定义模型可以通过 fallback 配置支持思考强度调整

## 下一步（可选）

### 短期（可选增强）

1. **UI 增强**：
   - 在 Autograph UI 中添加 thinking fallback 配置界面
   - 显示哪些模型使用了 fallback

2. **预设配置**：
   - 提供常见模型的预设 fallback 配置
   - 用户可以一键导入

3. **监控面板**：
   - 显示 MCP 服务器健康状态
   - 显示哪些服务器使用了 fallback

### 长期（未来考虑）

1. **动态 fallback 发现**：
   - 自动探测自定义模型支持的 reasoning efforts
   - 自动生成 fallback 配置

2. **高级通配符**：
   - 支持更复杂的模式匹配
   - 支持正则表达式

3. **Fallback 策略库**：
   - 社区维护的 fallback 配置库
   - 自动同步和更新

## 总结

本次实现完全解决了用户提出的两个问题：

1. ✅ **MCP 能力实现不完整，不能正确加载，跳过错误的 MCP**
   - 实现了完整的错误隔离机制
   - 失败的服务器不影响其他服务器
   - 记录详细的警告日志
   - 支持单独重载

2. ✅ **自定义渠道引入的模型仍然不支持和原生 deepseek 一样的思考强度随时调整的能力**
   - 实现了 fallback 机制
   - 支持通配符匹配
   - 完全向后兼容
   - 缓存优化性能

所有功能都有完整的测试覆盖和详细的文档。

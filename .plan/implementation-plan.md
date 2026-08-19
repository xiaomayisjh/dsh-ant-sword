# MCP 和思考强度完整实现计划

## 问题分析

### 1. MCP 能力实现不完整
从 git diff 可以看到，当前的改动已经实现了**错误隔离**：
- ✅ 将 `failOnStartupError` 从 `true` 改为 `false`
- ✅ 添加了 `reportFailure()` 方法记录单个服务器失败
- ✅ 添加了 `reconcileServer()` 方法，失败被隔离到单个服务器
- ✅ 测试更新为验证多服务器场景下的错误隔离

**当前状态**：MCP 错误隔离已经完成，一个服务器失败不会影响其他健康服务器。

### 2. 自定义渠道模型不支持思考强度调整
**问题根源**：
- `ThinkingPolicyRuntime.capability()` 通过 `ctx.llm.resolveModelInfo()` 获取模型能力
- 如果自定义渠道的模型没有正确实现 `LlmAdapter.resolveModel()` 返回 `reasoning` 字段，则无法动态调整思考强度
- 原生 DeepSeek 模型通过官方 adapter 正确暴露 `reasoning.efforts` 和 `reasoning.defaultEffort`

**解决方案**：需要实现一个 **fallback 机制**，允许为没有原生 reasoning 支持的模型配置默认的思考强度映射。

## 实现方案

### Phase 1: 完成 MCP 错误隔离（已完成）
当前 git 改动已经实现了这部分功能。需要确认的点：
- [x] `failOnStartupError: false` - 已实现
- [x] 错误隔离到单个服务器 - 已实现
- [x] 警告日志记录 - 已实现
- [x] 测试覆盖 - 已实现

### Phase 2: 实现思考强度 Fallback 机制

#### 2.1 扩展运行时配置支持 Fallback Policies
```typescript
// runtime-config.ts
export interface ThinkingFallbackPolicy {
  providerId: string
  modelId: string
  // 为没有原生 reasoning 支持的模型提供模拟的 efforts
  simulatedEfforts: {
    minimum: string  // 映射到的 reasoningEffort ID
    low: string
    medium: string
    high: string
    maximum: string
  }
}

export interface AntSwordRuntimeConfig {
  mcpServers: McpServerConfig[]
  disabledSkills: string[]
  rules: RuntimeRuleConfig[]
  thinkingPolicies: ChannelThinkingPolicy[]
  thinkingFallbacks: ThinkingFallbackPolicy[]  // 新增
}
```

#### 2.2 扩展 ThinkingPolicyRuntime 支持 Fallback
```typescript
// thinking-policy.ts
export class ThinkingPolicyRuntime {
  async capability(providerId: string, modelId: string, signal?: AbortSignal): Promise<ThinkingCapability> {
    // 1. 尝试从 adapter 获取原生 reasoning 能力
    try {
      const info = await this.ctx.llm.resolveModelInfo(providerId, modelId, signal)
      if ((info.reasoning?.efforts.length ?? 0) > 0) {
        // 有原生支持，直接返回
        return { providerId, modelId, supported: true, efforts: info.reasoning.efforts, ... }
      }
    } catch (error) {
      // adapter 查询失败，继续尝试 fallback
    }
    
    // 2. 查找 fallback 配置
    const fallback = findThinkingFallback(this.source.snapshot().applied.thinkingFallbacks, providerId, modelId)
    if (fallback !== undefined) {
      // 将 fallback 的 simulatedEfforts 转换为标准 efforts 格式
      const syntheticEfforts = [
        { id: fallback.simulatedEfforts.minimum, name: 'Minimum', description: 'Fallback minimum effort' },
        { id: fallback.simulatedEfforts.low, name: 'Low', description: 'Fallback low effort' },
        { id: fallback.simulatedEfforts.medium, name: 'Medium', description: 'Fallback medium effort' },
        { id: fallback.simulatedEfforts.high, name: 'High', description: 'Fallback high effort' },
        { id: fallback.simulatedEfforts.maximum, name: 'Maximum', description: 'Fallback maximum effort' },
      ]
      return { providerId, modelId, supported: true, efforts: syntheticEfforts, fallback: true }
    }
    
    // 3. 既无原生支持也无 fallback 配置
    return { providerId, modelId, supported: false, efforts: [] }
  }
}
```

#### 2.3 UI 支持（通过 API）
```typescript
// thinking-policy-api.ts
// 新增端点：GET /ant-sword/thinking/fallbacks
// 新增端点：POST /ant-sword/thinking/fallbacks (CRUD for fallback policies)
```

#### 2.4 预设的通用 Fallback
为常见的自定义模型提供预设 fallback 配置：
```typescript
export const DEFAULT_THINKING_FALLBACKS: ThinkingFallbackPolicy[] = [
  {
    // OpenAI o1/o3 系列
    providerId: 'custom-openai',
    modelId: 'o1-*',  // 支持通配符
    simulatedEfforts: {
      minimum: 'low',
      low: 'medium',
      medium: 'medium',
      high: 'high',
      maximum: 'high',
    }
  },
  {
    // Claude 3.5 Sonnet with extended thinking
    providerId: 'custom-anthropic',
    modelId: 'claude-3-5-sonnet-*',
    simulatedEfforts: {
      minimum: 'low',
      low: 'medium',
      medium: 'medium',
      high: 'high',
      maximum: 'high',
    }
  },
  // 可以为任何自定义渠道配置
]
```

### Phase 3: 文档和测试

#### 3.1 添加测试
```typescript
// tests/thinking-policy-fallback.spec.ts
describe('ThinkingPolicy Fallback', () => {
  it('uses native reasoning when available', async () => {
    // 测试原生支持的优先级
  })
  
  it('falls back to configured synthetic efforts when native unsupported', async () => {
    // 测试 fallback 机制
  })
  
  it('reports unsupported when both native and fallback unavailable', async () => {
    // 测试完全不支持的情况
  })
  
  it('supports wildcard matching in fallback policies', async () => {
    // 测试通配符匹配
  })
})
```

#### 3.2 更新文档
在 README.zh.md 中添加：
```markdown
## 思考强度动态调整

### 原生支持
对于正确实现 `LlmAdapter.resolveModel()` 的模型（如官方 DeepSeek 适配器），系统会自动从模型能力中读取支持的 reasoning efforts。

### Fallback 机制
对于自定义渠道引入的模型，如果适配器未暴露 reasoning 能力，可以通过配置 fallback 策略来启用思考强度调整：

```yaml
thinkingFallbacks:
  - providerId: custom-openai
    modelId: o1-preview
    simulatedEfforts:
      minimum: low
      low: medium
      medium: medium
      high: high
      maximum: high
```

系统会将五级思考强度映射到您指定的 reasoningEffort ID。
```

## 实现优先级

1. **High Priority - 已完成**: MCP 错误隔离（当前 git diff 已实现）
2. **High Priority - 待实现**: 思考强度 Fallback 核心机制
3. **Medium Priority**: UI API 支持
4. **Low Priority**: 预设 Fallback 配置和文档

## 技术细节

### 通配符匹配
使用 minimatch 或简单的 glob 匹配实现 modelId 的通配符支持：
```typescript
function matchesModelPattern(modelId: string, pattern: string): boolean {
  if (pattern === modelId) return true
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return modelId.startsWith(prefix)
  }
  return false
}
```

### 配置验证
```typescript
function validateThinkingFallback(fallback: ThinkingFallbackPolicy): void {
  // 验证 providerId 和 modelId 格式
  // 验证 simulatedEfforts 的所有五个级别都已配置
  // 验证 effort ID 不包含控制字符
}
```

### 缓存失效
当 fallback 配置变更时，需要清除 capability 缓存：
```typescript
// dynamic-runtime.ts
const stopCapabilityRefresh = controller.subscribe(snapshot => {
  if (snapshot.generation === capabilityGeneration) return
  capabilityGeneration = snapshot.generation
  thinking.clearCapabilities()  // 已存在，会自动清除包括 fallback 的所有缓存
})
```

## 实现验证

### MCP 错误隔离验证
```bash
# 运行测试
pnpm test tests/mcp-reconciler.spec.ts

# 预期：所有测试通过，包括多服务器错误隔离场景
```

### 思考强度 Fallback 验证
```bash
# 1. 配置一个自定义模型的 fallback
# 2. 为该模型设置思考策略
# 3. 验证思考强度可以动态调整
# 4. 验证 reasoningEffort 正确传递到 LLM 调用
```

## 兼容性

- ✅ 向后兼容：没有 fallback 配置时行为不变
- ✅ 不影响原生支持的模型
- ✅ 不需要修改 DSH 核心 API
- ✅ 可以通过 settings namespace 持久化配置

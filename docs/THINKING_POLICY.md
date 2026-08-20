# 思考强度动态调整 (Thinking Policy)

## 概述

思考强度系统允许您为不同的模型配置五个语义级别的推理强度：`minimum`、`low`、`medium`、`high`、`maximum`。系统会自动将这些级别映射到模型支持的具体 `reasoningEffort` 值。

## 原生支持

对于正确实现 `LlmAdapter.resolveModel()` 的模型（如官方 DeepSeek 适配器），系统会自动从模型能力中读取支持的 reasoning efforts：

```typescript
// 模型返回的能力信息
{
  reasoning: {
    efforts: [
      { id: 'low', name: 'Low', description: 'Fast responses' },
      { id: 'medium', name: 'Medium', description: 'Balanced' },
      { id: 'high', name: 'High', description: 'Deep reasoning' }
    ],
    defaultEffort: 'medium'
  }
}
```

配置思考策略：

```json
{
  "thinkingPolicies": [
    {
      "providerId": "deepseek",
      "modelId": "deepseek-chat",
      "level": "high"
    }
  ]
}
```

系统会自动将 `high` 级别映射到该模型的 `high` effort。

## 对话框原生思考强度选择器（自定义渠道，按 wire 格式区分）

对话框输入区旁边那个思考强度选择器（与官方 DeepSeek 一致）由 host 的模型目录驱动：host 对每个模型调用适配器的 `resolveModel()`，只有报告 `reasoning` 能力的模型才会显示选择器，且**选中的 effort 必须是该 wire 格式真正接受的取值**，否则下发时会被适配器以 `UNSUPPORTED_REASONING_EFFORT` 拒绝（接口不兼容）。

自定义渠道通常是 `@deepseek-ai/dsh-llm-pi-ai` 的路由，pi-ai 有三种 wire 协议，思考强度的档位、取值、表达、格式各不相同：

| pi-ai `api` | 档位词汇 | wire 形态 |
| --- | --- | --- |
| `openai-responses` | `minimal / low / medium / high` | `reasoning: { effort }`（无 `max`、无 `off` 线值） |
| `anthropic-messages` | `low / medium / high` | 自适应 `output_config.effort` 或 `thinking.budget_tokens` |
| `openai-completions` | `low / medium / high` | `reasoning_effort` |

pi-ai 只有在路由模型声明了 `reasoningEfforts` 时才把它当作可推理模型（否则 `reasoning: false`，既不显示选择器，下发任何非 `off` effort 也会被拒）。

本包在启动时运行 **pi-ai 推理协调器**（`src/pi-ai-reasoning.ts`）：读取 `llm-pi-ai` 设置，按每条路由的 `api` 把**格式正确的 `reasoningEfforts`** 写入所有尚未声明该字段的模型。于是：

1. 每个自定义渠道模型都以其 wire 格式原生暴露思考强度选择器；
2. 选中的 effort 用该格式接受的取值下发，不再出现接口不兼容；
3. 无需逐模型手工配置。

已显式声明 `reasoningEfforts`（映射或 `false`）的模型不会被改写 —— 用户的选择永远优先。协调器每次启动只补齐缺失项，是幂等的。

> 注：ant-sword 设置页的"渠道思考强度"标签（`/ant-sword/thinking/*`）是另一套面向策略的 UI，仍使用下述 fallback 机制；它与对话框原生选择器相互独立。

## 默认 Fallback（开箱即用）

从当前版本起，系统内置了一个**默认 fallback**（`defaultThinkingFallback`）。任何模型只要满足：

1. 适配器未暴露原生 reasoning 能力，且
2. 没有匹配到具体的 `thinkingFallbacks` 条目

就会自动套用默认 fallback，因此**自定义渠道引入的模型无需任何配置即可显示与官方 DeepSeek 一致的五档思考强度 UI**。

默认映射（对齐官方 DeepSeek 的 `off`/`high`/`max` 三档 effort）：

```json
{
  "defaultThinkingFallback": {
    "minimum": "off",
    "low": "high",
    "medium": "high",
    "high": "max",
    "maximum": "max"
  }
}
```

- 想为某个模型使用不同映射：在 `thinkingFallbacks` 里添加**精确或通配符**条目，它优先于默认 fallback。
- 想恢复旧行为（未配置的模型显示"不支持"）：把 `defaultThinkingFallback` 设为 `null`。
- 省略该字段（或旧配置文件没有该字段）等同于使用上面的内置默认值。

## 显式 Fallback 机制

对于自定义渠道引入的模型，如果默认 fallback 的映射不合适，可以通过配置**显式 fallback 策略**覆盖它。

### 配置 Fallback

在运行时配置中添加 `thinkingFallbacks`：

```json
{
  "thinkingFallbacks": [
    {
      "providerId": "custom-openai",
      "modelId": "o1-preview",
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

### 工作原理

1. 系统首先尝试从适配器获取原生 reasoning 能力
2. 如果适配器不支持或查询失败，系统查找 fallback 配置
3. 如果找到 fallback，系统使用 `simulatedEfforts` 中定义的映射
4. 当您设置思考策略为某个级别时，系统会将该级别映射到对应的 `reasoningEffort` ID

### 通配符支持

Fallback 配置支持模型 ID 的通配符匹配：

```json
{
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
    }
  ]
}
```

这个配置会匹配所有以 `o1-` 开头的模型，如 `o1-preview`、`o1-mini` 等。

**匹配优先级**：精确匹配优先于通配符匹配。

## 完整示例

### 场景：混合使用原生和自定义模型

```json
{
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
    },
    {
      "providerId": "custom-anthropic",
      "modelId": "claude-3-5-sonnet-20241022",
      "level": "medium"
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

### 工作流程

1. **DeepSeek Chat (原生支持)**:
   - 适配器返回原生 reasoning efforts
   - 思考策略 `high` 直接映射到模型的 `high` effort
   
2. **OpenAI o1-preview (Fallback)**:
   - 适配器不返回 reasoning 信息
   - 系统找到 `o1-*` 通配符 fallback
   - 思考策略 `maximum` 映射到 `high` (根据 simulatedEfforts 配置)
   
3. **Claude 3.5 Sonnet (Fallback)**:
   - 适配器不返回 reasoning 信息
   - 系统找到精确匹配的 fallback
   - 思考策略 `medium` 映射到 `medium`

## 常见模型的推荐 Fallback 配置

### OpenAI o1/o3 系列

```json
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
}
```

### Claude Extended Thinking

```json
{
  "providerId": "custom-anthropic",
  "modelId": "claude-3-*",
  "simulatedEfforts": {
    "minimum": "low",
    "low": "medium",
    "medium": "medium",
    "high": "high",
    "maximum": "high"
  }
}
```

### Gemini Thinking Mode

```json
{
  "providerId": "custom-google",
  "modelId": "gemini-2.0-flash-thinking-*",
  "simulatedEfforts": {
    "minimum": "low",
    "low": "medium",
    "medium": "medium",
    "high": "high",
    "maximum": "high"
  }
}
```

## API 使用

### 查询模型能力

```http
GET /ant-sword/thinking/capability?provider=custom-openai&model=o1-preview
```

响应（使用 fallback）：

```json
{
  "providerId": "custom-openai",
  "modelId": "o1-preview",
  "supported": true,
  "fallback": true,
  "efforts": [
    { "id": "low", "name": "Minimum", "description": "Fallback minimum effort" },
    { "id": "medium", "name": "Low", "description": "Fallback low effort" },
    { "id": "medium", "name": "Medium", "description": "Fallback medium effort" },
    { "id": "high", "name": "High", "description": "Fallback high effort" },
    { "id": "high", "name": "Maximum", "description": "Fallback maximum effort" }
  ]
}
```

注意 `fallback: true` 字段表示这是通过 fallback 机制提供的能力。

## 验证配置

### 配置规则

1. **providerId 和 modelId**:
   - 必须非空且已修剪空格
   - 不能包含控制字符（\0-\x1f）
   - providerId 最大 128 字节，modelId 最大 256 字节

2. **simulatedEfforts**:
   - 必须包含所有五个级别：`minimum`、`low`、`medium`、`high`、`maximum`
   - 每个 effort ID 必须非空且已修剪空格
   - 不能包含控制字符

3. **唯一性**:
   - 每个 `(providerId, modelId)` 组合在 `thinkingFallbacks` 中必须唯一
   - 每个 `(providerId, modelId)` 组合在 `thinkingPolicies` 中必须唯一

### 配置验证失败示例

```typescript
// 错误：缺少 maximum 级别
{
  "simulatedEfforts": {
    "minimum": "low",
    "low": "medium",
    "medium": "medium",
    "high": "high"
    // 缺少 maximum
  }
}

// 错误：包含控制字符
{
  "providerId": "custom\ntest",  // 包含换行符
  "modelId": "model"
}

// 错误：重复配置
{
  "thinkingFallbacks": [
    { "providerId": "test", "modelId": "model", ... },
    { "providerId": "test", "modelId": "model", ... }  // 重复
  ]
}
```

## 故障排查

### 思考强度未生效

1. **检查模型能力**:
   ```bash
   curl "http://127.0.0.1:PORT/ant-sword/thinking/capability?provider=XXX&model=YYY"
   ```
   
2. **验证思考策略配置**:
   - 确认 `providerId` 和 `modelId` 完全匹配
   - 检查是否有拼写错误

3. **验证 fallback 配置**:
   - 如果模型不支持原生 reasoning，确保有对应的 fallback 配置
   - 检查通配符模式是否正确

### Fallback 未匹配

- **精确匹配优先**：如果同时有精确匹配和通配符匹配，系统使用精确匹配
- **通配符语法**：目前只支持后缀通配符 `*`，例如 `o1-*`
- **大小写敏感**：所有匹配都是大小写敏感的

## 性能考虑

### 缓存

- 模型能力查询结果会被缓存
- 包括原生能力和 fallback 配置
- 配置变更时缓存自动失效
- 多次查询同一模型只会执行一次实际查询

### 最佳实践

1. **使用通配符减少配置**：为模型系列使用通配符而不是为每个模型单独配置
2. **合理设置 effort 映射**：根据实际模型能力设置映射关系
3. **监控性能影响**：高思考强度会增加响应时间和 token 使用

## 与 MCP 错误隔离的关系

思考强度系统与 MCP 错误隔离是独立的功能：

- **MCP 错误隔离**：确保单个 MCP 服务器失败不影响其他服务器
- **思考强度 Fallback**：确保自定义模型也能使用思考强度调整

两者共同提高了系统的健壮性和灵活性。

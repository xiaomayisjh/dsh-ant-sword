# 自定义渠道思考强度 UI 补全指南

## 问题描述

自定义渠道的模型在 Web UI 的"思考强度"标签页中可能显示但按钮被禁用，或者根本不显示。

## 根本原因

思考强度 UI 的工作流程：

1. **加载渠道目录**：UI 调用 `/ant-sword/thinking/catalog` API，该 API 通过 `ctx.llm.listProviders()` 和 `ctx.llm.listModels()` 获取所有已注册的渠道和模型

2. **查询模型能力**：当选择某个模型时，UI 调用 `/ant-sword/thinking/capability` API 查询该模型是否支持 reasoning

3. **启用/禁用按钮**：
   - 如果模型返回 `supported: true`，五档思考强度按钮启用
   - 如果模型返回 `supported: false`，按钮禁用，显示"该模型不支持 reasoning effort，请在 Fallback 标签页添加配置"

## 诊断步骤

### 1. 运行诊断脚本

确保 `dsh web` 正在运行，然后执行：

```bash
node scripts/diagnose-thinking-ui.mjs
```

该脚本会：
- 列出所有检测到的渠道和模型
- 测试几个模型的能力查询
- 给出针对性建议

### 2. 手动测试 API

```bash
# 列出所有渠道
curl http://127.0.0.1:3080/ant-sword/thinking/catalog

# 查询特定模型能力（替换成你的渠道和模型 ID）
curl "http://127.0.0.1:3080/ant-sword/thinking/capability?provider=custom-openai&model=gpt-4"
```

## 解决方案

### 方案 A：配置 Fallback（推荐）

对于大多数自定义渠道（如通过 pi-ai 插件添加的 OpenAI、Anthropic 等），适配器通常不会返回 reasoning 字段。这种情况下，需要配置 Fallback。

#### 步骤：

1. 在 Web UI 中打开"Runtime 配置"页面
2. 切换到"思考强度 Fallback"标签页
3. 添加配置：

```json
{
  "providerId": "你的渠道ID",
  "modelId": "模型ID或通配符",
  "simulatedEfforts": {
    "minimum": "low",
    "low": "medium",
    "medium": "medium",
    "high": "high",
    "maximum": "high"
  }
}
```

**常见渠道示例：**

**OpenAI o1/o3 系列：**
```json
{
  "providerId": "openai-custom",
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

**Claude 扩展思考：**
```json
{
  "providerId": "anthropic-custom",
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

**Gemini 思考模式：**
```json
{
  "providerId": "google-custom",
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

4. 点击"保存 Fallback 配置"
5. 返回"思考强度"标签页，重新选择该模型，按钮应该已启用

### 方案 B：让适配器返回原生 reasoning 支持

如果你控制适配器代码（如自己开发的插件），可以让适配器的 `resolveModel()` 方法返回 reasoning 信息：

```typescript
async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
  return {
    provider,
    model,
    reasoning: {
      efforts: [
        { id: 'low', name: 'Low', description: 'Fast responses' },
        { id: 'medium', name: 'Medium', description: 'Balanced' },
        { id: 'high', name: 'High', description: 'Deep reasoning' }
      ],
      defaultEffort: 'medium'
    }
  }
}
```

## 验证修复

### 1. 检查能力 API

```bash
curl "http://127.0.0.1:3080/ant-sword/thinking/capability?provider=你的渠道ID&model=模型ID"
```

应该返回：
```json
{
  "providerId": "你的渠道ID",
  "modelId": "模型ID",
  "supported": true,
  "fallback": true,  // 如果使用 Fallback 方案
  "efforts": [
    { "id": "low", "name": "Minimum", "description": "..." },
    { "id": "medium", "name": "Low", "description": "..." },
    ...
  ]
}
```

### 2. 在 Web UI 中测试

1. 打开"Runtime 配置" → "思考强度"标签页
2. 选择你的自定义渠道和模型
3. 五档思考强度按钮应该已启用
4. 点击任意一档（如"高"）
5. 点击"保存思考策略"
6. 在下方的策略列表中应该能看到新添加的策略

### 3. 验证实际生效

发起一个对话，查看请求是否包含 `reasoningEffort` 参数：

1. 打开浏览器开发者工具（F12）
2. 切换到 Network 标签
3. 发送一条消息
4. 查找 LLM 请求，检查 payload 中是否包含配置的 effort

## 故障排查

### 问题 1：catalog API 返回空或缺少自定义渠道

**原因**：自定义渠道的适配器未正确注册到 `ctx.llm`

**解决**：
1. 检查自定义渠道插件是否正确加载（查看 `dsh web --dump-config`）
2. 确认插件调用了 `ctx.llm.registerAdapter()` 或 `ctx.llm.registerConfigurableProviders()`
3. 重启 `dsh web` 确保插件加载

### 问题 2：配置了 Fallback 但按钮仍然禁用

**原因**：providerId 或 modelId 不匹配

**解决**：
1. 在 catalog API 中确认准确的 providerId 和 modelId
2. 确保 Fallback 配置中的 ID 完全一致（大小写敏感）
3. 如果使用通配符，确认模式正确（如 `o1-*` 匹配 `o1-preview`、`o1-mini` 等）

### 问题 3：保存策略后没有生效

**原因**：配置未正确持久化或未生效

**解决**：
1. 检查 Runtime 配置是否保存成功（页面应显示"保存成功"提示）
2. 刷新页面，查看策略列表中是否存在
3. 检查 `~/.dsh/profiles/web/` 下的配置文件

### 问题 4：UI 显示"模型渠道目录加载失败"

**原因**：API 请求失败

**解决**：
1. 确认 `dsh web` 正在运行
2. 检查端口是否正确（默认 3080）
3. 查看浏览器控制台的详细错误信息
4. 检查服务器日志

## 批量配置示例

如果有多个自定义渠道的多个模型需要配置，可以直接编辑配置文件：

```json
{
  "thinkingFallbacks": [
    {
      "providerId": "openai-custom",
      "modelId": "gpt-4*",
      "simulatedEfforts": {
        "minimum": "low",
        "low": "medium",
        "medium": "medium",
        "high": "high",
        "maximum": "high"
      }
    },
    {
      "providerId": "openai-custom",
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
      "providerId": "anthropic-custom",
      "modelId": "claude-*",
      "simulatedEfforts": {
        "minimum": "low",
        "low": "medium",
        "medium": "medium",
        "high": "high",
        "maximum": "high"
      }
    },
    {
      "providerId": "google-custom",
      "modelId": "*",
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

然后在 Web UI 中加载该配置。

## 相关文档

- [docs/THINKING_POLICY.md](docs/THINKING_POLICY.md) - 思考强度系统完整文档
- [docs/IMPLEMENTATION_SUMMARY.md](docs/IMPLEMENTATION_SUMMARY.md) - 实现总结
- `scripts/diagnose-thinking-ui.mjs` - UI 诊断脚本

## 总结

思考强度 UI **应该显示所有已注册的渠道和模型**，包括自定义渠道。如果自定义渠道的模型按钮被禁用，是因为：

1. ✅ UI 正常工作
2. ✅ 渠道已正确注册
3. ❌ 模型不支持原生 reasoning 且未配置 Fallback

**解决办法**：在 Web UI 的"思考强度 Fallback"标签页添加配置即可。

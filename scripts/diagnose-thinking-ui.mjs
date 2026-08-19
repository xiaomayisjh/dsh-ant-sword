#!/usr/bin/env node

/**
 * 诊断思考强度 UI 问题：检查 catalog API 返回的渠道和模型
 */

const PORT = process.env.DSH_WEB_PORT ?? 3080

async function main() {
  console.log('🔍 诊断思考强度 UI...\n')

  try {
    // 1. 检查服务是否运行
    console.log(`📡 连接到 http://127.0.0.1:${PORT}/ant-sword/thinking/catalog`)
    const response = await fetch(`http://127.0.0.1:${PORT}/ant-sword/thinking/catalog`, {
      cache: 'no-store'
    })

    if (!response.ok) {
      throw new Error(`API 返回错误：${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const { providers } = data

    console.log(`\n✅ 成功加载目录，找到 ${providers.length} 个渠道\n`)

    // 2. 列出所有渠道和模型
    for (const provider of providers) {
      console.log(`📦 ${provider.name} (${provider.id})`)
      console.log(`   模型数量: ${provider.models.length}`)

      if (provider.models.length > 0) {
        console.log(`   模型列表:`)
        for (const model of provider.models.slice(0, 5)) {
          console.log(`     - ${model.name} (${model.id})`)
        }
        if (provider.models.length > 5) {
          console.log(`     ... 还有 ${provider.models.length - 5} 个模型`)
        }
      }
      console.log()
    }

    // 3. 测试几个常见模型的能力
    console.log('🔬 测试模型能力查询:\n')

    const testCases = [
      { provider: 'deepseek-official', model: 'deepseek-chat' },
      { provider: 'deepseek-official', model: 'deepseek-reasoner' },
    ]

    // 添加第一个自定义渠道的第一个模型
    if (providers.length > 0) {
      const firstProvider = providers.find(p => p.id !== 'deepseek-official')
      if (firstProvider && firstProvider.models.length > 0) {
        testCases.push({
          provider: firstProvider.id,
          model: firstProvider.models[0].id
        })
      }
    }

    for (const testCase of testCases) {
      try {
        const capUrl = `http://127.0.0.1:${PORT}/ant-sword/thinking/capability?provider=${encodeURIComponent(testCase.provider)}&model=${encodeURIComponent(testCase.model)}`
        const capResponse = await fetch(capUrl, { cache: 'no-store' })

        if (capResponse.ok) {
          const capability = await capResponse.json()
          console.log(`✅ ${testCase.provider}/${testCase.model}`)
          console.log(`   支持: ${capability.supported ? '是' : '否'}`)
          if (capability.supported) {
            console.log(`   Fallback: ${capability.fallback ? '是' : '否'}`)
            console.log(`   Efforts: ${capability.efforts.map(e => e.name).join(', ')}`)
          }
        } else {
          console.log(`⚠️  ${testCase.provider}/${testCase.model} - 查询失败: ${capResponse.status}`)
        }
      } catch (error) {
        console.log(`❌ ${testCase.provider}/${testCase.model} - 错误: ${error.message}`)
      }
      console.log()
    }

    // 4. 给出建议
    console.log('💡 建议:\n')

    const customProviders = providers.filter(p => p.id !== 'deepseek-official')
    if (customProviders.length === 0) {
      console.log('⚠️  未检测到自定义渠道。如果您添加了自定义渠道，请确保：')
      console.log('   1. 渠道的 LLM 适配器已正确注册')
      console.log('   2. dsh web 已重启以加载新配置')
    } else {
      console.log(`✅ 检测到 ${customProviders.length} 个自定义渠道`)
      console.log('\n默认 fallback 已启用：自定义渠道模型开箱即可调整五档思考强度。')
      console.log('   - 自定义某模型的 effort 映射：在 "思考强度 Fallback" 标签页添加精确/通配符条目（优先于默认）')
      console.log('   - 恢复旧行为（未配置模型显示"不支持"）：把 defaultThinkingFallback 设为 null')
    }

  } catch (error) {
    console.error('\n❌ 诊断失败:', error.message)
    console.error('\n请确保：')
    console.error('   1. dsh web 正在运行')
    console.error(`   2. 服务监听在 http://127.0.0.1:${PORT}`)
    console.error('   3. 您有访问权限')
    process.exit(1)
  }
}

main().catch(console.error)

#!/usr/bin/env node

/**
 * JSHook Reverse Tool - Skill Entry Point
 */

import { SkillRouter } from './skill/SkillRouter.js'
import { getConfig, validateConfig } from './utils/config.js'
import { logger } from './utils/logger.js'

interface AppError extends Error {
  code?: string
}

async function main() {
  try {
    const args = process.argv.slice(2)

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
      printHelp()
      process.exit(0)
    }

    // 加载配置
    const config = getConfig()

    // 验证配置
    const validation = validateConfig(config)
    if (!validation.valid) {
      logger.error('Configuration validation failed:')
      validation.errors.forEach(error => logger.error(`  - ${error}`))
      process.exit(1)
    }

    // 创建路由器
    const router = new SkillRouter(config)
    await router.init()

    // 执行命令
    const command = args[0]
    const commandArgs = args.slice(1)

    const result = await router.execute(command, commandArgs)

    // 输出结果
    console.log(JSON.stringify(result, null, 2))

    // 清理
    await router.cleanup()

    process.exit(0)
  } catch (error) {
    const appError = error as AppError

    logger.error('Skill execution failed:', appError.message)

    console.log(JSON.stringify({
      success: false,
      error: appError.message,
      code: appError.code || 'UNKNOWN_ERROR',
    }, null, 2))

    process.exit(1)
  }
}

function printHelp() {
  console.log(`
JSHook Reverse Tool - AI-powered JavaScript Reverse Engineering

USAGE:
  jshook-reverse <command> [options]

COMMANDS:
  collect <url>              Collect JavaScript code from target website
  search <keyword>           Search for keywords in collected scripts
  deobfuscate <code>         AI-driven code deobfuscation
  understand <code>          AI-assisted code understanding
  detect-crypto <code>       Detect encryption algorithms
  browser <action>           Browser control (launch/close/status)
  stats                      Get statistics
  clear                      Clear collected data

OPTIONS:
  -h, --help                 Show this help message

EXAMPLES:
  jshook-reverse collect https://example.com
  jshook-reverse search "encrypt"
  jshook-reverse browser launch
  jshook-reverse stats
`)
}

main()

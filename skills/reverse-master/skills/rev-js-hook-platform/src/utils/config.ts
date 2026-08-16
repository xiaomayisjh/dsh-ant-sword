/**
 * 配置管理工具
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config as dotenvConfig } from 'dotenv'
import type { Config } from '../types/index.js'

// 计算项目根目录
// 当前文件编译后位于: dist/utils/config.js
// 项目根目录是: ../../ (向上两级)
const currentFilename = fileURLToPath(import.meta.url)
const currentDirname = dirname(currentFilename)
const projectRoot = join(currentDirname, '..', '..')

// 使用绝对路径加载环境变量
// 这样无论从哪个目录启动服务器，都能正确找到 .env 文件
const envPath = join(projectRoot, '.env')
const result = dotenvConfig({ path: envPath })

// 如果 .env 文件加载失败，输出警告（使用 stderr 不影响 MCP 通信）
if (result.error) {
  console.error(`[Config] Warning: Failed to load .env file from ${envPath}`)
  console.error(`[Config] Error: ${result.error.message}`)
  console.error('[Config] Will use environment variables or defaults')
} else {
  // 成功加载时输出信息（仅在调试模式下）
  if (process.env.DEBUG === 'true') {
    console.error(`[Config] Successfully loaded .env from: ${envPath}`)
    console.error(`[Config] Current working directory: ${process.cwd()}`)
    console.error(`[Config] Project root: ${projectRoot}`)
  }
}

const truthyValues = new Set(['1', 'true', 'yes', 'on'])

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }
  return truthyValues.has(value.trim().toLowerCase())
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined
  }

  const tokens = value
    .split(/[\r\n,;]+/)
    .map(token => token.trim())
    .filter(token => token.length > 0)

  return tokens.length > 0 ? tokens : undefined
}

// ✅ 修复：安全的 LLM provider 解析
function parseLLMProvider(value: string | undefined): 'openai' | 'anthropic' {
  if (value === 'openai' || value === 'anthropic') {
    return value
  }
  return 'openai'
}

// ✅ 修复：安全的整数解析，防止 NaN
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue
  }
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

function parseViewport(value: string | undefined): { width: number; height: number } | undefined {
  if (!value) {
    return undefined
  }

  const parts = value.toLowerCase().split('x').map(part => part.trim())
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return undefined
  }

  const width = parseInt(parts[0], 10)
  const height = parseInt(parts[1], 10)

  if (Number.isNaN(width) || Number.isNaN(height)) {
    return undefined
  }

  return { width, height }
}

/**
 * 获取配置
 */
export function getConfig(): Config {
  // 获取缓存目录，如果是相对路径则转换为绝对路径
  const cacheDir = process.env.CACHE_DIR || '.cache'
  const absoluteCacheDir = cacheDir.startsWith('/') || cacheDir.match(/^[A-Za-z]:/)
    ? cacheDir  // 已经是绝对路径
    : join(projectRoot, cacheDir)  // 相对路径，转换为绝对路径

  const headless = parseBoolean(process.env.PUPPETEER_HEADLESS, true)
  const puppeteerArgs = parseList(process.env.PUPPETEER_ARGS)
  const viewport = parseViewport(process.env.PUPPETEER_VIEWPORT)
  const userAgent = process.env.PUPPETEER_USER_AGENT
  const maxCollectedUrls = parseNumber(process.env.PUPPETEER_MAX_COLLECTED_URLS)
  const maxFilesPerCollect = parseNumber(process.env.PUPPETEER_MAX_FILES_PER_COLLECT)
  const maxTotalContentSize = parseNumber(process.env.PUPPETEER_MAX_TOTAL_CONTENT_SIZE)
  const maxSingleFileSize = parseNumber(process.env.PUPPETEER_MAX_SINGLE_FILE_SIZE)
  const useExternalBrowser = parseBoolean(process.env.USE_EXTERNAL_BROWSER, false)
  const remoteDebuggingUrl = process.env.REMOTE_DEBUGGING_URL || 'http://127.0.0.1:9222'
  const userDataDir = process.env.PUPPETEER_USER_DATA_DIR
  const useStealthScripts = parseBoolean(process.env.PUPPETEER_USE_STEALTH_SCRIPTS, true)
  const reuseEnvPerSession = parseBoolean(process.env.PUPPETEER_REUSE_ENV_PER_SESSION, true)
  const autoLaunchExternalBrowser = parseBoolean(process.env.AUTO_LAUNCH_EXTERNAL_BROWSER, false)
  const externalBrowserPath = process.env.EXTERNAL_BROWSER_PATH
  const externalBrowserArgs = parseList(process.env.EXTERNAL_BROWSER_ARGS)

  return {
    llm: {
      provider: parseLLMProvider(process.env.DEFAULT_LLM_PROVIDER),
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        baseURL: process.env.OPENAI_BASE_URL,
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      },
    },
    puppeteer: {
      headless,
      timeout: parseInteger(process.env.PUPPETEER_TIMEOUT, 30000),
      args: puppeteerArgs,
      viewport,
      userAgent,
      maxCollectedUrls,
      maxFilesPerCollect,
      maxTotalContentSize,
      maxSingleFileSize,
      useExternalBrowser,
      remoteDebuggingUrl,
      userDataDir,
      useStealthScripts,
      reuseEnvironmentPerSession: reuseEnvPerSession,
      autoLaunchExternalBrowser,
      externalBrowserPath,
      externalBrowserArgs,
    },
    mcp: {
      name: process.env.MCP_SERVER_NAME || 'jshook-reverse-tool',
      version: process.env.MCP_SERVER_VERSION || '0.1.0',
    },
    cache: {
      enabled: parseBoolean(process.env.ENABLE_CACHE, false),
      dir: absoluteCacheDir,  // 使用绝对路径
      ttl: parseInteger(process.env.CACHE_TTL, 3600),
    },
    performance: {
      maxConcurrentAnalysis: parseInteger(process.env.MAX_CONCURRENT_ANALYSIS, 3),
      maxCodeSizeMB: parseInteger(process.env.MAX_CODE_SIZE_MB, 10),
    },
  }
}

/**
 * 验证配置
 */
export function validateConfig(config: Config): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // 验证LLM配置
  if (config.llm.provider === 'openai') {
    if (!config.llm.openai?.apiKey) {
      errors.push('OpenAI API key is required when using OpenAI provider')
    }
  } else if (config.llm.provider === 'anthropic') {
    if (!config.llm.anthropic?.apiKey) {
      errors.push('Anthropic API key is required when using Anthropic provider')
    }
  }

  // 验证性能配置
  if (config.performance.maxConcurrentAnalysis < 1) {
    errors.push('maxConcurrentAnalysis must be at least 1')
  }

  if (config.performance.maxCodeSizeMB < 1) {
    errors.push('maxCodeSizeMB must be at least 1')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

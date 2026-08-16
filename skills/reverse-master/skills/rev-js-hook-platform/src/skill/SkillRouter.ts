/**
 * Skill Router - 命令路由和执行
 */

import type { Config } from '../types/index.js'
import { logger } from '../utils/logger.js'
import { CodeCollector } from '../modules/collector/CodeCollector.js'
import { BrowserModeManager } from '../modules/browser/BrowserModeManager.js'
import { LLMService } from '../services/LLMService.js'
import { Deobfuscator, type DeobfuscateFullOptions } from '../modules/deobfuscator/Deobfuscator.js'
import { CodeAnalyzer } from '../modules/analyzer/CodeAnalyzer.js'
import { AISummarizer } from '../modules/analyzer/AISummarizer.js'
import { CryptoDetector } from '../modules/crypto/CryptoDetector.js'
import { HookManager } from '../modules/hook/HookManager.js'
import { AIHookGenerator } from '../modules/hook/AIHookGenerator.js'
import { DebuggerManager } from '../modules/debugger/DebuggerManager.js'
import { RuntimeInspector } from '../modules/debugger/RuntimeInspector.js'
import { ScriptManager } from '../modules/debugger/ScriptManager.js'
import {
  StealthScripts2025,
  type StealthInjectionOptions,
  type StealthPreset,
} from '../modules/stealth/index.js'
import { DOMInspector } from '../modules/collector/DOMInspector.js'
import { PageController } from '../modules/collector/PageController.js'

export class SkillRouter {
  private config: Config
  private browserManager: BrowserModeManager
  private collector: CodeCollector
  private llm: LLMService
  private deobfuscator: Deobfuscator
  private analyzer: CodeAnalyzer
  private summarizer: AISummarizer
  private cryptoDetector: CryptoDetector
  private hookManager: HookManager
  private hookGenerator: AIHookGenerator

  // Debugger模块
  private debuggerManager: DebuggerManager
  private runtimeInspector: RuntimeInspector
  private scriptManager: ScriptManager

  // DOM和Page控制模块
  private domInspector: DOMInspector
  private pageController: PageController

  constructor(config: Config) {
    this.config = config

    // 初始化浏览器管理器
    this.browserManager = new BrowserModeManager({
      useStealthScripts: config.puppeteer.useStealthScripts ?? true,
      remoteDebuggingUrl: config.puppeteer.remoteDebuggingUrl,
    })

    // 初始化代码收集器
    this.collector = new CodeCollector(config.puppeteer, this.browserManager)

    // 初始化LLM服务
    this.llm = new LLMService(config.llm)

    // 初始化分析模块
    this.deobfuscator = new Deobfuscator(this.llm)
    this.analyzer = new CodeAnalyzer(this.llm)
    this.summarizer = new AISummarizer(this.llm)
    this.cryptoDetector = new CryptoDetector(this.llm)

    // 初始化 Hook 模块
    this.hookManager = new HookManager()
    this.hookGenerator = new AIHookGenerator(this.hookManager)

    // 初始化 Debugger 模块
    this.debuggerManager = new DebuggerManager(this.collector)
    this.runtimeInspector = new RuntimeInspector(this.collector, this.debuggerManager)
    this.scriptManager = new ScriptManager(this.collector)

    // 初始化 DOM 和 Page 控制模块
    this.domInspector = new DOMInspector(this.collector)
    this.pageController = new PageController(this.collector)

    logger.info('SkillRouter initialized')
  }

  async init(): Promise<void> {
    // 初始化操作（如果需要）
    logger.info('SkillRouter ready')
  }

  async execute(command: string, args: string[]): Promise<any> {
    logger.info(`Executing command: ${command}`)

    try {
      switch (command) {
        case 'collect':
          return await this.handleCollect(args)

        case 'search':
          return await this.handleSearch(args)

        case 'deobfuscate':
          return await this.handleDeobfuscate(args)

        case 'understand':
          return await this.handleUnderstand(args)

        case 'summarize':
          return await this.handleSummarize(args)

        case 'detect-crypto':
          return await this.handleDetectCrypto(args)

        case 'browser':
          return await this.handleBrowser(args)

        case 'stats':
          return await this.handleStats(args)

        case 'clear':
          return await this.handleClear(args)

        case 'hook':
          return await this.handleHook(args)

        case 'hook-list':
          return this.handleHookList()

        case 'hook-data':
          return this.handleHookData(args)

        case 'hook-types':
          return this.handleHookTypes()

        case 'debugger':
          return await this.handleDebugger(args)

        case 'breakpoint':
          return await this.handleBreakpoint(args)

        case 'debug-step':
          return await this.handleDebugStep(args)

        case 'debug-eval':
          return await this.handleDebugEval(args)

        case 'debug-vars':
          return await this.handleDebugVars(args)

        case 'script':
          return await this.handleScript(args)

        case 'watch':
          return await this.handleWatch(args)

        case 'xhr-breakpoint':
          return await this.handleXHRBreakpoint(args)

        case 'event-breakpoint':
          return await this.handleEventBreakpoint(args)

        case 'blackbox':
          return await this.handleBlackbox(args)

        case 'stealth':
          return await this.handleStealth(args)

        case 'dom':
          return await this.handleDOM(args)

        case 'page':
          return await this.handlePage(args)

        default:
          throw new Error(`Unknown command: ${command}`)
      }
    } catch (error) {
      logger.error(`Command execution failed: ${command}`, error)
      throw error
    }
  }

  private async handleCollect(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error('URL is required')
    }

    // 解析 URL 和选项参数
    const url = args[0]
    const options: import('../types/index.js').CollectCodeOptions = { url }

    for (let i = 1; i < args.length; i++) {
      const arg = args[i]
      if (!arg) continue

      if (arg.startsWith('--smart-mode=')) {
        options.smartMode = arg.substring(13) as 'summary' | 'priority' | 'incremental' | 'full'
      } else if (arg.startsWith('--priorities=')) {
        options.priorities = arg.substring(13).split(',')
      } else if (arg === '--compress') {
        options.compress = true
      } else if (arg.startsWith('--max-total-size=')) {
        options.maxTotalSize = parseInt(arg.substring(17), 10)
      } else if (arg.startsWith('--max-file-size=')) {
        options.maxFileSize = parseInt(arg.substring(16), 10)
      } else if (arg === '--no-inline') {
        options.includeInline = false
      } else if (arg === '--include-dynamic') {
        options.includeDynamic = true
      }
    }

    const result = await this.collector.collect(options)

    return {
      success: true,
      command: 'collect',
      data: result,
    }
  }

  private async handleSearch(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error('Keyword is required')
    }

    const keyword = args[0]

    // 检查浏览器是否已启动（ScriptManager 依赖 CDP Session）
    const status = await this.collector.getStatus()
    if (!status.running) {
      throw new Error(
        '浏览器未启动。请先执行:\n' +
        '  browser launch\n' +
        '  collect <url>\n' +
        '然后再搜索',
      )
    }

    // 确保scriptManager已初始化
    await this.scriptManager.init()

    const result = await this.scriptManager.searchInScripts(keyword, {
      maxMatches: 100,
    })

    return {
      success: true,
      command: 'search',
      data: result,
    }
  }

  private async handleDeobfuscate(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Code is required. Usage:\n' +
        '  deobfuscate <code>\n' +
        '  deobfuscate --json <options-json>\n' +
        '\nJSON options:\n' +
        '  code (required), aggressive, advanced, jsvmp, astOptimize, unpack,\n' +
        '  aggressiveVM, renameVariables, llm, auto, timeout',
      )
    }

    let options: DeobfuscateFullOptions

    // 支持 --json 模式传入完整选项
    if (args[0] === '--json') {
      try {
        options = JSON.parse(args.slice(1).join(' '))
      } catch {
        throw new Error('Invalid JSON options')
      }
      if (!options.code) throw new Error('code field is required in JSON options')
    } else {
      options = { code: args.join(' ') }
    }

    const result = await this.deobfuscator.deobfuscate(options)

    return {
      success: true,
      command: 'deobfuscate',
      data: result,
    }
  }

  private async handleUnderstand(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Code is required. Usage:\n' +
        '  understand <code>\n' +
        '  understand --json <options-json>\n' +
        '  understand --focus=security <code>\n' +
        '\nJSON options:\n' +
        '  code (required), focus (all|structure|business|security), context (object)',
      )
    }

    let options: { code: string; focus?: 'all' | 'structure' | 'business' | 'security'; context?: Record<string, unknown> }

    // 支持 --json 模式传入完整选项
    if (args[0] === '--json') {
      try {
        options = JSON.parse(args.slice(1).join(' '))
      } catch {
        throw new Error('Invalid JSON options')
      }
      if (!options.code) throw new Error('code field is required in JSON options')
    } else if (args[0].startsWith('--focus=')) {
      // 支持 --focus=security 模式
      const focus = args[0].substring(8) as 'all' | 'structure' | 'business' | 'security'
      const validFocus = ['all', 'structure', 'business', 'security']
      if (!validFocus.includes(focus)) {
        throw new Error(`Invalid focus: ${focus}. Valid options: ${validFocus.join(', ')}`)
      }
      options = { code: args.slice(1).join(' '), focus }
    } else {
      // 简单模式
      options = { code: args.join(' '), focus: 'all' }
    }

    const result = await this.analyzer.understand(options)

    return {
      success: true,
      command: 'understand',
      data: result,
    }
  }

  private async handleDetectCrypto(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error('Code is required')
    }

    const code = args.join(' ')
    const result = await this.cryptoDetector.detect({ code })

    return {
      success: true,
      command: 'detect-crypto',
      data: result,
    }
  }

  private async handleSummarize(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Action is required. Usage:\n' +
        '  summarize code <code>          - 对代码片段生成AI摘要\n' +
        '  summarize collected            - 对已收集的文件生成摘要\n' +
        '  summarize collected --batch    - 批量生成摘要（并发）',
      )
    }

    const action = args[0]

    switch (action) {
      case 'code': {
        if (args.length < 2) {
          throw new Error('Code is required')
        }

        const code = args.slice(1).join(' ')

        // 包装成CodeFile对象
        const file: import('../types/index.js').CodeFile = {
          url: 'inline-code',
          content: code,
          size: code.length,
          type: 'inline',
        }

        const summary = await this.summarizer.summarizeFile(file)

        return {
          success: true,
          command: 'summarize',
          action: 'code',
          data: summary,
        }
      }

      case 'collected': {
        // 检查浏览器是否已启动（ScriptManager 依赖 CDP Session）
        const status = await this.collector.getStatus()
        if (!status.running) {
          throw new Error(
            '浏览器未启动。请先执行:\n' +
            '  browser launch\n' +
            '  collect <url>\n' +
            '然后再生成摘要',
          )
        }

        // 确保scriptManager已初始化
        await this.scriptManager.init()

        // 获取已收集的脚本
        const scripts = await this.scriptManager.getAllScripts(true)

        if (!scripts || scripts.length === 0) {
          return {
            success: false,
            command: 'summarize',
            action: 'collected',
            message: 'No collected scripts found. Please navigate to a page first.',
          }
        }

        // 转换为CodeFile格式
        const files: import('../types/index.js').CodeFile[] = scripts
          .filter((script: any) => script.source && script.source.length > 0)
          .map((script: any) => ({
            url: script.url || 'unknown',
            content: script.source || '',
            size: script.source?.length || 0,
            type: 'external' as const,
          }))

        if (files.length === 0) {
          return {
            success: false,
            command: 'summarize',
            action: 'collected',
            message: 'No scripts with source code found.',
          }
        }

        // 检查是否使用批量模式
        const useBatch = args.includes('--batch')

        let summaries
        if (useBatch) {
          summaries = await this.summarizer.summarizeBatch(files, 3)
        } else {
          // 逐个生成摘要
          summaries = []
          for (const file of files) {
            const summary = await this.summarizer.summarizeFile(file)
            summaries.push(summary)
          }
        }

        return {
          success: true,
          command: 'summarize',
          action: 'collected',
          data: {
            totalFiles: files.length,
            summaries,
          },
        }
      }

      default:
        throw new Error(`Unknown summarize action: ${action}`)
    }
  }

  private async handleBrowser(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error('Browser action is required')
    }

    const action = args[0]

    switch (action) {
      case 'launch':
        await this.collector.init()
        return {
          success: true,
          command: 'browser',
          action: 'launch',
          message: 'Browser launched',
        }

      case 'close':
        await this.collector.close()
        return {
          success: true,
          command: 'browser',
          action: 'close',
          message: 'Browser closed',
        }

      case 'status':
        const status = await this.collector.getStatus()
        return {
          success: true,
          command: 'browser',
          action: 'status',
          data: status,
        }

      default:
        throw new Error(`Unknown browser action: ${action}`)
    }
  }

  private async handleStats(args: string[]): Promise<any> {
    const stats = await this.collector.getAllStats()

    return {
      success: true,
      command: 'stats',
      data: stats,
    }
  }

  private async handleClear(args: string[]): Promise<any> {
    await this.collector.clearAllData()

    return {
      success: true,
      command: 'clear',
      message: 'All data cleared',
    }
  }

  // ==================== Hook 命令 ====================

  private async handleHook(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Hook action is required. Usage:\n' +
        '  hook create <type> [options-json]\n' +
        '  hook generate <type> [target]\n' +
        '  hook remove <hookId>\n' +
        '  hook enable <hookId>\n' +
        '  hook disable <hookId>\n' +
        '  hook clear\n' +
        '  hook anti-debug\n' +
        '  hook export [format]',
      )
    }

    const action = args[0]

    switch (action) {
      case 'create': {
        // hook create <type> [options-json]
        const type = args[1]
        if (!type) throw new Error('Hook type is required')

        let options: Record<string, unknown> = {}
        if (args[2]) {
          try {
            options = JSON.parse(args.slice(2).join(' '))
          } catch {
            throw new Error('Invalid JSON options')
          }
        }

        const result = this.hookManager.create({
          type,
          params: options.params as Record<string, unknown>,
          description: options.description as string,
          action: options.action as 'log' | 'block' | 'modify' | 'passthrough',
          capture: options.capture as HookCreateOptionsCapture,
          condition: options.condition as HookCreateOptionsCondition,
          lifecycle: options.lifecycle as HookCreateOptionsLifecycle,
          store: options.store as HookCreateOptionsStore,
          asyncAware: options.asyncAware as boolean,
        })

        return {
          success: true,
          command: 'hook',
          action: 'create',
          data: {
            hookId: result.hookId,
            script: result.script,
            message: `Hook created: ${result.hookId}`,
          },
        }
      }

      case 'generate': {
        // hook generate <shortcut> [target] [options]
        const shortcut = args[1]
        if (!shortcut) throw new Error('Hook shortcut is required (function, fetch, xhr, websocket, property, event, eval, cookie, localstorage, timer)')

        const target = args[2]
        let options: Record<string, unknown> = {}
        if (args[3]) {
          try {
            options = JSON.parse(args.slice(3).join(' '))
          } catch {
            // 忽略，使用默认选项
          }
        }

        let result
        switch (shortcut) {
          case 'function':
            if (!target) throw new Error('Target function name is required')
            result = this.hookGenerator.hookFunction(target, options)
            break
          case 'fetch':
            result = this.hookGenerator.hookFetch({ urlPattern: target, ...options })
            break
          case 'xhr':
            result = this.hookGenerator.hookXHR({ urlPattern: target, ...options })
            break
          case 'websocket':
            result = this.hookGenerator.hookWebSocket({ urlPattern: target, ...options })
            break
          case 'property': {
            const [obj, prop] = (target || '').split('.')
            if (!obj || !prop) throw new Error('Target must be in format "object.property"')
            result = this.hookGenerator.hookProperty(obj, prop, options)
            break
          }
          case 'event':
            result = this.hookGenerator.hookEvent(target, options)
            break
          case 'eval':
            result = this.hookGenerator.hookEval(options)
            break
          case 'cookie':
            result = this.hookGenerator.hookCookie(options)
            break
          case 'localstorage':
            result = this.hookGenerator.hookLocalStorage({ keyPattern: target, ...options })
            break
          case 'timer':
            result = this.hookGenerator.hookTimers({ timerType: target as 'setTimeout' | 'setInterval' | 'both', ...options })
            break
          default:
            throw new Error(`Unknown hook shortcut: ${shortcut}`)
        }

        return {
          success: true,
          command: 'hook',
          action: 'generate',
          data: result,
        }
      }

      case 'remove': {
        const hookId = args[1]
        if (!hookId) throw new Error('Hook ID is required')
        const removed = this.hookManager.remove(hookId)
        return {
          success: removed,
          command: 'hook',
          action: 'remove',
          message: removed ? `Hook removed: ${hookId}` : `Hook not found: ${hookId}`,
        }
      }

      case 'enable': {
        const hookId = args[1]
        if (!hookId) throw new Error('Hook ID is required')
        const enabled = this.hookManager.enable(hookId)
        return {
          success: enabled,
          command: 'hook',
          action: 'enable',
          message: enabled ? `Hook enabled: ${hookId}` : `Hook not found: ${hookId}`,
        }
      }

      case 'disable': {
        const hookId = args[1]
        if (!hookId) throw new Error('Hook ID is required')
        const disabled = this.hookManager.disable(hookId)
        return {
          success: disabled,
          command: 'hook',
          action: 'disable',
          message: disabled ? `Hook disabled: ${hookId}` : `Hook not found: ${hookId}`,
        }
      }

      case 'clear':
        this.hookManager.clearAll()
        return {
          success: true,
          command: 'hook',
          action: 'clear',
          message: 'All hooks cleared',
        }

      case 'anti-debug':
        return {
          success: true,
          command: 'hook',
          action: 'anti-debug',
          data: {
            script: this.hookManager.generateAntiDebugBypass(),
            message: 'Anti-debug bypass script generated',
          },
        }

      case 'export': {
        const format = (args[1] as 'json' | 'csv') || 'json'
        return {
          success: true,
          command: 'hook',
          action: 'export',
          data: this.hookManager.exportData(format),
        }
      }

      default:
        throw new Error(`Unknown hook action: ${action}`)
    }
  }

  private handleHookList(): any {
    return {
      success: true,
      command: 'hook-list',
      data: this.hookManager.getStats(),
    }
  }

  private handleHookData(args: string[]): any {
    const hookId = args[0]

    if (hookId) {
      return {
        success: true,
        command: 'hook-data',
        data: this.hookManager.getRecords(hookId),
      }
    }

    // 返回所有 hook 的数据摘要
    const hooks = this.hookManager.getAllHooks()
    const summary = hooks.map(h => ({
      hookId: h.hookId,
      type: h.type,
      description: h.description,
      recordCount: this.hookManager.getRecords(h.hookId).length,
      callCount: h.callCount,
    }))

    return {
      success: true,
      command: 'hook-data',
      data: summary,
    }
  }

  private handleHookTypes(): any {
    const types = this.hookManager.getRegisteredTypes()
    return {
      success: true,
      command: 'hook-types',
      data: types.map(t => ({
        name: t.name,
        description: t.description,
      })),
    }
  }

  // ==================== Debugger 命令 ====================

  private async handleDebugger(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Debugger action is required. Usage:\n' +
        '  debugger enable\n' +
        '  debugger disable\n' +
        '  debugger status\n' +
        '  debugger init-advanced',
      )
    }

    const action = args[0]

    switch (action) {
      case 'enable':
        await this.debuggerManager.enable()
        return {
          success: true,
          command: 'debugger',
          action: 'enable',
          message: 'Debugger enabled',
        }

      case 'disable':
        await this.debuggerManager.disable()
        return {
          success: true,
          command: 'debugger',
          action: 'disable',
          message: 'Debugger disabled',
        }

      case 'status':
        return {
          success: true,
          command: 'debugger',
          action: 'status',
          data: {
            enabled: this.debuggerManager.isEnabled(),
            paused: this.debuggerManager.isPaused(),
            breakpointCount: this.debuggerManager.listBreakpoints().length,
            pauseOnExceptions: this.debuggerManager.getPauseOnExceptionsState(),
          },
        }

      case 'init-advanced':
        await this.debuggerManager.initAdvancedFeatures(this.runtimeInspector)
        return {
          success: true,
          command: 'debugger',
          action: 'init-advanced',
          message: 'Advanced debugging features initialized',
        }

      default:
        throw new Error(`Unknown debugger action: ${action}`)
    }
  }

  private async handleBreakpoint(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Breakpoint action is required. Usage:\n' +
        '  breakpoint set-url <url> <line> [column] [condition]\n' +
        '  breakpoint set-script <scriptId> <line> [column] [condition]\n' +
        '  breakpoint remove <breakpointId>\n' +
        '  breakpoint list\n' +
        '  breakpoint clear',
      )
    }

    const action = args[0]

    switch (action) {
      case 'set-url': {
        const url = args[1]
        const lineNumber = parseInt(args[2], 10)
        const columnNumber = args[3] ? parseInt(args[3], 10) : undefined
        const condition = args[4]

        if (!url || isNaN(lineNumber)) {
          throw new Error('URL and line number are required')
        }

        const bp = await this.debuggerManager.setBreakpointByUrl({
          url,
          lineNumber,
          columnNumber,
          condition,
        })

        return {
          success: true,
          command: 'breakpoint',
          action: 'set-url',
          data: bp,
        }
      }

      case 'set-script': {
        const scriptId = args[1]
        const lineNumber = parseInt(args[2], 10)
        const columnNumber = args[3] ? parseInt(args[3], 10) : undefined
        const condition = args[4]

        if (!scriptId || isNaN(lineNumber)) {
          throw new Error('Script ID and line number are required')
        }

        const bp = await this.debuggerManager.setBreakpoint({
          scriptId,
          lineNumber,
          columnNumber,
          condition,
        })

        return {
          success: true,
          command: 'breakpoint',
          action: 'set-script',
          data: bp,
        }
      }

      case 'remove': {
        const breakpointId = args[1]
        if (!breakpointId) throw new Error('Breakpoint ID is required')

        await this.debuggerManager.removeBreakpoint(breakpointId)
        return {
          success: true,
          command: 'breakpoint',
          action: 'remove',
          message: `Breakpoint removed: ${breakpointId}`,
        }
      }

      case 'list':
        return {
          success: true,
          command: 'breakpoint',
          action: 'list',
          data: this.debuggerManager.listBreakpoints(),
        }

      case 'clear':
        await this.debuggerManager.clearAllBreakpoints()
        return {
          success: true,
          command: 'breakpoint',
          action: 'clear',
          message: 'All breakpoints cleared',
        }

      default:
        throw new Error(`Unknown breakpoint action: ${action}`)
    }
  }

  private async handleDebugStep(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Debug step action is required. Usage:\n' +
        '  debug-step pause\n' +
        '  debug-step resume\n' +
        '  debug-step into\n' +
        '  debug-step over\n' +
        '  debug-step out',
      )
    }

    const action = args[0]

    switch (action) {
      case 'pause':
        await this.debuggerManager.pause()
        return {
          success: true,
          command: 'debug-step',
          action: 'pause',
          message: 'Execution paused',
        }

      case 'resume':
        await this.debuggerManager.resume()
        return {
          success: true,
          command: 'debug-step',
          action: 'resume',
          message: 'Execution resumed',
        }

      case 'into':
        await this.debuggerManager.stepInto()
        return {
          success: true,
          command: 'debug-step',
          action: 'into',
          message: 'Step into',
        }

      case 'over':
        await this.debuggerManager.stepOver()
        return {
          success: true,
          command: 'debug-step',
          action: 'over',
          message: 'Step over',
        }

      case 'out':
        await this.debuggerManager.stepOut()
        return {
          success: true,
          command: 'debug-step',
          action: 'out',
          message: 'Step out',
        }

      default:
        throw new Error(`Unknown debug step action: ${action}`)
    }
  }

  private async handleDebugEval(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error('Expression is required')
    }

    const expression = args.join(' ')

    // 暂停状态下使用 callFrame 求值，否则降级到全局求值
    let result: any
    let context: string

    if (this.debuggerManager.isPaused()) {
      result = await this.runtimeInspector.evaluate(expression)
      context = 'callFrame'
    } else {
      // 确保 RuntimeInspector 已初始化
      if (!this.runtimeInspector.isInitialized()) {
        await this.runtimeInspector.init()
      }
      result = await this.runtimeInspector.evaluateGlobal(expression)
      context = 'global'
    }

    return {
      success: true,
      command: 'debug-eval',
      data: {
        expression,
        result,
        context,
      },
    }
  }

  private async handleDebugVars(args: string[]): Promise<any> {
    const callFrameId = args[0]
    const result = await this.debuggerManager.getScopeVariables({
      callFrameId,
      includeObjectProperties: true,
      maxDepth: 2,
    })

    return {
      success: true,
      command: 'debug-vars',
      data: result,
    }
  }

  private async handleScript(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Script action is required. Usage:\n' +
        '  script list [includeSource]\n' +
        '  script get <scriptId>\n' +
        '  script find <urlPattern>\n' +
        '  script search <keyword>',
      )
    }

    const action = args[0]

    // 确保scriptManager已初始化
    await this.scriptManager.init()

    switch (action) {
      case 'list': {
        const includeSource = args[1] === 'true'
        const scripts = await this.scriptManager.getAllScripts(includeSource)
        return {
          success: true,
          command: 'script',
          action: 'list',
          data: scripts,
        }
      }

      case 'get': {
        const scriptId = args[1]
        if (!scriptId) throw new Error('Script ID is required')

        const script = await this.scriptManager.getScriptSource(scriptId)
        return {
          success: true,
          command: 'script',
          action: 'get',
          data: script,
        }
      }

      case 'find': {
        const urlPattern = args[1]
        if (!urlPattern) throw new Error('URL pattern is required')

        const scripts = await this.scriptManager.findScriptsByUrl(urlPattern)
        return {
          success: true,
          command: 'script',
          action: 'find',
          data: scripts,
        }
      }

      case 'search': {
        const keyword = args[1]
        if (!keyword) throw new Error('Keyword is required')

        const result = await this.scriptManager.searchInScripts(keyword, {
          maxMatches: 100,
        })
        return {
          success: true,
          command: 'script',
          action: 'search',
          data: result,
        }
      }

      default:
        throw new Error(`Unknown script action: ${action}`)
    }
  }

  // ==================== 高级调试功能命令 ====================

  private async handleWatch(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Watch action is required. Usage:\n' +
        '  watch add <expression> [name]\n' +
        '  watch remove <watchId>\n' +
        '  watch enable <watchId>\n' +
        '  watch disable <watchId>\n' +
        '  watch list\n' +
        '  watch evaluate [callFrameId]\n' +
        '  watch clear\n' +
        '  watch export\n' +
        '  watch import <json>',
      )
    }

    const action = args[0]
    const watchManager = this.debuggerManager.getWatchManager()

    switch (action) {
      case 'add': {
        const expression = args[1]
        if (!expression) throw new Error('Expression is required')
        const name = args[2]
        const watchId = watchManager.addWatch(expression, name)
        return {
          success: true,
          command: 'watch',
          action: 'add',
          data: { watchId, expression, name },
        }
      }

      case 'remove': {
        const watchId = args[1]
        if (!watchId) throw new Error('Watch ID is required')
        const removed = watchManager.removeWatch(watchId)
        return {
          success: removed,
          command: 'watch',
          action: 'remove',
          message: removed ? `Watch removed: ${watchId}` : `Watch not found: ${watchId}`,
        }
      }

      case 'enable': {
        const watchId = args[1]
        if (!watchId) throw new Error('Watch ID is required')
        const enabled = watchManager.setWatchEnabled(watchId, true)
        return {
          success: enabled,
          command: 'watch',
          action: 'enable',
          message: enabled ? `Watch enabled: ${watchId}` : `Watch not found: ${watchId}`,
        }
      }

      case 'disable': {
        const watchId = args[1]
        if (!watchId) throw new Error('Watch ID is required')
        const disabled = watchManager.setWatchEnabled(watchId, false)
        return {
          success: disabled,
          command: 'watch',
          action: 'disable',
          message: disabled ? `Watch disabled: ${watchId}` : `Watch not found: ${watchId}`,
        }
      }

      case 'list': {
        const watches = watchManager.getAllWatches()
        return {
          success: true,
          command: 'watch',
          action: 'list',
          data: watches,
        }
      }

      case 'evaluate': {
        const callFrameId = args[1]
        const results = await watchManager.evaluateAll(callFrameId)
        return {
          success: true,
          command: 'watch',
          action: 'evaluate',
          data: results,
        }
      }

      case 'clear': {
        watchManager.clearAll()
        return {
          success: true,
          command: 'watch',
          action: 'clear',
          message: 'All watches cleared',
        }
      }

      case 'export': {
        const exported = watchManager.exportWatches()
        return {
          success: true,
          command: 'watch',
          action: 'export',
          data: exported,
        }
      }

      case 'import': {
        if (args.length < 2) throw new Error('JSON data is required')
        try {
          const watches = JSON.parse(args.slice(1).join(' '))
          watchManager.importWatches(watches)
          return {
            success: true,
            command: 'watch',
            action: 'import',
            message: `Imported ${watches.length} watches`,
          }
        } catch (error) {
          throw new Error('Invalid JSON data')
        }
      }

      default:
        throw new Error(`Unknown watch action: ${action}`)
    }
  }

  private async handleXHRBreakpoint(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'XHR breakpoint action is required. Usage:\n' +
        '  xhr-breakpoint set <urlPattern>\n' +
        '  xhr-breakpoint remove <breakpointId>\n' +
        '  xhr-breakpoint list\n' +
        '  xhr-breakpoint clear',
      )
    }

    const action = args[0]
    const xhrManager = this.debuggerManager.getXHRManager()

    switch (action) {
      case 'set': {
        const urlPattern = args[1]
        if (!urlPattern) throw new Error('URL pattern is required')
        const breakpointId = await xhrManager.setXHRBreakpoint(urlPattern)
        return {
          success: true,
          command: 'xhr-breakpoint',
          action: 'set',
          data: { breakpointId, urlPattern },
        }
      }

      case 'remove': {
        const breakpointId = args[1]
        if (!breakpointId) throw new Error('Breakpoint ID is required')
        const removed = await xhrManager.removeXHRBreakpoint(breakpointId)
        return {
          success: removed,
          command: 'xhr-breakpoint',
          action: 'remove',
          message: removed ? `XHR breakpoint removed: ${breakpointId}` : `Breakpoint not found: ${breakpointId}`,
        }
      }

      case 'list': {
        const breakpoints = xhrManager.getAllXHRBreakpoints()
        return {
          success: true,
          command: 'xhr-breakpoint',
          action: 'list',
          data: breakpoints,
        }
      }

      case 'clear': {
        await xhrManager.clearAllXHRBreakpoints()
        return {
          success: true,
          command: 'xhr-breakpoint',
          action: 'clear',
          message: 'All XHR breakpoints cleared',
        }
      }

      default:
        throw new Error(`Unknown xhr-breakpoint action: ${action}`)
    }
  }

  private async handleEventBreakpoint(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Event breakpoint action is required. Usage:\n' +
        '  event-breakpoint set <eventName> [targetName]\n' +
        '  event-breakpoint remove <breakpointId>\n' +
        '  event-breakpoint set-mouse\n' +
        '  event-breakpoint set-keyboard\n' +
        '  event-breakpoint set-timer\n' +
        '  event-breakpoint set-websocket\n' +
        '  event-breakpoint list\n' +
        '  event-breakpoint clear',
      )
    }

    const action = args[0]
    const eventManager = this.debuggerManager.getEventManager()

    switch (action) {
      case 'set': {
        const eventName = args[1]
        if (!eventName) throw new Error('Event name is required')
        const targetName = args[2]
        const breakpointId = await eventManager.setEventListenerBreakpoint(eventName, targetName)
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'set',
          data: { breakpointId, eventName, targetName },
        }
      }

      case 'remove': {
        const breakpointId = args[1]
        if (!breakpointId) throw new Error('Breakpoint ID is required')
        const removed = await eventManager.removeEventListenerBreakpoint(breakpointId)
        return {
          success: removed,
          command: 'event-breakpoint',
          action: 'remove',
          message: removed ? `Event breakpoint removed: ${breakpointId}` : `Breakpoint not found: ${breakpointId}`,
        }
      }

      case 'set-mouse': {
        const breakpointIds = await eventManager.setMouseEventBreakpoints()
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'set-mouse',
          data: { breakpointIds, count: breakpointIds.length },
        }
      }

      case 'set-keyboard': {
        const breakpointIds = await eventManager.setKeyboardEventBreakpoints()
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'set-keyboard',
          data: { breakpointIds, count: breakpointIds.length },
        }
      }

      case 'set-timer': {
        const breakpointIds = await eventManager.setTimerEventBreakpoints()
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'set-timer',
          data: { breakpointIds, count: breakpointIds.length },
        }
      }

      case 'set-websocket': {
        const breakpointIds = await eventManager.setWebSocketEventBreakpoints()
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'set-websocket',
          data: { breakpointIds, count: breakpointIds.length },
        }
      }

      case 'list': {
        const breakpoints = eventManager.getAllEventBreakpoints()
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'list',
          data: breakpoints,
        }
      }

      case 'clear': {
        await eventManager.clearAllEventBreakpoints()
        return {
          success: true,
          command: 'event-breakpoint',
          action: 'clear',
          message: 'All event breakpoints cleared',
        }
      }

      default:
        throw new Error(`Unknown event-breakpoint action: ${action}`)
    }
  }

  private async handleBlackbox(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Blackbox action is required. Usage:\n' +
        '  blackbox set <urlPattern>      - 黑盒化脚本（支持通配符*）\n' +
        '  blackbox remove <urlPattern>   - 取消黑盒化\n' +
        '  blackbox set-common            - 黑盒化常用库\n' +
        '  blackbox list                  - 列出所有黑盒化模式\n' +
        '  blackbox clear                 - 清除所有黑盒化',
      )
    }

    const action = args[0]
    const blackboxManager = this.debuggerManager.getBlackboxManager()

    switch (action) {
      case 'set': {
        const urlPattern = args[1]
        if (!urlPattern) throw new Error('URL pattern is required')
        await blackboxManager.blackboxByPattern(urlPattern)
        return {
          success: true,
          command: 'blackbox',
          action: 'set',
          data: { urlPattern },
        }
      }

      case 'remove': {
        const urlPattern = args[1]
        if (!urlPattern) throw new Error('URL pattern is required')
        const removed = await blackboxManager.unblackboxByPattern(urlPattern)
        return {
          success: removed,
          command: 'blackbox',
          action: 'remove',
          message: removed ? `Blackbox pattern removed: ${urlPattern}` : `Pattern not found: ${urlPattern}`,
        }
      }

      case 'set-common': {
        await blackboxManager.blackboxCommonLibraries()
        return {
          success: true,
          command: 'blackbox',
          action: 'set-common',
          message: 'Common libraries blackboxed',
        }
      }

      case 'list': {
        const patterns = blackboxManager.getAllBlackboxedPatterns()
        return {
          success: true,
          command: 'blackbox',
          action: 'list',
          data: patterns,
        }
      }

      case 'clear': {
        await blackboxManager.clearAllBlackboxedPatterns()
        return {
          success: true,
          command: 'blackbox',
          action: 'clear',
          message: 'All blackbox patterns cleared',
        }
      }

      default:
        throw new Error(`Unknown blackbox action: ${action}`)
    }
  }

  // ==================== Stealth 命令 ====================

  private async handleStealth(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Stealth action is required. Usage:\n' +
        '  stealth inject [options-json]      - 注入反检测脚本到当前页面\n' +
        '  stealth inject-preset <preset>     - 使用预设注入\n' +
        '  stealth set-ua <platform>          - 设置 User-Agent\n' +
        '  stealth presets                    - 列出所有可用预设\n' +
        '  stealth status                     - 查看当前 stealth 状态\n' +
        '  stealth features                   - 列出所有反检测功能',
      )
    }

    const action = args[0]

    switch (action) {
      case 'inject': {
        const page = await this.ensurePageForStealth()

        let options: StealthInjectionOptions = {}
        if (args[1]) {
          try {
            options = JSON.parse(args.slice(1).join(' '))
          } catch {
            throw new Error(
              'Invalid JSON options. Example:\n' +
              '  stealth inject {"preset":"windows-chrome","canvasNoise":true}\n' +
              '  stealth inject {"preset":"mac-safari","performanceNoise":false}',
            )
          }
        }

        const report = await StealthScripts2025.injectAll(page, options)

        return {
          success: true,
          command: 'stealth',
          action: 'inject',
          data: report,
        }
      }

      case 'inject-preset': {
        const preset = args[1] as StealthPreset
        if (!preset) {
          throw new Error(
            'Preset is required. Available:\n' +
            '  windows-chrome, mac-chrome, mac-safari, linux-chrome, windows-edge',
          )
        }

        const validPresets: StealthPreset[] = [
          'windows-chrome', 'mac-chrome', 'mac-safari', 'linux-chrome', 'windows-edge',
        ]
        if (!validPresets.includes(preset)) {
          throw new Error(`Unknown preset: ${preset}. Available: ${validPresets.join(', ')}`)
        }

        const page = await this.ensurePageForStealth()
        const report = await StealthScripts2025.injectAll(page, { preset })

        return {
          success: true,
          command: 'stealth',
          action: 'inject-preset',
          data: report,
        }
      }

      case 'set-ua': {
        const platform = (args[1] ?? 'windows') as 'windows' | 'mac' | 'linux'
        const validPlatforms = ['windows', 'mac', 'linux']
        if (!validPlatforms.includes(platform)) {
          throw new Error(`Unknown platform: ${platform}. Available: ${validPlatforms.join(', ')}`)
        }

        const page = await this.ensurePageForStealth()
        await StealthScripts2025.setRealisticUserAgent(page, platform)

        const presetMap: Record<string, StealthPreset> = {
          windows: 'windows-chrome',
          mac: 'mac-chrome',
          linux: 'linux-chrome',
        }
        const resolved = StealthScripts2025.resolveOptions({ preset: presetMap[platform] })

        return {
          success: true,
          command: 'stealth',
          action: 'set-ua',
          data: {
            platform,
            userAgent: resolved.userAgent,
            navigatorPlatform: resolved.navigatorPlatform,
          },
        }
      }

      case 'presets': {
        const presets = StealthScripts2025.getPresets()
        return {
          success: true,
          command: 'stealth',
          action: 'presets',
          data: presets,
        }
      }

      case 'status': {
        const currentOpts = StealthScripts2025.getCurrentOptions()
        if (!currentOpts) {
          return {
            success: true,
            command: 'stealth',
            action: 'status',
            data: {
              injected: false,
              message: 'No stealth scripts injected yet',
            },
          }
        }

        return {
          success: true,
          command: 'stealth',
          action: 'status',
          data: {
            injected: true,
            preset: currentOpts.preset ?? 'windows-chrome',
            userAgent: currentOpts.userAgent,
            platform: currentOpts.navigatorPlatform,
            languages: currentOpts.languages,
            features: {
              hideWebDriver: currentOpts.hideWebDriver !== false,
              mockChrome: currentOpts.mockChrome !== false,
              fixPermissions: currentOpts.fixPermissions !== false,
              canvasNoise: currentOpts.canvasNoise !== false,
              webglOverride: currentOpts.webglOverride !== false,
              audioContextNoise: currentOpts.audioContextNoise !== false,
              performanceNoise: currentOpts.performanceNoise === true,
              mockBattery: currentOpts.mockBatteryAPI !== false,
              mockMediaDevices: currentOpts.mockMediaDevicesAPI !== false,
              mockNotifications: currentOpts.mockNotificationAPI !== false,
              mockConnection: currentOpts.mockConnection !== false,
              focusOverride: currentOpts.focusOverride !== false,
            },
          },
        }
      }

      case 'features': {
        return {
          success: true,
          command: 'stealth',
          action: 'features',
          data: [
            { name: 'hideWebDriver', description: '隐藏 navigator.webdriver 属性，欺骗 webdriver 检测', default: true },
            { name: 'mockChrome', description: '模拟真实 window.chrome 对象（runtime/loadTimes/csi/app）', default: true },
            { name: 'setUserAgent', description: '设置一致的 UA、platform、vendor、hardwareConcurrency、deviceMemory', default: true },
            { name: 'fixPermissions', description: '修复 Permissions API，消除 automation 特征', default: true },
            { name: 'mockPlugins', description: '模拟 navigator.plugins（PDF Viewer 等 5 个标准插件）', default: true },
            { name: 'canvasNoise', description: 'Canvas 指纹噪声（每会话随机种子，确定性扰动）', default: true },
            { name: 'webglOverride', description: 'WebGL/WebGL2 厂商+渲染器覆盖', default: true },
            { name: 'audioContextNoise', description: 'AudioContext/OfflineAudioContext 指纹噪声', default: true },
            { name: 'fixLanguages', description: '设置 navigator.languages + navigator.language', default: true },
            { name: 'mockBattery', description: '模拟 Battery API（getBattery）', default: true },
            { name: 'mockMediaDevices', description: '模拟 MediaDevices.enumerateDevices', default: true },
            { name: 'mockNotifications', description: '模拟 Notification API 权限', default: true },
            { name: 'mockConnection', description: '模拟 NetworkInformation API（effectiveType/downlink/rtt）', default: true },
            { name: 'focusOverride', description: 'document.hasFocus() 始终返回 true，visibilityState = visible', default: true },
            { name: 'performanceNoise', description: 'performance.now() 微量噪声（默认关闭，可能影响调试）', default: false },
            { name: 'overrideScreen', description: '覆盖 screen 属性（分辨率/色深/outerWidth等）', default: false },
          ],
        }
      }

      default:
        throw new Error(`Unknown stealth action: ${action}`)
    }
  }

  /** 确保有可操作的 Page 实例 */
  private async ensurePageForStealth(): Promise<any> {
    const page = this.browserManager.getCurrentPage()
    if (!page) {
      throw new Error(
        '浏览器未启动或无当前页面。请先执行:\n' +
        '  browser launch\n' +
        '然后再注入 stealth 脚本',
      )
    }
    return page
  }

  // ==================== DOM 命令 ====================

  private async handleDOM(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'DOM action is required. Usage:\n' +
        '  dom query <selector>                    - 查询单个元素\n' +
        '  dom query-all <selector> [limit]        - 查询所有元素\n' +
        '  dom structure [maxDepth] [includeText]  - 获取DOM结构\n' +
        '  dom clickable [filterText]              - 查找可点击元素\n' +
        '  dom style <selector>                    - 获取计算样式\n' +
        '  dom wait <selector> [timeout]           - 等待元素出现',
      )
    }

    const action = args[0]

    switch (action) {
      case 'query': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        const result = await this.domInspector.querySelector(selector)
        return {
          success: true,
          command: 'dom',
          action: 'query',
          data: result,
        }
      }

      case 'query-all': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        const limit = args[2] ? parseInt(args[2], 10) : 50
        const results = await this.domInspector.querySelectorAll(selector, limit)

        return {
          success: true,
          command: 'dom',
          action: 'query-all',
          data: {
            selector,
            limit,
            count: results.length,
            elements: results,
          },
        }
      }

      case 'structure': {
        const maxDepth = args[1] ? parseInt(args[1], 10) : 3
        const includeText = args[2] !== 'false'

        const structure = await this.domInspector.getStructure(maxDepth, includeText)
        return {
          success: true,
          command: 'dom',
          action: 'structure',
          data: structure,
        }
      }

      case 'clickable': {
        const filterText = args[1]
        const elements = await this.domInspector.findClickable(filterText)

        return {
          success: true,
          command: 'dom',
          action: 'clickable',
          data: {
            count: elements.length,
            elements,
          },
        }
      }

      case 'style': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        const styles = await this.domInspector.getComputedStyle(selector)
        return {
          success: true,
          command: 'dom',
          action: 'style',
          data: {
            selector,
            styles,
          },
        }
      }

      case 'wait': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        const timeout = args[2] ? parseInt(args[2], 10) : 30000
        const result = await this.domInspector.waitForElement(selector, timeout)

        return {
          success: result !== null,
          command: 'dom',
          action: 'wait',
          data: result,
        }
      }

      default:
        throw new Error(`Unknown dom action: ${action}`)
    }
  }

  // ==================== Page 命令 ====================

  private async handlePage(args: string[]): Promise<any> {
    if (args.length === 0) {
      throw new Error(
        'Page action is required. Usage:\n' +
        '  page navigate <url>                     - 导航到URL\n' +
        '  page reload                             - 重新加载\n' +
        '  page back                               - 后退\n' +
        '  page forward                            - 前进\n' +
        '  page click <selector>                   - 点击元素\n' +
        '  page type <selector> <text>             - 输入文本\n' +
        '  page select <selector> <values...>      - 选择下拉框\n' +
        '  page hover <selector>                   - 鼠标悬停\n' +
        '  page scroll <x> <y>                     - 滚动页面\n' +
        '  page wait-selector <selector> [timeout] - 等待选择器\n' +
        '  page wait-nav [timeout]                 - 等待导航\n' +
        '  page eval <code>                        - 执行JavaScript\n' +
        '  page url                                - 获取URL\n' +
        '  page title                              - 获取标题\n' +
        '  page content                            - 获取HTML内容\n' +
        '  page screenshot [path]                  - 截图\n' +
        '  page metrics                            - 获取性能指标',
      )
    }

    const action = args[0]

    switch (action) {
      case 'navigate': {
        const url = args[1]
        if (!url) throw new Error('URL is required')

        const result = await this.pageController.navigate(url)
        return {
          success: true,
          command: 'page',
          action: 'navigate',
          data: result,
        }
      }

      case 'reload': {
        await this.pageController.reload()
        return {
          success: true,
          command: 'page',
          action: 'reload',
          message: 'Page reloaded',
        }
      }

      case 'back': {
        await this.pageController.goBack()
        return {
          success: true,
          command: 'page',
          action: 'back',
          message: 'Navigated back',
        }
      }

      case 'forward': {
        await this.pageController.goForward()
        return {
          success: true,
          command: 'page',
          action: 'forward',
          message: 'Navigated forward',
        }
      }

      case 'click': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        await this.pageController.click(selector)
        return {
          success: true,
          command: 'page',
          action: 'click',
          data: { selector },
        }
      }

      case 'type': {
        const selector = args[1]
        const text = args.slice(2).join(' ')
        if (!selector || !text) throw new Error('Selector and text are required')

        await this.pageController.type(selector, text)
        return {
          success: true,
          command: 'page',
          action: 'type',
          data: { selector, text },
        }
      }

      case 'select': {
        const selector = args[1]
        const values = args.slice(2)
        if (!selector || values.length === 0) {
          throw new Error('Selector and at least one value are required')
        }

        await this.pageController.select(selector, ...values)
        return {
          success: true,
          command: 'page',
          action: 'select',
          data: { selector, values },
        }
      }

      case 'hover': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        await this.pageController.hover(selector)
        return {
          success: true,
          command: 'page',
          action: 'hover',
          data: { selector },
        }
      }

      case 'scroll': {
        const x = args[1] ? parseInt(args[1], 10) : 0
        const y = args[2] ? parseInt(args[2], 10) : 0

        await this.pageController.scroll({ x, y })
        return {
          success: true,
          command: 'page',
          action: 'scroll',
          data: { x, y },
        }
      }

      case 'wait-selector': {
        const selector = args[1]
        if (!selector) throw new Error('Selector is required')

        const timeout = args[2] ? parseInt(args[2], 10) : 30000
        const result = await this.pageController.waitForSelector(selector, timeout)

        return {
          success: result.success,
          command: 'page',
          action: 'wait-selector',
          data: result,
        }
      }

      case 'wait-nav': {
        const timeout = args[1] ? parseInt(args[1], 10) : 30000
        await this.pageController.waitForNavigation(timeout)

        return {
          success: true,
          command: 'page',
          action: 'wait-nav',
          message: 'Navigation completed',
        }
      }

      case 'eval': {
        const code = args.slice(1).join(' ')
        if (!code) throw new Error('Code is required')

        const result = await this.pageController.evaluate(code)
        return {
          success: true,
          command: 'page',
          action: 'eval',
          data: { code, result },
        }
      }

      case 'url': {
        const url = await this.pageController.getURL()
        return {
          success: true,
          command: 'page',
          action: 'url',
          data: { url },
        }
      }

      case 'title': {
        const title = await this.pageController.getTitle()
        return {
          success: true,
          command: 'page',
          action: 'title',
          data: { title },
        }
      }

      case 'content': {
        const content = await this.pageController.getContent()
        return {
          success: true,
          command: 'page',
          action: 'content',
          data: { content: content.substring(0, 10000) }, // 限制长度
        }
      }

      case 'screenshot': {
        const path = args[1]
        const buffer = await this.pageController.screenshot({ path, fullPage: false })

        return {
          success: true,
          command: 'page',
          action: 'screenshot',
          data: {
            path: path || 'buffer',
            size: buffer.length,
          },
        }
      }

      case 'metrics': {
        const metrics = await this.pageController.getPerformanceMetrics()
        return {
          success: true,
          command: 'page',
          action: 'metrics',
          data: metrics,
        }
      }

      default:
        throw new Error(`Unknown page action: ${action}`)
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up SkillRouter...')
    this.hookManager.clearAll()

    // 清理 debugger 模块的 CDP session
    try { await this.scriptManager.close() } catch (e) { logger.warn('ScriptManager close failed:', e) }
    try { await this.runtimeInspector.close() } catch (e) { logger.warn('RuntimeInspector close failed:', e) }
    try { await this.debuggerManager.close() } catch (e) { logger.warn('DebuggerManager close failed:', e) }

    await this.collector.close()
    logger.info('SkillRouter cleaned up')
  }
}

// 内部辅助类型（避免复杂的 import）
type HookCreateOptionsCapture = {
  args?: boolean
  returnValue?: boolean
  stack?: boolean | number
  timing?: boolean
  thisContext?: boolean
}
type HookCreateOptionsCondition = {
  expression?: string
  maxCalls?: number
  minInterval?: number
  urlPattern?: string
}
type HookCreateOptionsLifecycle = {
  before?: string
  after?: string
  onError?: string
  onFinally?: string
  replace?: string
}
type HookCreateOptionsStore = {
  globalKey?: string
  maxRecords?: number
  console?: boolean
  consoleFormat?: 'full' | 'compact' | 'json'
}

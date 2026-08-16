/**
 * LLM服务 - 统一管理OpenAI和Anthropic API调用
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'fs/promises'
import type { LLMConfig } from '../types/index.js'
import { logger } from '../utils/logger.js'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number // 初始延迟（毫秒）
  maxDelay?: number // 最大延迟（毫秒）
  backoffMultiplier?: number // 退避倍数
}

export class LLMService {
  private config: LLMConfig
  private openai?: OpenAI
  private anthropic?: Anthropic
  private retryOptions: Required<RetryOptions> = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  }

  constructor(config: LLMConfig, retryOptions?: RetryOptions) {
    this.config = config
    if (retryOptions) {
      this.retryOptions = { ...this.retryOptions, ...retryOptions }
    }
    this.initClients()
  }

  /**
   * 初始化API客户端
   */
  private initClients(): void {
    if (this.config.provider === 'openai' && this.config.openai?.apiKey) {
      this.openai = new OpenAI({
        apiKey: this.config.openai.apiKey,
        baseURL: this.config.openai.baseURL,
      })
      logger.info('OpenAI client initialized')
    }

    if (this.config.provider === 'anthropic' && this.config.anthropic?.apiKey) {
      this.anthropic = new Anthropic({
        apiKey: this.config.anthropic.apiKey,
      })
      logger.info('Anthropic client initialized')
    }
  }

  /**
   * 调用LLM生成响应（带重试机制）
   */
  async chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const startTime = Date.now()

      try {
        if (this.config.provider === 'openai') {
          return await this.chatOpenAI(messages, options)
        } else if (this.config.provider === 'anthropic') {
          return await this.chatAnthropic(messages, options)
        } else {
          throw new Error(`Unsupported LLM provider: ${this.config.provider}`)
        }
      } finally {
        const duration = Date.now() - startTime
        logger.debug(`LLM call completed in ${duration}ms`)
      }
    })
  }

  /**
   * 分析图片（多模态LLM）
   * @param imageInput - Base64编码的图片 或 图片文件路径
   * @param prompt - 分析提示词
   * @param isFilePath - 是否为文件路径（默认false，即base64）
   */
  async analyzeImage(imageInput: string, prompt: string, isFilePath: boolean = false): Promise<string> {
    return this.withRetry(async () => {
      const startTime = Date.now()

      try {
        // ✅ 如果是文件路径，读取文件并转换为base64
        let imageBase64: string
        if (isFilePath) {
          logger.info(`📂 读取图片文件: ${imageInput}`)
          const imageBuffer = await readFile(imageInput)
          imageBase64 = imageBuffer.toString('base64')
          logger.info(`✅ 图片文件已读取 (${(imageBuffer.length / 1024).toFixed(2)} KB)`)
        } else {
          imageBase64 = imageInput
        }

        if (this.config.provider === 'openai') {
          // OpenAI Vision API
          if (!this.openai) {
            throw new Error('OpenAI client not initialized')
          }

          // 检查是否使用支持Vision的模型
          const model = this.config.openai?.model || 'gpt-4-vision-preview'
          const isVisionModel = model.includes('vision') || model.includes('gpt-4o') || model.includes('gpt-4-turbo')

          if (!isVisionModel) {
            logger.warn(`⚠️ 当前模型 ${model} 不支持图片分析，建议使用 gpt-4-vision-preview 或 gpt-4o`)
            throw new Error(
              `Model ${model} does not support image analysis. ` +
              'Please use gpt-4-vision-preview, gpt-4o, or gpt-4-turbo. ' +
              `Current config: OPENAI_MODEL=${model}, OPENAI_BASE_URL=${this.config.openai?.baseURL || 'default'}`,
            )
          }

          logger.info(`🖼️ Using OpenAI Vision model: ${model}`)

          const response = await this.openai.chat.completions.create({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${imageBase64}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 1000,
          })

          return response.choices[0]?.message?.content || ''
        } else if (this.config.provider === 'anthropic') {
          // Anthropic Claude Vision
          if (!this.anthropic) {
            throw new Error('Anthropic client not initialized')
          }

          const model = this.config.anthropic?.model || 'claude-3-opus-20240229'

          // 检查是否使用支持Vision的Claude模型
          const isVisionModel = model.includes('claude-3') || model.includes('claude-2.1')

          if (!isVisionModel) {
            logger.warn(`⚠️ 当前模型 ${model} 可能不支持图片分析，建议使用 claude-3-opus 或 claude-3-sonnet`)
          }

          logger.info(`🖼️ Using Anthropic Vision model: ${model}`)

          const response = await this.anthropic.messages.create({
            model,
            max_tokens: 1000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/png',
                      data: imageBase64,
                    },
                  },
                  {
                    type: 'text',
                    text: prompt,
                  },
                ],
              },
            ],
          })

          const textContent = response.content.find((c: any) => c.type === 'text') as any
          return textContent?.text || ''
        } else {
          throw new Error(`Unsupported LLM provider for image analysis: ${this.config.provider}`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('❌ Image analysis failed:', errorMessage)

        // 提供详细的错误信息和解决方案
        if (errorMessage.includes('does not support image analysis')) {
          logger.error('💡 解决方案:')
          logger.error('   1. 修改 .env 文件中的 OPENAI_MODEL 为 gpt-4-vision-preview 或 gpt-4o')
          logger.error('   2. 或者切换到 Anthropic: DEFAULT_LLM_PROVIDER=anthropic')
          logger.error('   3. 当前配置不支持AI验证码检测，将使用降级方案')
        }

        throw error
      } finally {
        const duration = Date.now() - startTime
        logger.debug(`Image analysis completed in ${duration}ms`)
      }
    })
  }

  /**
   * 重试包装器（指数退避）
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined
    let delay = this.retryOptions.initialDelay

    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // 判断是否应该重试
        if (!this.shouldRetry(lastError) || attempt === this.retryOptions.maxRetries) {
          throw lastError
        }

        logger.warn(`LLM call failed (attempt ${attempt + 1}/${this.retryOptions.maxRetries + 1}): ${lastError.message}`)
        logger.debug(`Retrying in ${delay}ms...`)

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delay))

        // 指数退避
        delay = Math.min(delay * this.retryOptions.backoffMultiplier, this.retryOptions.maxDelay)
      }
    }

    throw lastError || new Error('Unknown error')
  }

  /**
   * 判断错误是否应该重试
   */
  private shouldRetry(error: Error): boolean {
    const message = error.message.toLowerCase()

    // 可重试的错误类型
    const retryableErrors = [
      'rate limit',
      'timeout',
      'network',
      'econnreset',
      'enotfound',
      'etimedout',
      '429', // Too Many Requests
      '500', // Internal Server Error
      '502', // Bad Gateway
      '503', // Service Unavailable
      '504', // Gateway Timeout
    ]

    return retryableErrors.some(pattern => message.includes(pattern))
  }

  /**
   * OpenAI API调用
   */
  private async chatOpenAI(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized')
    }

    const response = await this.openai.chat.completions.create({
      model: this.config.openai?.model || 'gpt-4-turbo-preview',
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    })

    const choice = response.choices[0]
    if (!choice?.message?.content) {
      throw new Error('No response from OpenAI')
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
        : undefined,
    }
  }

  /**
   * Anthropic API调用
   */
  private async chatAnthropic(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized')
    }

    // 提取system消息
    const systemMessage = messages.find(msg => msg.role === 'system')
    const userMessages = messages.filter(msg => msg.role !== 'system')

    const response = await this.anthropic.messages.create({
      model: this.config.anthropic?.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options?.maxTokens ?? 4000,
      temperature: options?.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: userMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic')
    }

    return {
      content: content.text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    }
  }

  /**
   * 生成代码分析提示词 - 优化版
   *
   * 基于2024-2025最佳实践:
   * 1. Role-based prompting: 明确AI角色和专业领域
   * 2. Structured output: 使用严格的JSON Schema约束
   * 3. Few-shot learning: 提供示例输出
   * 4. Chain-of-Thought: 引导逐步分析
   * 5. Output constraints: 明确格式和必需字段
   *
   * 参考: Anthropic Claude Prompt Engineering Guide, OpenAI Best Practices
   */
  generateCodeAnalysisPrompt(code: string, focus: string): LLMMessage[] {
    const systemPrompt = `# Role
You are an expert JavaScript/TypeScript reverse engineer and code analyst with 10+ years of experience in:
- Static code analysis and AST manipulation
- Security vulnerability detection (OWASP Top 10)
- Framework and library identification (React, Vue, Angular, etc.)
- Code obfuscation and deobfuscation techniques
- Software architecture and design patterns

# Task
Perform deep static analysis on the provided JavaScript code to extract:
1. Technical stack (frameworks, bundlers, libraries)
2. Code structure (functions, classes, modules)
3. Business logic and data flow
4. Security vulnerabilities and risks
5. Code quality metrics

# Output Requirements
- Return ONLY valid JSON (no markdown, no explanations outside JSON)
- Follow the exact schema provided in the user message
- Use confidence scores (0.0-1.0) for uncertain detections
- Provide specific line numbers for security risks when possible
- Be precise and avoid hallucination

# Analysis Methodology
1. First, identify the code's purpose and main functionality
2. Then, detect frameworks and libraries by analyzing imports and API usage
3. Next, map out the code structure and call graph
4. Finally, perform security analysis using OWASP guidelines`

    const userPrompt = `# Analysis Focus
Primary focus: ${focus}

# Code to Analyze
\`\`\`javascript
${code.length > 5000 ? code.substring(0, 5000) + '\n\n// ... (code truncated for analysis)' : code}
\`\`\`

# Required Output Schema
Return a JSON object with this EXACT structure (all fields are required):

\`\`\`json
{
  "techStack": {
    "framework": "string | null (e.g., 'React 18.x', 'Vue 3.x', 'Angular 15.x')",
    "bundler": "string | null (e.g., 'Webpack 5', 'Vite', 'Rollup')",
    "libraries": ["array of library names with versions if detectable"],
    "confidence": 0.95
  },
  "structure": {
    "functions": [
      {
        "name": "function name",
        "type": "arrow | declaration | expression | async",
        "purpose": "brief description of what it does",
        "complexity": "low | medium | high",
        "lineNumber": 42       
      }
    ],
    "classes": [
      {
        "name": "class name",
        "purpose": "brief description",
        "methods": ["method1", "method2"],
        "lineNumber": 100
      }
    ],
    "imports": ["list of imported modules"],
    "exports": ["list of exported symbols"]
  },
  "businessLogic": {
    "mainFeatures": ["feature 1", "feature 2"],
    "dataFlow": "description of how data flows through the code",
    "apiEndpoints": ["list of API endpoints if any"],
    "stateManagement": "Redux | Vuex | Context API | none | unknown"
  },
  "securityRisks": [
    {
      "type": "XSS | SQL Injection | CSRF | Insecure Deserialization | etc.",
      "severity": "critical | high | medium | low",
      "description": "detailed description of the vulnerability",
      "location": "line 123 or function name",
      "cwe": "CWE-79",
      "recommendation": "how to fix it"
    }
  ],
  "qualityScore": 85,
  "qualityMetrics": {
    "maintainability": 80,
    "readability": 75,
    "testability": 70,
    "performance": 90
  },
  "summary": "2-3 sentence summary of the code's purpose and quality"
}
\`\`\`

# Example Output (for reference)
\`\`\`json
{
  "techStack": {
    "framework": "React 18.2",
    "bundler": "Webpack 5",
    "libraries": ["axios@1.4.0", "lodash@4.17.21"],
    "confidence": 0.92
  },
  "structure": {
    "functions": [
      {"name": "fetchUserData", "type": "async", "purpose": "Fetches user data from API", "complexity": "medium", "lineNumber": 15}
    ],
    "classes": [],
    "imports": ["react", "axios"],
    "exports": ["UserComponent"]
  },
  "businessLogic": {
    "mainFeatures": ["User authentication", "Data fetching"],
    "dataFlow": "User input -> API call -> State update -> UI render",
    "apiEndpoints": ["/api/users", "/api/auth"],
    "stateManagement": "React Hooks (useState, useEffect)"
  },
  "securityRisks": [
    {
      "type": "XSS",
      "severity": "high",
      "description": "User input directly inserted into innerHTML without sanitization",
      "location": "line 45",
      "cwe": "CWE-79",
      "recommendation": "Use textContent or DOMPurify.sanitize()"
    }
  ],
  "qualityScore": 72,
  "qualityMetrics": {
    "maintainability": 75,
    "readability": 80,
    "testability": 65,
    "performance": 70
  },
  "summary": "React component for user management with API integration. Contains XSS vulnerability and lacks error handling."
}
\`\`\`

Now analyze the provided code and return ONLY the JSON output (no additional text).`

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  /**
   * 生成加密检测提示词 - 优化版
   *
   * 专业领域: 密码学分析和加密算法识别
   * 优化技术:
   * 1. Domain expertise: 明确密码学专业知识要求
   * 2. Pattern recognition: 提供常见加密模式示例
   * 3. Security assessment: 基于NIST/OWASP标准评估
   * 4. Structured extraction: 精确提取加密参数
   */
  generateCryptoDetectionPrompt(code: string): LLMMessage[] {
    const systemPrompt = `# Role
You are a cryptography and security expert specializing in:
- Cryptographic algorithm identification (AES, RSA, DES, 3DES, Blowfish, etc.)
- JavaScript crypto library analysis (CryptoJS, JSEncrypt, Web Crypto API, crypto-js, forge, etc.)
- Security assessment based on NIST and OWASP standards
- Cryptographic parameter extraction (keys, IVs, modes, padding)
- Vulnerability detection in crypto implementations

# Expertise Areas
- Symmetric encryption: AES, DES, 3DES, Blowfish, ChaCha20
- Asymmetric encryption: RSA, ECC, ElGamal
- Hash functions: MD5, SHA-1, SHA-256, SHA-512, BLAKE2
- Encoding: Base64, Hex, URL encoding
- Key derivation: PBKDF2, scrypt, bcrypt
- Message authentication: HMAC, CMAC

# Task
Analyze the provided JavaScript code to:
1. Identify ALL cryptographic algorithms and their variants
2. Detect crypto libraries and their versions
3. Extract cryptographic parameters (keys, IVs, salts, modes, padding)
4. Assess security strength and identify vulnerabilities
5. Provide actionable security recommendations

# Analysis Standards
- Use NIST SP 800-175B for algorithm strength assessment
- Follow OWASP Cryptographic Storage Cheat Sheet
- Identify deprecated/weak algorithms (MD5, SHA-1, DES, RC4)
- Check for hardcoded keys and weak key generation`

    const userPrompt = `# Code to Analyze
\`\`\`javascript
${code.length > 4000 ? code.substring(0, 4000) + '\n\n// ... (code truncated)' : code}
\`\`\`

# Required Output Schema
Return ONLY valid JSON with this exact structure:

\`\`\`json
{
  "algorithms": [
    {
      "name": "string (e.g., 'AES-256-CBC', 'RSA-2048', 'SHA-256')",
      "type": "symmetric | asymmetric | hash | encoding | kdf | mac",
      "variant": "string (e.g., 'CBC', 'GCM', 'PKCS1', 'OAEP')",
      "confidence": 0.95,
      "location": {
        "line": 42,
        "function": "encryptData",
        "codeSnippet": "CryptoJS.AES.encrypt(...)"
      },
      "parameters": {
        "keySize": "128 | 192 | 256 | 1024 | 2048 | 4096 | null",
        "key": "hardcoded | derived | imported | unknown",
        "keyValue": "actual key if hardcoded (first 20 chars) or null",
        "iv": "present | absent | hardcoded | random",
        "mode": "CBC | GCM | ECB | CTR | CFB | OFB | null",
        "padding": "PKCS7 | PKCS5 | NoPadding | OAEP | PSS | null",
        "salt": "present | absent",
        "iterations": 10000
      },
      "usage": "encryption | decryption | hashing | signing | verification",
      "securityIssues": ["issue 1", "issue 2"]
    }
  ],
  "libraries": [
    {
      "name": "CryptoJS | crypto-js | JSEncrypt | forge | sjcl | Web Crypto API | node:crypto",
      "version": "4.1.1 | unknown",
      "confidence": 0.92,
      "detectionMethod": "import statement | CDN link | global object | API usage"
    }
  ],
  "securityAssessment": {
    "overallStrength": "strong | medium | weak | critical",
    "score": 75,
    "weakAlgorithms": [
      {
        "algorithm": "MD5",
        "reason": "Cryptographically broken, vulnerable to collision attacks",
        "severity": "critical | high | medium | low",
        "cwe": "CWE-327"
      }
    ],
    "hardcodedSecrets": [
      {
        "type": "encryption key | API key | password",
        "location": "line 15",
        "value": "first 10 chars...",
        "severity": "critical"
      }
    ],
    "vulnerabilities": [
      {
        "type": "ECB mode usage | Weak key | No IV | Predictable IV | etc.",
        "description": "detailed description",
        "impact": "data leakage | authentication bypass | etc.",
        "cvss": 7.5,
        "cwe": "CWE-326"
      }
    ],
    "recommendations": [
      {
        "priority": "critical | high | medium | low",
        "issue": "what's wrong",
        "solution": "how to fix it",
        "example": "code example if applicable"
      }
    ]
  },
  "summary": "Brief summary of crypto usage and main security concerns"
}
\`\`\`

# Example Output
\`\`\`json
{
  "algorithms": [
    {
      "name": "AES-256-CBC",
      "type": "symmetric",
      "variant": "CBC",
      "confidence": 0.98,
      "location": {"line": 23, "function": "encryptPassword", "codeSnippet": "CryptoJS.AES.encrypt(data, key)"},
      "parameters": {
        "keySize": "256",
        "key": "hardcoded",
        "keyValue": "mySecretKey12345...",
        "iv": "absent",
        "mode": "CBC",
        "padding": "PKCS7",
        "salt": "absent",
        "iterations": null
      },
      "usage": "encryption",
      "securityIssues": ["Hardcoded key", "No IV specified (using default)"]
    }
  ],
  "libraries": [
    {"name": "CryptoJS", "version": "4.1.1", "confidence": 0.95, "detectionMethod": "CDN link"}
  ],
  "securityAssessment": {
    "overallStrength": "weak",
    "score": 35,
    "weakAlgorithms": [],
    "hardcodedSecrets": [
      {"type": "encryption key", "location": "line 10", "value": "mySecretKe...", "severity": "critical"}
    ],
    "vulnerabilities": [
      {
        "type": "Hardcoded encryption key",
        "description": "Encryption key is hardcoded in source code",
        "impact": "Anyone with access to code can decrypt all data",
        "cvss": 9.1,
        "cwe": "CWE-321"
      }
    ],
    "recommendations": [
      {
        "priority": "critical",
        "issue": "Hardcoded encryption key",
        "solution": "Use environment variables or secure key management service (KMS)",
        "example": "const key = process.env.ENCRYPTION_KEY;"
      }
    ]
  },
  "summary": "Uses AES-256-CBC with CryptoJS but has critical security flaw: hardcoded encryption key. Immediate remediation required."
}
\`\`\`

Now analyze the code and return ONLY the JSON output.`

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  /**
   * 生成反混淆提示词 - 优化版
   *
   * 专业领域: JavaScript反混淆和代码还原
   * 优化技术:
   * 1. Pattern recognition: 识别常见混淆工具特征
   * 2. Semantic understanding: 理解混淆后的真实逻辑
   * 3. Naming conventions: 基于上下文推断有意义的命名
   * 4. Step-by-step reasoning: Chain-of-Thought分析
   */
  generateDeobfuscationPrompt(code: string): LLMMessage[] {
    const systemPrompt = `# Role
You are an expert JavaScript reverse engineer specializing in:
- Code deobfuscation and obfuscation pattern recognition
- Obfuscator tool identification (javascript-obfuscator, UglifyJS, Terser, Webpack, etc.)
- Control flow analysis and simplification
- Semantic code understanding and variable naming
- AST manipulation and code transformation

# Known Obfuscation Techniques
1. **String Array Obfuscation**: Strings stored in arrays with index-based access
2. **Control Flow Flattening**: Switch-case state machines replacing normal control flow
3. **Dead Code Injection**: Unreachable code blocks (if(false){...})
4. **Opaque Predicates**: Always-true/false conditions (if(5>3){...})
5. **Variable Name Mangling**: _0x1234, _0xabcd style names
6. **Function Inlining/Outlining**: Moving code between functions
7. **Encoding**: Hex, Unicode, Base64 encoded strings
8. **VM Protection**: Custom virtual machine interpreters
9. **Self-Defending**: Anti-debugging and anti-tampering code

# Task
Analyze the obfuscated code to:
1. Identify the obfuscation type and tool used
2. Understand the actual program logic
3. Suggest meaningful variable and function names
4. Provide deobfuscated code if possible
5. Explain the deobfuscation process step-by-step

# Constraints
- Preserve exact program functionality
- Do NOT guess or hallucinate functionality
- If uncertain, mark with confidence scores
- Provide partial results if full deobfuscation is not possible`

    const userPrompt = `# Obfuscated Code
\`\`\`javascript
${code.length > 3000 ? code.substring(0, 3000) + '\n\n// ... (code truncated)' : code}
\`\`\`

# Required Output Schema
Return ONLY valid JSON:

\`\`\`json
{
  "obfuscationType": {
    "primary": "string-array | control-flow-flattening | vm-protection | mixed | unknown",
    "techniques": ["technique 1", "technique 2"],
    "tool": "javascript-obfuscator | webpack | uglify | terser | custom | unknown",
    "toolVersion": "string or null",
    "confidence": 0.85
  },
  "analysis": {
    "codeStructure": "description of overall structure",
    "mainLogic": "what the code actually does",
    "keyFunctions": [
      {
        "obfuscatedName": "_0x1234",
        "purpose": "what it does",
        "confidence": 0.9
      }
    ],
    "dataFlow": "how data flows through the code",
    "externalDependencies": ["list of external APIs or libraries used"]
  },
  "suggestions": {
    "variableRenames": {
      "_0x1234": {"suggested": "userId", "reason": "stores user ID from API", "confidence": 0.95},
      "_0x5678": {"suggested": "apiKey", "reason": "used in authentication header", "confidence": 0.88}
    },
    "functionRenames": {
      "_0xabcd": {"suggested": "encryptPassword", "reason": "calls CryptoJS.AES.encrypt", "confidence": 0.92}
    },
    "simplifications": [
      {
        "type": "remove dead code | unflatten control flow | decode strings",
        "description": "what to simplify",
        "impact": "high | medium | low"
      }
    ]
  },
  "deobfuscationSteps": [
    "Step 1: Extract string array at line 1-5",
    "Step 2: Replace string array calls with actual strings",
    "Step 3: Simplify control flow in function _0x1234",
    "Step 4: Rename variables based on usage context"
  ],
  "deobfuscatedCode": "string or null (full deobfuscated code if possible)",
  "partialResults": {
    "stringArrayDecoded": {"_0x0": "hello", "_0x1": "world"},
    "decodedFunctions": [
      {
        "original": "function _0x1234(){...}",
        "deobfuscated": "function getUserData(){...}",
        "confidence": 0.85
      }
    ]
  },
  "limitations": ["what couldn't be deobfuscated and why"],
  "summary": "Brief summary of obfuscation and deobfuscation results"
}
\`\`\`

# Example Output
\`\`\`json
{
  "obfuscationType": {
    "primary": "string-array",
    "techniques": ["string-array", "variable-mangling", "dead-code-injection"],
    "tool": "javascript-obfuscator",
    "toolVersion": "4.0.0",
    "confidence": 0.92
  },
  "analysis": {
    "codeStructure": "IIFE with string array at top, followed by main logic",
    "mainLogic": "Fetches user data from API and encrypts password before sending",
    "keyFunctions": [
      {"obfuscatedName": "_0x1a2b", "purpose": "Decodes strings from array", "confidence": 0.98},
      {"obfuscatedName": "_0x3c4d", "purpose": "Makes API request", "confidence": 0.95}
    ],
    "dataFlow": "User input -> validation -> encryption -> API call -> response handling",
    "externalDependencies": ["fetch API", "CryptoJS"]
  },
  "suggestions": {
    "variableRenames": {
      "_0x1a2b": {"suggested": "decodeString", "reason": "accesses string array with index", "confidence": 0.98},
      "_0x3c4d": {"suggested": "fetchUserData", "reason": "calls fetch() with /api/users", "confidence": 0.95}
    },
    "functionRenames": {
      "_0x5e6f": {"suggested": "encryptPassword", "reason": "uses CryptoJS.AES.encrypt", "confidence": 0.92}
    },
    "simplifications": [
      {"type": "decode strings", "description": "Replace all string array calls with actual strings", "impact": "high"},
      {"type": "remove dead code", "description": "Remove if(false) blocks at lines 45-60", "impact": "medium"}
    ]
  },
  "deobfuscationSteps": [
    "Step 1: Identified string array: ['hello', 'world', 'api', 'user']",
    "Step 2: Replaced _0x1a2b(0) with 'hello', _0x1a2b(1) with 'world'",
    "Step 3: Removed dead code blocks",
    "Step 4: Renamed functions based on their actual purpose"
  ],
  "deobfuscatedCode": "// Partially deobfuscated\nfunction fetchUserData(userId) {\n  const apiUrl = 'https://api.example.com/users/' + userId;\n  return fetch(apiUrl);\n}",
  "partialResults": {
    "stringArrayDecoded": {"_0x0": "hello", "_0x1": "world", "_0x2": "api"},
    "decodedFunctions": [
      {"original": "function _0x3c4d(_0x1){...}", "deobfuscated": "function fetchUserData(userId){...}", "confidence": 0.95}
    ]
  },
  "limitations": ["VM-protected section at lines 100-200 could not be fully deobfuscated", "Some variable names are uncertain due to lack of context"],
  "summary": "Code uses javascript-obfuscator with string array and dead code injection. Successfully decoded 80% of the code. Main functionality is user data fetching with password encryption."
}
\`\`\`

Now analyze the obfuscated code and return ONLY the JSON output.`

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  /**
   * 生成污点分析提示词 - 新增
   *
   * 专业领域: 数据流分析和安全漏洞检测
   * 用于辅助污点分析,识别从Source到Sink的危险数据流
   */
  generateTaintAnalysisPrompt(code: string, sources: string[], sinks: string[]): LLMMessage[] {
    const systemPrompt = `# Role
You are a security researcher specializing in:
- Taint analysis and data flow tracking
- OWASP Top 10 vulnerability detection
- Source-Sink-Sanitizer analysis
- XSS, SQL Injection, Command Injection detection
- Secure coding practices

# Task
Analyze data flow from sources (user input) to sinks (dangerous operations) to identify security vulnerabilities.

# Methodology
1. Identify all data sources (user input, network, storage)
2. Track data flow through variables, functions, and operations
3. Identify sanitizers (validation, encoding, escaping)
4. Detect dangerous sinks (eval, innerHTML, SQL queries)
5. Report vulnerable paths where tainted data reaches sinks without sanitization`

    const userPrompt = `# Code to Analyze
\`\`\`javascript
${code.length > 4000 ? code.substring(0, 4000) + '\n\n// ... (truncated)' : code}
\`\`\`

# Detected Sources
${sources.map(s => `- ${s}`).join('\n')}

# Detected Sinks
${sinks.map(s => `- ${s}`).join('\n')}

# Required Output
Return JSON with taint paths and vulnerabilities:

\`\`\`json
{
  "taintPaths": [
    {
      "source": {"type": "user_input", "location": "line 10", "variable": "userInput"},
      "sink": {"type": "eval", "location": "line 50", "variable": "code"},
      "path": ["userInput -> processData -> sanitize? -> code -> eval"],
      "sanitized": false,
      "vulnerability": "Code Injection",
      "severity": "critical",
      "cwe": "CWE-94"
    }
  ],
  "summary": "Found X vulnerable paths"
}
\`\`\`

Return ONLY the JSON output.`

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }
}


/** Controlled installation catalog consumed by the ant-sword installer. */

export type SourcePolicy = 'auto' | 'domestic-first' | 'official-first'
export type InstallerPlatform = 'win32' | 'linux'
export type InstallerArchitecture = 'x64' | 'arm64'
export type InstallStepPhase = 'downloading' | 'verifying' | 'installing' | 'configuring'

export interface CommandProbe {
  kind: 'command'
  command: string
  args: readonly string[]
}

export interface HttpProbe {
  kind: 'http'
  url: string
}

export type ComponentProbe = CommandProbe | HttpProbe

export interface CommandInstallStep {
  kind: 'command'
  phase: Exclude<InstallStepPhase, 'downloading' | 'verifying'>
  executable: string
  args: readonly string[]
  timeoutMs: number
}

export interface DownloadInstallStep {
  kind: 'download'
  phase: 'downloading'
  sources: readonly InstallSource[]
  targetName: string
  sha256?: string
  officialDigest?: { apiUrl: string; assetName: string }
  timeoutMs: number
}

export interface ExternalActionStep {
  kind: 'external-action'
  phase: 'configuring'
  message: string
}

export type InstallStep = CommandInstallStep | DownloadInstallStep | ExternalActionStep

export interface InstallSource {
  id: string
  region: 'domestic' | 'official'
  url: string
}

export interface InstallVariant {
  platform: InstallerPlatform
  architectures: readonly InstallerArchitecture[]
  steps: readonly InstallStep[]
}

export interface InstallComponent {
  id: string
  label: string
  version: string
  dependencies: readonly string[]
  probe: ComponentProbe
  variants: readonly InstallVariant[]
  installDirectory?: string
  restartRequired?: boolean
}

const COMMAND_TIMEOUT = 10 * 60_000

function npmComponent(id: string, label: string, packageSpec: string, command: string): InstallComponent {
  return {
    id,
    label,
    version: packageSpec.slice(packageSpec.lastIndexOf('@') + 1),
    dependencies: ['node'],
    probe: { kind: 'command', command, args: ['--version'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'npm', args: ['install', '--global', packageSpec, '--registry', 'https://registry.npmjs.org'], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'npm', args: ['install', '--global', packageSpec, '--registry', 'https://registry.npmjs.org'], timeoutMs: COMMAND_TIMEOUT }] },
    ],
  }
}

function pipxComponent(id: string, label: string, packageSpec: string, command: string): InstallComponent {
  return {
    id,
    label,
    version: packageSpec.includes('==') ? (packageSpec.split('==').at(1) ?? 'pinned-commit') : 'pinned-commit',
    dependencies: ['python', 'pipx'],
    probe: { kind: 'command', command, args: ['--help'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'pipx', args: ['install', '--force', packageSpec], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'pipx', args: ['install', '--force', packageSpec], timeoutMs: COMMAND_TIMEOUT }] },
    ],
  }
}

export const INSTALL_CATALOG: readonly InstallComponent[] = [
  {
    id: 'git', label: 'Git', version: 'system', dependencies: [], probe: { kind: 'command', command: 'git', args: ['--version'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'winget', args: ['install', '--exact', '--id', 'Git.Git', '--accept-package-agreements', '--accept-source-agreements'], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'apt-get', args: ['install', '-y', 'git'], timeoutMs: COMMAND_TIMEOUT }] },
    ],
  },
  {
    id: 'python', label: 'Python', version: '3.12', dependencies: [], probe: { kind: 'command', command: 'python', args: ['--version'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'winget', args: ['install', '--exact', '--id', 'Python.Python.3.12', '--accept-package-agreements', '--accept-source-agreements'], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'apt-get', args: ['install', '-y', 'python3', 'python3-pip', 'python3-venv'], timeoutMs: COMMAND_TIMEOUT }] },
    ],
  },
  {
    id: 'pipx', label: 'pipx', version: '1.16.5', dependencies: ['python'], probe: { kind: 'command', command: 'pipx', args: ['--version'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'python', args: ['-m', 'pip', 'install', '--user', 'pipx==1.16.5'], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'python3', args: ['-m', 'pip', 'install', '--user', 'pipx==1.16.5'], timeoutMs: COMMAND_TIMEOUT }] },
    ],
  },
  {
    id: 'node', label: 'Node.js', version: '22', dependencies: [], probe: { kind: 'command', command: 'node', args: ['--version'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'winget', args: ['install', '--exact', '--id', 'OpenJS.NodeJS.LTS', '--accept-package-agreements', '--accept-source-agreements'], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'external-action', phase: 'configuring', message: 'Install Node.js 22 LTS with the distribution or vendor package manager.' }] },
    ],
  },
  {
    id: 'java', label: 'Java Runtime', version: '21', dependencies: [], probe: { kind: 'command', command: 'java', args: ['--version'] },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'winget', args: ['install', '--exact', '--id', 'EclipseAdoptium.Temurin.21.JDK', '--accept-package-agreements', '--accept-source-agreements'], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'command', phase: 'installing', executable: 'apt-get', args: ['install', '-y', 'openjdk-21-jdk'], timeoutMs: COMMAND_TIMEOUT }] },
    ],
  },
  npmComponent('jshookmcp', 'JS Hook MCP', '@jshookmcp/jshook@0.3.4', 'jshook'),
  npmComponent('reqable-mcp', 'Reqable MCP', 'reqable-mcp-server@1.0.1', 'reqable-mcp-server'),
  pipxComponent('idalib-mcp', 'IDA Pro MCP', 'git+https://github.com/mrexodia/ida-pro-mcp.git@f82e6e2517a161b77e738951c3071cd446480ba0', 'ida-pro-mcp'),
  {
    id: 'ghidra', label: 'Ghidra', version: '11.4.2', dependencies: ['java'], probe: { kind: 'command', command: 'analyzeHeadless', args: ['-help'] },
    installDirectory: 'ghidra',
    variants: [
      {
        platform: 'win32', architectures: ['x64', 'arm64'], steps: [{
          kind: 'download', phase: 'downloading', targetName: 'ghidra.zip', timeoutMs: COMMAND_TIMEOUT,
          officialDigest: { apiUrl: 'https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_11.4.2_build', assetName: 'ghidra_11.4.2_PUBLIC_20250826.zip' },
          sources: [
            { id: 'ghproxy', region: 'domestic', url: 'https://ghproxy.net/https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip' },
            { id: 'github', region: 'official', url: 'https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip' },
          ],
        }],
      },
      {
        platform: 'linux', architectures: ['x64', 'arm64'], steps: [{
          kind: 'download', phase: 'downloading', targetName: 'ghidra.zip', timeoutMs: COMMAND_TIMEOUT,
          officialDigest: { apiUrl: 'https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_11.4.2_build', assetName: 'ghidra_11.4.2_PUBLIC_20250826.zip' },
          sources: [{ id: 'github', region: 'official', url: 'https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip' }],
        }],
      },
    ],
  },
  {
    id: 'ghidra-mcp', label: 'Ghidra MCP', version: 'controlled-release', dependencies: ['ghidra', 'git', 'python'],
    probe: { kind: 'http', url: 'http://127.0.0.1:8765/mcp' },
    variants: [
      { platform: 'win32', architectures: ['x64', 'arm64'], steps: [{ kind: 'external-action', phase: 'configuring', message: 'Install the pinned GhidraMCP extension in Ghidra and open a project to start port 8765.' }] },
      { platform: 'linux', architectures: ['x64', 'arm64'], steps: [{ kind: 'external-action', phase: 'configuring', message: 'Install the pinned GhidraMCP extension in Ghidra and open a project to start port 8765.' }] },
    ],
    restartRequired: true,
  },
]

export function catalogById(catalog: readonly InstallComponent[] = INSTALL_CATALOG): ReadonlyMap<string, InstallComponent> {
  const result = new Map<string, InstallComponent>()
  for (const component of catalog) {
    if (result.has(component.id)) throw new TypeError(`duplicate installer component "${component.id}"`)
    result.set(component.id, component)
  }
  return result
}

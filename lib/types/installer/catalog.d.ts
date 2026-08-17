/** Controlled installation catalog consumed by the ant-sword installer. */
export type SourcePolicy = 'auto' | 'domestic-first' | 'official-first';
export type InstallerPlatform = 'win32' | 'linux';
export type InstallerArchitecture = 'x64' | 'arm64';
export type InstallStepPhase = 'downloading' | 'verifying' | 'installing' | 'configuring';
export interface CommandProbe {
    kind: 'command';
    command: string;
    args: readonly string[];
}
export interface HttpProbe {
    kind: 'http';
    url: string;
}
export type ComponentProbe = CommandProbe | HttpProbe;
export interface CommandInstallStep {
    kind: 'command';
    phase: Exclude<InstallStepPhase, 'downloading' | 'verifying'>;
    executable: string;
    args: readonly string[];
    timeoutMs: number;
}
export interface DownloadInstallStep {
    kind: 'download';
    phase: 'downloading';
    sources: readonly InstallSource[];
    targetName: string;
    sha256?: string;
    officialDigest?: {
        apiUrl: string;
        assetName: string;
    };
    timeoutMs: number;
}
export interface ExternalActionStep {
    kind: 'external-action';
    phase: 'configuring';
    message: string;
}
export type InstallStep = CommandInstallStep | DownloadInstallStep | ExternalActionStep;
export interface InstallSource {
    id: string;
    region: 'domestic' | 'official';
    url: string;
}
export interface InstallVariant {
    platform: InstallerPlatform;
    architectures: readonly InstallerArchitecture[];
    steps: readonly InstallStep[];
}
export interface InstallComponent {
    id: string;
    label: string;
    version: string;
    dependencies: readonly string[];
    probe: ComponentProbe;
    variants: readonly InstallVariant[];
    installDirectory?: string;
    restartRequired?: boolean;
}
export declare const INSTALL_CATALOG: readonly InstallComponent[];
export declare function catalogById(catalog?: readonly InstallComponent[]): ReadonlyMap<string, InstallComponent>;
//# sourceMappingURL=catalog.d.ts.map
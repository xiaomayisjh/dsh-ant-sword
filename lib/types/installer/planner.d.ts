/** Dependency planning and source ordering for controlled installations. */
import type { InstallComponent, InstallerArchitecture, InstallerPlatform, InstallSource, InstallVariant, SourcePolicy } from './catalog.ts';
export interface PlannedComponent {
    component: InstallComponent;
    variant: InstallVariant;
}
export declare function orderSources(sources: readonly InstallSource[], policy: SourcePolicy): InstallSource[];
export declare function planInstallation(componentId: string, platform: InstallerPlatform, architecture: InstallerArchitecture, catalog: readonly InstallComponent[]): PlannedComponent[];
//# sourceMappingURL=planner.d.ts.map
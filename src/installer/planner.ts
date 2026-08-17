/** Dependency planning and source ordering for controlled installations. */

import { catalogById } from './catalog.ts'
import type { InstallComponent, InstallerArchitecture, InstallerPlatform, InstallSource, InstallVariant, SourcePolicy } from './catalog.ts'

export interface PlannedComponent {
  component: InstallComponent
  variant: InstallVariant
}

export function orderSources(sources: readonly InstallSource[], policy: SourcePolicy): InstallSource[] {
  if (policy === 'official-first') return [...sources].sort((a, b) => Number(a.region === 'domestic') - Number(b.region === 'domestic'))
  if (policy === 'domestic-first') return [...sources].sort((a, b) => Number(a.region === 'official') - Number(b.region === 'official'))
  return [...sources].sort((a, b) => Number(a.region === 'official') - Number(b.region === 'official'))
}

export function planInstallation(
  componentId: string,
  platform: InstallerPlatform,
  architecture: InstallerArchitecture,
  catalog: readonly InstallComponent[],
): PlannedComponent[] {
  const entries = catalogById(catalog)
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const result: PlannedComponent[] = []

  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new TypeError(`installer dependency cycle at "${id}"`)
    const component = entries.get(id)
    if (component === undefined) throw new TypeError(`unknown installer component "${id}"`)
    const variant = component.variants.find(candidate => candidate.platform === platform && candidate.architectures.includes(architecture))
    if (variant === undefined) throw new TypeError(`component "${id}" does not support ${platform}/${architecture}`)
    visiting.add(id)
    for (const dependency of component.dependencies) visit(dependency)
    visiting.delete(id)
    visited.add(id)
    result.push({ component, variant })
  }

  visit(componentId)
  return result
}

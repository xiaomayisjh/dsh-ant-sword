/** Dependency planning and source ordering for controlled installations. */
import { catalogById } from "./catalog.js";
export function orderSources(sources, policy) {
    if (policy === 'official-first')
        return [...sources].sort((a, b) => Number(a.region === 'domestic') - Number(b.region === 'domestic'));
    if (policy === 'domestic-first')
        return [...sources].sort((a, b) => Number(a.region === 'official') - Number(b.region === 'official'));
    return [...sources].sort((a, b) => Number(a.region === 'official') - Number(b.region === 'official'));
}
export function planInstallation(componentId, platform, architecture, catalog) {
    const entries = catalogById(catalog);
    const visiting = new Set();
    const visited = new Set();
    const result = [];
    const visit = (id) => {
        if (visited.has(id))
            return;
        if (visiting.has(id))
            throw new TypeError(`installer dependency cycle at "${id}"`);
        const component = entries.get(id);
        if (component === undefined)
            throw new TypeError(`unknown installer component "${id}"`);
        const variant = component.variants.find(candidate => candidate.platform === platform && candidate.architectures.includes(architecture));
        if (variant === undefined)
            throw new TypeError(`component "${id}" does not support ${platform}/${architecture}`);
        visiting.add(id);
        for (const dependency of component.dependencies)
            visit(dependency);
        visiting.delete(id);
        visited.add(id);
        result.push({ component, variant });
    };
    visit(componentId);
    return result;
}
//# sourceMappingURL=planner.js.map
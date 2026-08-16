//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-ant-sword-harness`.
* @module @deepseek-ai/dsh-ant-sword-harness/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-ant-sword-harness";
/** Cordis companion plugin name. */
const name = "ant-sword-harness-invariant";
/** Service required before the companion can register. */
const inject = ["invariants"];
/**
* No runtime invariant: the bundle's composition contract (its cordis.patch.yml
* rows and the bundled skill catalog) is asserted statically by the package's
* REAL-composition tests, and the rewind capability's durable checkpoint
* relation is owned and validated by the storage-domain medium at the durable
* boundary; this package mounts no long-lived in-tree relation of its own to audit.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };

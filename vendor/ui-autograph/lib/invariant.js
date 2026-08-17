//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-autograph`.
* @module @deepseek-ai/dsh-client-ui-autograph/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-client-ui-autograph";
/** Cordis companion plugin name. */
const name = "client-ui-autograph-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: a single slot registration whose disposal is proven
* by the HMR-safety spec — the plugin owns no store (state arrives on the
* board projection), emits no cordis events, and holds no cross-plugin
* mutable state.
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

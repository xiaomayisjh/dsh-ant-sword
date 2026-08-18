// src/invariant.ts
var PACKAGE_NAME = "@deepseek-ai/dsh-ant-sword-harness";
var name = "ant-sword-harness-invariant";
var inject = ["invariants"];
var install = () => {
};
var apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export {
  apply,
  inject,
  name
};

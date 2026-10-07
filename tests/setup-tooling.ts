// Only the Node harnesses use native createRequire/import for TypeScript fixtures.
// DOM tests keep their own realms and use Vitest's normal transform pipeline.
if (typeof window === "undefined") {
  const [{ register: registerCommonJs }, { register: registerEsm }] = await Promise.all([
    import("tsx/cjs/api"), import("tsx/esm/api")
  ]);
  registerCommonJs();
  registerEsm();
}

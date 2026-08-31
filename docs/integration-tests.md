# Integration Test Policy

Default verification is local, isolated, and credential-free:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run test:conformance
npm run test:reference
npm run test:browser-checksum
npm run test:adoption-evidence
npm run test:integration
npm run smoke:exports
```

The default conformance suite executes the complete catalog through in-memory S3 and tus representatives and temporary-directory NAS gateways. The reference gate separately uses loopback HTTP, durable JSON resume state, and temporary storage. The adoption-evidence gate compares three frozen candidates and validates 150 raw controlled trials. None of these paths needs cloud credentials, a real tus server, a bucket, or a mounted NAS path.

`npm run test:integration` is safe by default. Without exact opt-in and a driver module, it prints one skip and performs no target import, network request, or storage mutation. Endpoint reachability and filesystem accessibility are no longer reported as a pass because they do not prove recovery or integrity behavior.

## Explicit Real-Target Qualification

Use the same versioned catalog against a deployment-specific driver:

```bash
LII_CONFORMANCE_OPT_IN=1 \
LII_CONFORMANCE_DRIVER_MODULE=./private/target-driver.mjs \
npm run qualify:transport -- \
  --output benchmarks/results/private-target-report.json
```

Both environment variables are required. The opt-in value must be exactly `1`. Partial configuration skips without importing the driver. A configured run passes only when the resulting report is complete and conformant; failed, skipped, or unproven behavior cannot be promoted by a successful endpoint preflight.

The driver must export `createTarget()` or a target value matching `TransportConformanceTarget` from `large-image-ingest/conformance`. Its profile must use `targetClass: "real-deployment"` and non-sensitive category values.

## Driver Ownership

The operator-owned driver is responsible for:

- provisioning a dedicated test bucket, prefix, directory, or tus namespace;
- keeping credentials, endpoints, upload URLs, object keys, and mount paths outside report fields;
- setting cost, quota, timeout, lifecycle, and retention limits;
- implementing provider-specific reconciliation and independent stored-object verification;
- cleaning incomplete multipart uploads, tus resources, NAS staging data, and locks on success or failure;
- reporting abandoned-resource counts and a safe opaque cleanup reference when automatic cleanup cannot finish.

Do not point a qualification driver at a production namespace containing customer originals. Provision an isolated namespace whose contents may be overwritten or removed by the driver.

## Safe Output

CLI output is deliberately categorical. It may contain transport category, pass/fail/skip counts, conformance status, and whether a report was written. It must not echo:

- the driver module path;
- credentials, authorization headers, or presigned URLs;
- endpoints, buckets, object keys, filesystem or mount paths;
- customer metadata, full manifests, recovery records, raw receipts, or checksum values;
- raw provider or driver exceptions.

The machine-readable report uses a bounded schema and safe identifiers. Store private real-target reports according to the environment's security and retention policy; do not commit them by default.

## Promotion Criteria

A deployment may be described as qualified only for the exact driver version, library version, provider or mount configuration, and report environment that were exercised. Re-run qualification when relevant provider behavior, gateway code, mount options, lifecycle policies, or the conformance catalog changes. Representative evidence demonstrates library regression behavior; it is not provider certification.

See [Official Transport Conformance](transport-conformance.md) for shared invariants and report interpretation.

# Workflow conformance

`WORKFLOW_CONFORMANCE_CATALOG` is the versioned, provider-neutral catalog for the verified-ingest facade. It covers authority order, source mismatch before mutation, restart authority, verification failure, evidence acknowledgement reconciliation, preservation finalization idempotency, and restricted-value disclosure.

The default tests are credential-free representative evidence. A passing representative report is not real-provider qualification. Applications can run the same public `runWorkflowConformance()` contract against an explicitly opted-in deployment target and must label that report `real-deployment`.

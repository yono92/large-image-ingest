# Validation Guide

1. Run `npm run example:minimal`: expect completed transfer and verified stored bytes.
2. Run `npm run example:verified`: expect evidence_persisted and reloadable records.
3. Run focused onboarding/observation tests: recovery, corruption, checkpoint/evidence conflicts and accurate counting.
4. Copy docs/adoption-observations.template.json into ignored .local-adoption/ and run `npm run adoption:report -- --input .local-adoption/observations.json`: actual adoption unknown.
5. Run `npm run test:onboarding-package`: execute both shipped examples in a fresh consumer.
6. Run typecheck, npm test and build without cloud credentials.

External evaluation follows docs/adoption-validation.md with real participants. Automation does not count as an external observation.

---
description: Run Impeccable skills and detector
---

1. Make sure dependencies are installed: `npm install`
2. Initialize or refresh the Impeccable skill build:
   ```bash
   npx impeccable skills install
   ```
3. Verify the skill status (repo already has the npm script):
   ```bash
   npm run impeccable:skills
   ```
4. Run the detector over the `app/` directory before shipping UI changes:
   ```bash
   npm run impeccable:detect
   ```
5. For CI pipelines, use the JSON output to gate PRs:
   ```bash
   npx impeccable detect app/ --format json
   ```

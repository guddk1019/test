# Branch Protection Guide

Apply these settings to `main` (or your default protected branch).

## Required settings
1. `Require a pull request before merging`: Enabled
2. `Require approvals`: 1 or more
3. `Dismiss stale pull request approvals when new commits are pushed`: Enabled
4. `Require status checks to pass before merging`: Enabled
5. `Required status checks`:
   - `test` (from `.github/workflows/ci.yml`)
6. `Require branches to be up to date before merging`: Enabled
7. `Require conversation resolution before merging`: Enabled
8. `Do not allow bypassing the above settings`: Enabled (recommended)

## Optional hardening
1. `Require signed commits`
2. `Restrict who can push to matching branches`
3. `Require linear history`

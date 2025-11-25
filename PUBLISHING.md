# Publishing Checklist

This document outlines the steps to publish `suspense-async-store` to npm.

## Pre-Publishing Checklist

### ✅ Completed

- [x] Package.json configured with proper exports, files, and metadata
- [x] LICENSE file (ISC)
- [x] README.md with comprehensive documentation
- [x] CHANGELOG.md created
- [x] TypeScript configuration and type definitions
- [x] Build configuration (tsup) for CJS, ESM, and types
- [x] Test suite with 100% coverage
- [x] ESLint and Prettier configuration
- [x] Pre-commit hooks with Husky
- [x] `.npmignore` configured
- [x] `files` field in package.json to control published files
- [x] `prepublishOnly` script to ensure quality before publish
- [x] `sideEffects: false` for tree-shaking
- [x] `engines` field for Node version requirement
- [x] Comprehensive keywords for discoverability

### ⚠️ Before Publishing

1. **Update Repository URL**:
   - Update the `repository.url` in `package.json` to your actual GitHub repository
   - Update `bugs.url` and `homepage` accordingly

2. **Verify Package Name Availability**:

   ```bash
   npm view suspense-async-store
   ```

   If it returns 404, the name is available.

3. **Run Verification**:

   ```bash
   npm run verify
   ```

   This runs type-check, lint, tests, and build.

4. **Test Package Locally** (optional):

   ```bash
   npm pack
   npm install ./suspense-async-store-0.1.0.tgz
   ```

5. **Login to npm**:
   ```bash
   npm login
   ```

## Publishing Steps

1. **Ensure you're on the correct branch** (usually `main` or `master`)

2. **Run the verification script**:

   ```bash
   npm run verify
   ```

3. **Publish to npm**:

   ```bash
   npm publish
   ```

   For first-time publish (public package):

   ```bash
   npm publish --access public
   ```

4. **Tag the release** (if using Git):
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

## Post-Publishing

1. Create a GitHub release with the CHANGELOG notes
2. Share on social media/communities if desired
3. Monitor for issues and feedback

## Package Contents

The published package will include:

- `dist/` - All built files (CJS, ESM, TypeScript definitions)
- `README.md` - Documentation
- `LICENSE` - ISC License
- `package.json` - Package metadata

Total package size: ~6.3 KB (unpacked: ~40.6 KB)

## Version Management

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.2.0): New features, backward compatible
- **PATCH** (0.1.1): Bug fixes, backward compatible

Update `CHANGELOG.md` before each release.

# NPM Package Release Setup

This document outlines the setup required for automatic versioning and publishing of the npm package using GitHub Actions and semantic-release.

## Required GitHub Secrets

You need to configure the following secrets in your GitHub repository:

### 1. NPM_TOKEN

- **Purpose**: Authenticates with npm registry for publishing packages
- **How to get it**:
  1. Go to [npmjs.com](https://www.npmjs.com) and log in
  2. Click on your profile → Access Tokens
  3. Generate New Token (Classic)
  4. Select "Automation" type for CI/CD
  5. Copy the token
- **How to set it**:
  1. Go to your GitHub repository
  2. Settings → Secrets and variables → Actions
  3. Click "New repository secret"
  4. Name: `NPM_TOKEN`
  5. Value: Paste your npm token

### 2. GH_PAT (GitHub Personal Access Token)

- **Purpose**: Allows semantic-release to push commits and create releases
- **Why needed**: The default GITHUB_TOKEN has limited permissions and cannot push back to the repository
- **How to get it**:
  1. Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
  2. Click "Generate new token (classic)"
  3. Give it a descriptive name like "Cachinator Release Token"
  4. Select these scopes:
     - `repo` (Full control of private repositories)
     - `write:packages` (if you plan to use GitHub Packages)
  5. Click "Generate token" and copy it immediately
- **How to set it**:
  1. Go to your GitHub repository
  2. Settings → Secrets and variables → Actions
  3. Click "New repository secret"
  4. Name: `GH_PAT`
  5. Value: Paste your GitHub PAT

## How It Works

### Automatic Versioning

The system uses [Conventional Commits](https://www.conventionalcommits.org/) to determine version bumps:

- `feat:` → Minor version bump (0.1.0 → 0.2.0)
- `fix:` → Patch version bump (0.1.0 → 0.1.1)
- `BREAKING CHANGE:` or `feat!:` → Major version bump (0.1.0 → 1.0.0)
- `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` → No version bump

### Release Process

1. **Push to main branch**: Triggers release workflow
2. **Conventional commit analysis**: Determines if a release is needed
3. **Version bump**: Updates package.json and package-lock.json
4. **Changelog generation**: Creates/updates CHANGELOG.md
5. **Git tag creation**: Creates a git tag (e.g., v1.2.3)
6. **GitHub release**: Creates a GitHub release with changelog
7. **NPM publish**: Publishes the package to npm registry

### Commit Message Format

Use this format for your commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Examples:**

- `feat: add Redis store implementation`
- `fix(cache): resolve memory leak in cleanup`
- `docs: update README with usage examples`
- `feat!: change API to use async/await`

**BREAKING CHANGE:**

- `feat!: change API to use async/await`
- `feat: add new feature

BREAKING CHANGE: The old API is deprecated`

## Workflow Triggers

- **Main branch**: Creates stable releases
- **Beta branch**: Creates pre-releases (e.g., 1.0.0-beta.1)

## Manual Release

If you need to manually trigger a release:

1. Make sure your changes are committed with conventional commit format
2. Push to the main branch
3. The workflow will automatically run and create a release if needed

## Troubleshooting

### No Release Created

- Check if your commits follow conventional commit format
- Ensure you have the required secrets configured
- Check the GitHub Actions logs for errors

### Permission Denied

- **Check GH_PAT secret exists**: Go to your repo → Settings → Secrets and variables → Actions, verify `GH_PAT` is listed
- **Verify GH_PAT permissions**: The token needs `repo` scope (Full control of private repositories)
- **Check token format**: Make sure there are no extra spaces or characters when copying the token
- **Verify NPM_TOKEN has the correct permissions**
- **Ensure the package name in package.json is available on npm**

### GitHub PAT Troubleshooting

If you're still getting permission errors:

1. **Verify the secret was added correctly**:
   - Go to your repository settings
   - Check that `GH_PAT` appears in the secrets list
   - Make sure there are no typos in the secret name

2. **Test the token manually**:

   ```bash
   # Test if the token works
   curl -H "Authorization: token YOUR_GH_PAT" https://api.github.com/user
   ```

3. **Check token scopes**:
   - Go to GitHub.com → Settings → Developer settings → Personal access tokens
   - Find your token and verify it has `repo` scope checked

4. **Create a new token if needed**:
   - Sometimes tokens can be corrupted during copy/paste
   - Delete the old `GH_PAT` secret and create a new one

### NPM Token Troubleshooting

If you're still getting npm authentication errors:

1. **Verify NPM_TOKEN secret exists**:
   - Go to your repository settings
   - Check that `NPM_TOKEN` appears in the secrets list
   - Make sure there are no typos in the secret name

2. **Check token type**:
   - Go to `https://www.npmjs.com/settings/tokens`
   - Verify your token is of type "Automation" (not "Publish" or "Read-only")

3. **Test token manually**:

   ```bash
   # Test if the token works
   echo "//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN" > ~/.npmrc
   npm whoami
   ```

4. **Check 2FA settings**:
   - Go to `https://www.npmjs.com/settings/security`
   - If 2FA is enabled, set level to "Authorization only"

5. **Create a new token**:
   - Delete the old `NPM_TOKEN` secret
   - Create a new "Automation" token
   - Add it as `NPM_TOKEN` secret

### Version Conflicts

- If a version already exists, semantic-release will skip the release
- Check npm registry to see if the version was already published

## Files Created/Modified

- `.releaserc.json` - Semantic release configuration
- `commitlint.config.js` - Commit message linting rules
- `CHANGELOG.md` - Auto-generated changelog (created on first release)
- Updated GitHub workflows for proper integration

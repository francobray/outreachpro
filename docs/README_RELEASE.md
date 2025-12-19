# Release Script Documentation

## Overview

The release script automates the process of versioning, committing, and tagging releases for OutreachPro.

## Usage

### Quick Start

```bash
# Patch release (2.5.0 → 2.5.1) - Bug fixes
npm run release:patch

# Minor release (2.5.0 → 2.6.0) - New features
npm run release:minor

# Major release (2.5.0 → 3.0.0) - Breaking changes
npm run release:major
```

## What the Script Does

1. **Validates** - Checks for uncommitted changes and warns you
2. **Increments Version** - Updates version in `package.json` and `package-lock.json`
3. **Commits** - Creates a commit with message: `chore: bump version to X.X.X`
4. **Tags** - Creates a git tag: `vX.X.X`
5. **Pushes** - Pushes both the commit and tag to remote

## Version Bumping Rules

Follow [Semantic Versioning (SemVer)](https://semver.org/):

- **PATCH** (X.X.1) - Bug fixes, minor tweaks
- **MINOR** (X.1.0) - New features, backwards compatible
- **MAJOR** (1.0.0) - Breaking changes, incompatible API changes

## Examples

### Bug Fix Release
```bash
# Fixed a calculation error in ICP scoring
npm run release:patch
# 2.5.0 → 2.5.1
```

### Feature Release
```bash
# Added new ICP geography management
npm run release:minor
# 2.5.0 → 2.6.0
```

### Major Update
```bash
# Complete redesign of the scoring system
npm run release:major
# 2.5.0 → 3.0.0
```

## Pre-Release Checklist

Before running a release:

- [ ] All tests pass
- [ ] Code is linted (`npm run lint`)
- [ ] Changes are committed
- [ ] Pull latest from remote
- [ ] You're on the correct branch (usually `main` or `master`)

## Manual Release (if needed)

If you need to release manually:

```bash
# 1. Increment version
npm version patch  # or minor, major

# 2. Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

# 3. Commit
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"

# 4. Tag
git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"

# 5. Push
git push origin main
git push origin "v$NEW_VERSION"
```

## Troubleshooting

### "You have uncommitted changes"
- Commit or stash your changes before releasing
- Or press 'y' to continue anyway (not recommended)

### "Permission denied"
- Make sure the script is executable: `chmod +x scripts/release.sh`

### "Failed to push"
- Check your git remote configuration
- Ensure you have push access to the repository
- Verify you're connected to the internet

### Rollback a Release
```bash
# Delete local tag
git tag -d vX.X.X

# Delete remote tag
git push origin :refs/tags/vX.X.X

# Reset to previous commit
git reset --hard HEAD~1

# Force push (use with caution!)
git push origin main --force
```

## CI/CD Integration

This script can be integrated into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
name: Release
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version bump type'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run release:${{ github.event.inputs.version }}
```

## Best Practices

1. **Always release from main/master branch**
2. **Test before releasing** - Run your test suite
3. **Write meaningful commit messages** - The script generates them for you
4. **Use patch for hotfixes** - Quick bug fixes between features
5. **Document changes** - Update CHANGELOG.md (consider automating this)
6. **Tag important releases** - Major milestones should be major versions

## Support

For issues or questions about the release process, contact the development team.


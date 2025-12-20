#!/bin/bash

# Release script for OutreachPro
# Usage: npm run release:patch | release:minor | release:major

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if version type is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Version type is required${NC}"
  echo "Usage: npm run release:patch | release:minor | release:major"
  exit 1
fi

VERSION_TYPE=$1

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid version type. Use patch, minor, or major${NC}"
  exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  OutreachPro Release Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if git is clean
if [[ -n $(git status -s) ]]; then
  echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
  read -p "Do you want to continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Release cancelled${NC}"
    exit 1
  fi
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📍 Current branch: ${NC}${CURRENT_BRANCH}"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Current version: ${NC}${CURRENT_VERSION}"

# Bump version using npm
echo -e "${GREEN}🚀 Bumping ${VERSION_TYPE} version...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✅ New version: ${NC}${NEW_VERSION}"

# Commit the version change
echo -e "${GREEN}📝 Committing version bump...${NC}"
git add package.json package-lock.json
git commit -m "chore: bump version to ${NEW_VERSION}"

# Create git tag
echo -e "${GREEN}🏷️  Creating tag v${NEW_VERSION}...${NC}"
git tag -a "v${NEW_VERSION}" -m "Release version ${NEW_VERSION}"

# Push commits and tags
echo -e "${GREEN}⬆️  Pushing to remote...${NC}"
git push origin $CURRENT_BRANCH
git push origin "v${NEW_VERSION}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Release ${NEW_VERSION} completed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo -e "   • Version: ${CURRENT_VERSION} → ${NEW_VERSION}"
echo -e "   • Branch: ${CURRENT_BRANCH}"
echo -e "   • Tag: v${NEW_VERSION}"
echo ""



# GitHub Push & Rollback Quick Reference Guide

## 🚀 Before Push: Create Safety Checkpoint

```bash
# 1. Save current commit hash (for reference)
git log -1 --oneline

# 2. Create backup branch (safety net)
git branch backup-$(date +%Y%m%d-%H%M%S)

# 3. Test locally
npm test  # or your test command

# 4. Check what you're about to push
git status
git diff origin/main
```

---

## 📤 Safe Push

```bash
# Push to GitHub
git push origin main

# Or push to feature branch first (safer)
git checkout -b feature/my-changes
git push origin feature/my-changes
```

---

## ⚡ Immediate Rollback (Problem Found Right Away)

### Method 1: Revert Last Commit (Safest - Preserves History)

```bash
# Create a revert commit (undoes changes but keeps history)
git revert HEAD

# Push the revert
git push origin main

# Verify
git log --oneline -3
```

### Method 2: Quick Undo Multiple Commits

```bash
# Revert last 2 commits
git revert HEAD~2..HEAD

# Push reverts
git push origin main
```

---

## 🔄 Delayed Rollback (Problem Found Later)

### Find the commit to rollback to:

```bash
# View commit history
git log --oneline -10

# Or with dates
git log --oneline --since="2 days ago"
```

### Revert to specific commit:

```bash
# Get the commit hash from log above (e.g., abc1234)
git revert abc1234..HEAD

# Push the revert
git push origin main
```

### Alternative: Revert specific commit only:

```bash
# Revert just one specific commit
git revert abc1234

# Push
git push origin main
```

---

## 🚨 Emergency Rollback (Personal Branches Only)

⚠️ **WARNING**: Only use on branches you own. Never on shared branches!

```bash
# 1. Find commit to reset to
git log --oneline -10

# 2. Hard reset to that commit (e.g., abc1234)
git reset --hard abc1234

# 3. Force push (overwrites remote)
git push origin main --force

# Or safer force-with-lease (fails if someone else pushed)
git push origin main --force-with-lease
```

---

## ✅ Verification After Rollback

```bash
# Check current state
git status

# Verify commit history
git log --oneline -5

# Compare with remote
git fetch origin
git diff HEAD origin/main

# Check remote on GitHub
git log origin/main --oneline -5
```

---

## 🔖 Pro Tips

### Create Release Tags (Before Major Changes)

```bash
# Tag current stable version
git tag -a v1.0.0 -m "Stable version before changes"
git push origin v1.0.0

# Rollback to tagged version if needed
git reset --hard v1.0.0
git push origin main --force-with-lease
```

### Restore from Backup Branch

```bash
# List backup branches
git branch | grep backup

# Restore from backup
git reset --hard backup-20260130-093000
git push origin main --force-with-lease
```

### Work on Feature Branches (Safest Approach)

```bash
# Always work on feature branches
git checkout -b feature/my-feature
# ... make changes ...
git push origin feature/my-feature

# Test in production/staging
# If problems occur, just delete the branch
git push origin --delete feature/my-feature

# If successful, merge to main
git checkout main
git merge feature/my-feature
git push origin main
```

---

## 📋 Quick Decision Tree

**Just pushed and found problem immediately?**
→ Use `git revert HEAD` + push

**Found problem hours/days later?**
→ Use `git log` to find commit, then `git revert abc1234..HEAD`

**Working on personal/feature branch?**
→ Can use `git reset --hard` + `--force-with-lease`

**Working on shared branch (main)?**
→ Always use `git revert` (never force push)

---

## 🆘 Emergency Recovery

If you accidentally pushed something sensitive:

```bash
# 1. Immediately rollback (use revert or reset)
git revert HEAD
git push origin main

# 2. Rotate any exposed credentials/keys
# 3. Contact GitHub support to purge sensitive data from history
```

If you lost work:

```bash
# Git never forgets - find lost commits
git reflog

# Recover lost commit (e.g., abc1234)
git cherry-pick abc1234
```

---

## 📞 Common Scenarios

### Scenario 1: Pushed breaking code to main

```bash
git revert HEAD
git push origin main
```

### Scenario 2: Pushed 3 commits, need to undo all

```bash
git revert HEAD~3..HEAD
git push origin main
```

### Scenario 3: Pushed wrong branch

```bash
# On correct branch
git push origin correct-branch

# Delete wrong remote branch
git push origin --delete wrong-branch
```

### Scenario 4: Need to undo last push completely

```bash
# Find commit before your push
git log --oneline -10

# Revert to that commit
git revert abc1234..HEAD
git push origin main
```

---

## 🎯 Best Practice Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and commit
git add .
git commit -m "Add feature"

# 3. Push feature branch
git push origin feature/my-feature

# 4. Test thoroughly

# 5. If good, merge to main
git checkout main
git pull origin main
git merge feature/my-feature
git push origin main

# 6. If bad, just delete feature branch
git push origin --delete feature/my-feature
git branch -d feature/my-feature
```

This workflow means you never push untested code directly to main!

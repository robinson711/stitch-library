#!/bin/sh
# Refuses a commit that would include photos, charts, backups, test pairs,
# downloaded models or anything that looks like a secret.
# Runs automatically as the git pre-commit hook (see .githooks/pre-commit).
bad=0
files=$(git diff --cached --name-only --diff-filter=ACMR)
for f in $files; do
  case "$f" in
    public/icons/*.png) ;;
    testdata/*|private/*|public/models/*|public/ocr/*|public/ort/*|dist/*|node_modules/*)
      echo "Not allowed in git: $f"; bad=1 ;;
    *.jpg|*.jpeg|*.JPG|*.JPEG|*.heic|*.HEIC|*.heif|*.png|*.PNG|*.webp|*.pdf|*.PDF|*.zip|*.mov|*.MOV|*.onnx|*.traineddata*)
      echo "Not allowed in git (picture, chart, backup or model): $f"; bad=1 ;;
    .env|.env.*|*.pem|*.key|*.p12)
      echo "Not allowed in git (secret): $f"; bad=1 ;;
  esac
  if [ -f "$f" ] && [ "$(wc -c < "$f")" -gt 1000000 ]; then
    echo "File over 1 MB, check it belongs in git: $f"; bad=1
  fi
done
if git diff --cached -U0 | grep -E '^\+' | grep -Eiq '(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*["'\''][A-Za-z0-9_\-]{16,}'; then
  echo "A staged change looks like it contains a secret."; bad=1
fi
if [ $bad -ne 0 ]; then
  echo "Commit stopped. Unstage the files above (git restore --staged <file>)."
  exit 1
fi
echo "Staged files checked: nothing private."

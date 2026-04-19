# Installing CodeCity AI for Codex

## One-Time Setup

Create a symlink from your Codex agents directory to this repository:

**macOS / Linux:**
```bash
ln -s /path/to/codecity-ai/skills ~/.agents/skills/codecity
```

**Windows (Command Prompt, run as Administrator):**
```cmd
mklink /J %USERPROFILE%\.agents\skills\codecity C:\path\to\codecity-ai\skills
```

**Windows (PowerShell, run as Administrator):**
```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\codecity" -Target "C:\path\to\codecity-ai\skills"
```

## Updating CodeCity AI

To update CodeCity AI to the latest version:

```bash
cd ~/.agents/skills/codecity
git pull
```

Or if you prefer to update the source repository and refresh the symlink:

```bash
cd /path/to/codecity-ai
git pull
```

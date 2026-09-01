param(
    [string]$ForbiddenTermsPath,
    [string]$SkillRootPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$skillRoot = if ($SkillRootPath) {
    (Resolve-Path -LiteralPath $SkillRootPath).Path
} else {
    (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}
$scriptPath = $MyInvocation.MyCommand.Path
$failures = [System.Collections.Generic.List[string]]::new()
$sourceExtensions = '.md', '.yaml', '.yml', '.json', '.ps1', '.py'
$sourceFiles = Get-ChildItem -LiteralPath $skillRoot -Recurse -File |
    Where-Object { $_.Extension -in $sourceExtensions }

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message)
}

$semanticPatterns = [ordered]@{
    'negative deliverable naming' = '(?m)^#{1,6}\s+.*(?:去除版|移除版|不含.+版|无.+版|已删除|不再包含)'
}

$externalForbiddenTerms = @()
if ($ForbiddenTermsPath) {
    $resolvedTermsPath = (Resolve-Path -LiteralPath $ForbiddenTermsPath).Path
    $externalForbiddenTerms = Get-Content -LiteralPath $resolvedTermsPath -Encoding UTF8 |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') }
}

foreach ($file in $sourceFiles) {
    $relativePath = $file.FullName.Substring($skillRoot.Length + 1)
    $content = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
    $lines = $content -split "`r?`n"
    $isValidator = $file.FullName -eq $scriptPath

    if (-not $isValidator) {
        for ($index = 0; $index -lt $lines.Count; $index++) {
            $line = $lines[$index]
            if ($line -match '(?i)(?:(?<![A-Za-z])[A-Za-z]:[\\/]|file://|/Users/|/home/|~[\\/]|\$\{(?:CODEX_HOME|HOME))') {
                Add-Failure "$relativePath`:$($index + 1) contains an absolute local path or home-directory assumption: $line"
            }
        }

        foreach ($entry in $semanticPatterns.GetEnumerator()) {
            foreach ($match in [regex]::Matches($content, $entry.Value)) {
                $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                Add-Failure "$relativePath`:$lineNumber matched $($entry.Key): $($match.Value)"
            }
        }

        foreach ($term in $externalForbiddenTerms) {
            $index = $content.IndexOf($term, [StringComparison]::OrdinalIgnoreCase)
            if ($index -ge 0) {
                $lineNumber = ($content.Substring(0, $index) -split "`n").Count
                Add-Failure "$relativePath`:$lineNumber matched external forbidden term: $term"
            }
        }
    }
}

foreach ($file in ($sourceFiles | Where-Object { $_.Extension -eq '.md' })) {
    $relativePath = $file.FullName.Substring($skillRoot.Length + 1)
    $content = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)

    foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\(([^)]+)\)')) {
        $target = ($match.Groups[1].Value -split '#', 2)[0]
        if ([string]::IsNullOrWhiteSpace($target) -or $target -match '(?i)^(?:https?://|mailto:)') {
            continue
        }
        if ([IO.Path]::IsPathRooted($target)) {
            Add-Failure "$relativePath contains an absolute local link: $target"
            continue
        }

        $resolved = [IO.Path]::GetFullPath((Join-Path $file.DirectoryName $target))
        if (-not $resolved.StartsWith($skillRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Add-Failure "$relativePath has a local link outside the Skill: $target"
        } elseif (-not (Test-Path -LiteralPath $resolved)) {
            Add-Failure "$relativePath has a missing local link: $target"
        }
    }

    $lines = Get-Content -LiteralPath $file.FullName -Encoding UTF8
    $tableColumnCount = $null
    $tableStart = 0
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match '^\|') {
            $columnCount = ([regex]::Matches($lines[$index], '(?<!\\)\|')).Count - 1
            if ($null -eq $tableColumnCount) {
                $tableColumnCount = $columnCount
                $tableStart = $index + 1
            } elseif ($columnCount -ne $tableColumnCount) {
                Add-Failure "$relativePath`:$($index + 1) has inconsistent table columns; table starts at $tableStart, expected $tableColumnCount, found $columnCount"
            }
        } else {
            $tableColumnCount = $null
        }
    }
}

$requiredFiles = @(
    'SKILL.md',
    'agents/openai.yaml',
    'references/workflow.md',
    'references/templates.md',
    'references/reference-basis.md',
    'references/prd-analysis-enumerations.md',
    'references/prototype-prd-governance.md',
    'references/naming-and-files.md',
    'references/example-ecommerce-order-management-prd.md',
    'references/example-multi-source-change-analysis.md',
    'scripts/export-prd-docx.py',
    'scripts/validate-prd-skill.ps1'
)
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $skillRoot $relativePath))) {
        Add-Failure "Missing required file: $relativePath"
    }
}

$skillInstructions = [IO.File]::ReadAllText(
    (Join-Path $skillRoot 'SKILL.md'),
    [Text.Encoding]::UTF8
)
foreach ($marker in @(
    '唯一主 PRD',
    '当前有效口径写法',
    'Markdown',
    'DOCX',
    'scripts/export-prd-docx.py'
)) {
    if (-not $skillInstructions.Contains($marker)) {
        Add-Failure "SKILL.md is missing required capability marker: $marker"
    }
}

$referenceBasis = [IO.File]::ReadAllText(
    (Join-Path $skillRoot 'references/reference-basis.md'),
    [Text.Encoding]::UTF8
)
foreach ($marker in @('Atlassian', 'GOV.UK', 'RFC 2119', 'WCAG 2.2', 'OWASP ASVS')) {
    if (-not $referenceBasis.Contains($marker)) {
        Add-Failure "Public method reference is missing: $marker"
    }
}

if ($failures.Count -gt 0) {
    Write-Host "PRD Skill validation failed: $($failures.Count) issue(s)"
    foreach ($failure in $failures) {
        Write-Host "- $failure"
    }
    exit 1
}

Write-Host "PRD Skill validation passed: $($sourceFiles.Count) source files"
exit 0

# collect_fonts.ps1 - Collect required system fonts for Document Downloader Docker image

$ErrorActionPreference = "SilentlyContinue"

# Define destination directory
$DestDir = Join-Path $PSScriptRoot "fonts"
if (!(Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Gathering required system fonts for Docker container..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Destination folder: $DestDir`n" -ForegroundColor Yellow

# Source directory for Windows Fonts
$FontSourceDir = "$env:windir\Fonts"

# List of specific font files used by the templates
$RequiredFontFiles = @(
    # Times New Roman family
    "times.ttf", "timesbd.ttf", "timesbi.ttf", "timesi.ttf",
    # Arial family
    "arial.ttf", "arialbd.ttf", "arialbi.ttf", "ariali.ttf", "ariblk.ttf",
    # Calibri family
    "calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf",
    # Cambria family
    "cambria.ttc", "cambriab.ttf", "cambriai.ttf", "cambriaz.ttf",
    # Arabic Transparent font (Essential for Arabic templates)
    "arabtype.ttf",
    # Agency FB family
    "agencyr.ttf", "agencyb.ttf",
    # Mangal family
    "mangal.ttf", "mangalb.ttf",
    # Nirmala UI family
    "nirmala.ttf", "nirmalab.ttf", "nirmalas.ttf"
)

$CopiedCount = 0
$MissingFiles = @()

foreach ($fontFile in $RequiredFontFiles) {
    $srcPath = Join-Path $FontSourceDir $fontFile
    $destPath = Join-Path $DestDir $fontFile
    
    if (Test-Path $srcPath) {
        Write-Host "Copying specific font: $fontFile" -ForegroundColor Green
        Copy-Item -Path $srcPath -Destination $destPath -Force
        $CopiedCount++
    } else {
        # Try a case-insensitive wildcard search in the fonts folder in case filenames differ slightly
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fontFile)
        $ext = [System.IO.Path]::GetExtension($fontFile)
        $wildcardPattern = "*$baseName*$ext"
        
        $foundFiles = Get-ChildItem -Path $FontSourceDir -Filter $wildcardPattern
        if ($foundFiles) {
            foreach ($file in $foundFiles) {
                Write-Host "Found & Copying match: $($file.Name)" -ForegroundColor Green
                Copy-Item -Path $file.FullName -Destination (Join-Path $DestDir $file.Name) -Force
                $CopiedCount++
            }
        } else {
            $MissingFiles += $fontFile
        }
    }
}

# Scan for any additional Arabic fonts since arabtype.ttf might not be found on all systems
Write-Host "`nScanning for additional Arabic fonts to ensure full compatibility..." -ForegroundColor Yellow
$arabicPatterns = @("*arab*", "*amiri*", "*kacst*", "*noto*arabic*")
foreach ($pattern in $arabicPatterns) {
    $foundArabic = Get-ChildItem -Path $FontSourceDir -Filter $pattern
    foreach ($file in $foundArabic) {
        $destPath = Join-Path $DestDir $file.Name
        if (!(Test-Path $destPath)) {
            Write-Host "Found & Copying Arabic font helper: $($file.Name)" -ForegroundColor Green
            Copy-Item -Path $file.FullName -Destination $destPath -Force
            $CopiedCount++
        }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " Font Collection Summary" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Successfully copied $CopiedCount font files to $DestDir" -ForegroundColor Green

if ($MissingFiles.Count -gt 0) {
    Write-Host "`nThe following specific fonts were not found in Windows Fonts folder:" -ForegroundColor Yellow
    foreach ($missing in $MissingFiles) {
        Write-Host " - $missing" -ForegroundColor Red
    }
    Write-Host "`nNote: If these fonts are missing, you can manually download and place them in the './fonts/' folder." -ForegroundColor Yellow
} else {
    Write-Host "`nAll specified fonts were successfully collected!" -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Cyan

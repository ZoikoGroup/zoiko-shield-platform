Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-DocxText($path) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
    $entry = $zip.GetEntry("word/document.xml")
    if ($null -eq $entry) {
        $zip.Dispose()
        return "No word/document.xml found in $path"
    }
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xml = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    $zip.Dispose()
    
    $text = $xml -replace '<w:p[ >]', "`n" -replace '<[^>]+>', '' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
    return $text
}

$inDir = "c:\Users\aparaziitha nitta\zoiko-shield-platform\frontend\files"
$outDir = "c:\Users\aparaziitha nitta\zoiko-shield-platform\frontend\files\extracted"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$docxFiles = Get-ChildItem -Path $inDir -Filter "*.docx"
foreach ($f in $docxFiles) {
    $txt = Read-DocxText $f.FullName
    $outName = $f.BaseName + ".txt"
    $outFile = Join-Path $outDir $outName
    [System.IO.File]::WriteAllText($outFile, $txt, $utf8NoBom)
    Write-Output "Extracted: $($f.Name) -> $($txt.Length) chars"
}

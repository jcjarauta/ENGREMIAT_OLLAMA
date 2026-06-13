param()
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
$root='C:\Users\pc\Desktop\ENGREMIAT_OLLAMA'
$cline=Join-Path $env:APPDATA 'npm\cline.cmd'
$ollama='C:\Users\pc\AppData\Local\Programs\Ollama\ollama.exe'
if(-not (Test-Path -LiteralPath $root -PathType Container)){ throw 'No existe el repositorio ENGREMIAT_OLLAMA.' }
if(-not (Test-Path -LiteralPath $cline -PathType Leaf)){ throw ('No existe Cline CLI en '+$cline) }
if(-not (Test-Path -LiteralPath $ollama -PathType Leaf)){ throw ('No existe Ollama en '+$ollama) }
$service=Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -Method Get -TimeoutSec 5 -ErrorAction Stop
if([string]::IsNullOrWhiteSpace([string]$service.version)){ throw 'Ollama no responde correctamente.' }
$tags=Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 5 -ErrorAction Stop
$modelFound=@($tags.models | Where-Object { $_.name -eq 'qwen3:14b' }).Count -gt 0
if(-not $modelFound){ throw 'El modelo qwen3:14b no está instalado.' }
Set-Location -LiteralPath $root
Write-Host 'ENGREMIAT_SAFE_CLINE_BEGIN' -ForegroundColor Cyan
Write-Host 'provider=OLLAMA_LOCAL model=qwen3:14b auto_approve=False cwd=C:\Users\pc\Desktop\ENGREMIAT_OLLAMA cloud=False' -ForegroundColor Green
& $cline --auto-approve false
$exitCode=$LASTEXITCODE
Write-Host ('ENGREMIAT_SAFE_CLINE_END exit_code='+$exitCode) -ForegroundColor Cyan
if($exitCode -ne 0){ exit $exitCode }

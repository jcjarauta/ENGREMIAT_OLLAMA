param()
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$root='C:\Users\pc\Desktop\ENGREMIAT_OLLAMA'
$clineCmd=Join-Path $env:APPDATA 'npm\cline.cmd'
if(-not (Test-Path -LiteralPath $clineCmd -PathType Leaf)){ throw 'No se encuentra cline.cmd.' }
Set-Location -LiteralPath $root
Write-Host 'CLINE_KANBAN_SAFE_LAUNCH_BEGIN' -ForegroundColor Cyan
Write-Host 'MODE=LOCAL_UI_ONLY' -ForegroundColor Cyan
Write-Host 'AGENT_EXECUTION=NOT_AUTHORIZED' -ForegroundColor Yellow
Write-Host 'TASK_EXECUTION=NOT_AUTHORIZED' -ForegroundColor Yellow
Write-Host 'AUTO_APPROVE=FALSE' -ForegroundColor Yellow
Write-Host 'GIT_WRITE=FALSE' -ForegroundColor Yellow
Write-Host 'EXTERNAL_NETWORK=FALSE' -ForegroundColor Yellow
& $clineCmd kanban
$code=$LASTEXITCODE
if($code -ne 0){ throw ('Cline Kanban terminó con exit_code='+$code) }
Write-Host 'CLINE_KANBAN_SAFE_LAUNCH_END' -ForegroundColor Cyan

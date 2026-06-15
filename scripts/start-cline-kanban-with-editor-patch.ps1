param([switch]$PreflightOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$Root = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $Root 'tools\engremiat-kanban\editor-contract-adapter\install-editor-contract-patch.js'
$WorkspaceCli = Join-Path $Root 'tools\engremiat-kanban\workspace\kanban-0.1.68\dist\cli.js'
$VendorCli = Join-Path $Root 'tools\engremiat-kanban\vendor\kanban-0.1.68\dist\cli.js'
$BaseLauncher = Join-Path $Root 'scripts\start-cline-kanban-safe.ps1'
foreach ($RequiredFile in @($Installer,$WorkspaceCli,$VendorCli,$BaseLauncher)) { if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) { throw "REQUIRED_FILE_NOT_FOUND: $RequiredFile" } }
node --check $Installer
if ($LASTEXITCODE -ne 0) { throw 'INSTALLER_NODE_CHECK_FAILED' }
$PatchOutput = node $Installer $WorkspaceCli $VendorCli
if ($LASTEXITCODE -ne 0) { throw 'EDITOR_PATCH_INSTALL_FAILED' }
$PatchState = $PatchOutput | ConvertFrom-Json
node --check $WorkspaceCli
if ($LASTEXITCODE -ne 0) { throw 'WORKSPACE_CLI_NODE_CHECK_FAILED' }
node --check $VendorCli
if ($LASTEXITCODE -ne 0) { throw 'VENDOR_CLI_NODE_CHECK_FAILED' }
Write-Host "OK launcher=PATCHED_KANBAN patch_changed=$($PatchState.changed) already_patched=$($PatchState.already_patched) workspace_node_check=True vendor_node_check=True"
if ($PreflightOnly) { Write-Host 'NEXT=RUN_WITHOUT_PREFLIGHT_ONLY_TO_START_CLINE_KANBAN'; return }
& powershell -NoProfile -ExecutionPolicy Bypass -File $BaseLauncher
if ($LASTEXITCODE -ne 0) { throw "BASE_LAUNCHER_FAILED exit_code=$LASTEXITCODE" }

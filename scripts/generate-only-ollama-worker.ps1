param()
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
$root='C:\Users\pc\Desktop\ENGREMIAT_OLLAMA'
$base=Join-Path $root 'data\generate-only-ollama-worker-002'
$inputFile=Join-Path $base 'input-contract.v1.json'
$outputFile=Join-Path $base 'output-contract.v1.json'
$target=Join-Path $root 'docs\ARCHITECTURE.md'
if(Test-Path -LiteralPath $target -PathType Leaf){ throw 'Target file must remain absent before generate-only execution.' }
foreach($p in @($inputFile,$outputFile)){ if(-not (Test-Path -LiteralPath $p -PathType Leaf)){ throw ('Missing contract: '+$p) } }
$input=Get-Content -LiteralPath $inputFile -Raw | ConvertFrom-Json
$output=Get-Content -LiteralPath $outputFile -Raw | ConvertFrom-Json
if($input.mode -ne 'GENERATE_ONLY_NO_TOOLS'){ throw 'Invalid input mode.' }
if([bool]$output.target_write_allowed -ne $false -or [bool]$output.quarantine_write_allowed -ne $true){ throw 'Invalid output write boundaries.' }
$sections=@($input.exact_sections)
$facts=$input.facts | ConvertTo-Json -Depth 100 -Compress
$structure=@($input.repository_structure) -join ', '
$flow=@($input.governed_flow) -join ' -> '
$forbidden=@($input.forbidden_terms) -join ', '
$required=@($output.required_terms) -join ', '
$sectionText=($sections | ForEach-Object { '## '+$_ }) -join "
"
$prompt=@("Redacta exclusivamente un documento Markdown en español para ENGREMIAT_OLLAMA.","Usa exactamente estas diez secciones y en este orden:",$sectionText,"Datos técnicos autorizados:",$facts,"Estructura autorizada: "+$structure,"Flujo gobernado: "+$flow,"Debes incluir literalmente, respetando mayúsculas, signos y guiones, todos estos términos: "+$required,"En particular deben aparecer literalmente las cadenas: 100% GPU y auto-approve=false.","Términos prohibidos: "+$forbidden,"No inventes componentes.","No incluyas comandos ejecutables.","No afirmes haber leído, escrito o modificado archivos.","Devuelve únicamente el Markdown final, sin introducción ni explicación.") -join "

"
$body=[ordered]@{ model=[string]$input.model; prompt=$prompt; stream=$false; think=$false; keep_alive='5m'; options=[ordered]@{ temperature=0; num_ctx=32768; num_predict=4096 } }
$response=Invoke-RestMethod -Uri ([string]$input.endpoint) -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 100 -Compress) -TimeoutSec 300 -ErrorAction Stop
$text=[string]$response.response
if([string]::IsNullOrWhiteSpace($text)){ throw 'Ollama returned an empty response.' }
$candidate=Join-Path $root ([string]$output.quarantine_file)
New-Item -ItemType Directory -Path (Split-Path -Parent $candidate) -Force | Out-Null
Set-Content -LiteralPath $candidate -Value $text.Trim() -Encoding UTF8
if(Test-Path -LiteralPath $target -PathType Leaf){ throw 'Target file was created unexpectedly.' }
Write-Host ('OK worker=GENERATE_ONLY candidate='+$candidate+' target_write=False tools=False git=False external_network=False required_literals=True') -ForegroundColor Green

## Propósito de ENGREMIAT_OLLAMA  
ENGREMIAT_OLLAMA tiene como propósito integrar Ollama y Cline CLI como worker local gobernado para ENGREMIAT, garantizando un entorno seguro, controlado y optimizado para la generación de contenido basado en modelos de lenguaje.

## Componentes validados  
Los componentes validados incluyen Ollama versión 0.30.8, Cline CLI versión 3.0.24, y el modelo qwen3:14b, configurado para operar en modo LOCAL_ONLY sin acceso a modelos en la nube.

## Hardware local validado  
El hardware local validado es la tarjeta gráfica NVIDIA GeForce RTX 4060 Ti con 16 GB de VRAM, operando en un entorno con 100% GPU de offload y 63.92 GB de RAM disponible.

## Modelo local y contexto  
El modelo local utilizado es qwen3:14b, con un contexto de 32768 tokens, optimizado para operar en entorno local sin dependencias externas ni costos de token.

## Lanzador seguro de Cline  
El lanzador seguro de Cline se encuentra en el script scripts/start-cline-safe.ps1, diseñado para iniciar el proceso de Cline CLI en un entorno controlado y validado.

## Reglas y fronteras de seguridad  
Se aplican reglas estrictas de seguridad, incluyendo la prohibición de auto-approve=false, garantizando que cada acción requiera aprobación explícita antes de su ejecución.

## Flujo de trabajo gobernado  
El flujo de trabajo gobernado sigue el siguiente proceso: contrato -> lectura de datos estructurados -> generación sin herramientas -> cuarentena -> validación determinista -> revisión humana -> gate explícito de aplicación -> diff externo -> commit humano.

## Estructura actual del repositorio  
La estructura actual del repositorio incluye los siguientes directorios y archivos: config/, data/hardware-preflight/, data/model-smoke/, data/generate-only-ollama-worker-002/, docs/, scripts/start-cline-safe.ps1, src/, tests/.

## Evidencias de validación  
Las evidencias de validación incluyen pruebas de preflight en hardware, pruebas de smoke en modelos, y registros de generación en el directorio data/generate-only-ollama-worker-002/.

## Hoja de ruta hacia un worker local gobernado  
La hoja de ruta incluye la validación continua del hardware, la implementación de reglas de seguridad estrictas, la integración de scripts de lanzamiento seguro, y la garantía de que cada paso del flujo de trabajo gobernado sea revisado y aprobado manualmente.

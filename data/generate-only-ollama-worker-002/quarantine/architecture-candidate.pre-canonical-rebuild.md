## Prop�sito de ENGREMIAT_OLLAMA  
ENGREMIAT_OLLAMA tiene como prop�sito integrar Ollama y Cline CLI como worker local gobernado para ENGREMIAT, garantizando un entorno seguro, controlado y optimizado para la generaci�n de contenido basado en modelos de lenguaje.

## Componentes validados  
Los componentes validados incluyen Ollama versi�n 0.30.8, Cline CLI versi�n 3.0.24, y el modelo qwen3:14b, configurado para operar en modo LOCAL_ONLY sin acceso a modelos en la nube.

## Hardware local validado  
El hardware local validado es la tarjeta gr�fica NVIDIA GeForce RTX 4060 Ti con 16 GB de VRAM, operando en un entorno con 100% GPU de offload y 63.92 GB de RAM disponible.

## Modelo local y contexto  
El modelo local utilizado es qwen3:14b, con un contexto de 32768 tokens, optimizado para operar en entorno local sin coste por token en la inferencia local; el equipo mantiene costes indirectos de electricidad y recursos de hardware.

## Lanzador seguro de Cline  
El lanzador seguro de Cline se encuentra en el script scripts/start-cline-safe.ps1, dise�ado para iniciar el proceso de Cline CLI en un entorno controlado y validado.

## Reglas y fronteras de seguridad  
Se aplican reglas estrictas de seguridad, incluyendo que auto-approve=false es obligatorio y toda acci�n sensible requiere aprobaci�n humana expl�cita.

## Flujo de trabajo gobernado  
El flujo de trabajo gobernado sigue el siguiente proceso: contrato -> lectura de datos estructurados -> generaci�n sin herramientas -> cuarentena -> validaci�n determinista -> revisi�n humana -> gate expl�cito de aplicaci�n -> diff externo -> commit humano.

## Estructura actual del repositorio  
La estructura actual del repositorio incluye los siguientes directorios y archivos: config/, data/hardware-preflight/, data/model-smoke/, data/generate-only-ollama-worker-002/, docs/, scripts/start-cline-safe.ps1, src/, tests/.

## Evidencias de validaci�n  
Las evidencias de validaci�n incluyen pruebas de preflight en hardware, pruebas de smoke en modelos, y registros de generaci�n en el directorio data/generate-only-ollama-worker-002/.

## Hoja de ruta hacia un worker local gobernado  
La hoja de ruta incluye la validaci�n continua del hardware, la implementaci�n de reglas de seguridad estrictas, la integraci�n de scripts de lanzamiento seguro, y la garant�a de que cada paso del flujo de trabajo gobernado sea revisado y aprobado manualmente.

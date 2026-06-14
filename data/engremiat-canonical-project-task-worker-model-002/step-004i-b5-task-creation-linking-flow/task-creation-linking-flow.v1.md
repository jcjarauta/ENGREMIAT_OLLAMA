# ENGREMIAT — Flujo de creación y enlace de tareas

## Flujo operativo
1. Preparar el contexto Engremiat en borrador.
2. Obtener aprobación o rechazo humano del contexto.
3. Crear manualmente una única tarjeta Cline sin iniciarla.
4. Capturar mediante inspección local y read-only el task_id canónico.
5. Verificar que la correlación es única.
6. Activar el sidecar en estado LINKED_BLOCKED.
7. Abrir posteriormente matching y autorización.

## Máquina de estados
Existen siete pasos operativos y ocho transiciones permitidas. La transición adicional representa el rechazo humano desde CONTEXT_DRAFTED hasta CANCELLED.

## Seguridad
La creación, el enlace y la ejecución son fronteras diferentes. Crear una tarjeta nunca autoriza su inicio.

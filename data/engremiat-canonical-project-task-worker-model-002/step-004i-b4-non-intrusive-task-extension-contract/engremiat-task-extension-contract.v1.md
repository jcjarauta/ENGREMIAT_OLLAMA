# ENGREMIAT — Extensión no intrusiva de tareas

## Decisión
La interfaz y el runtime actuales de Cline permanecen intactos. Engremiat añade un registro lateral asociado mediante cline_task_id.

## Responsabilidades
Cline conserva descripción, rama, modo plan, automatización, agente, proveedor y modelo.
Engremiat añade proyecto, necesidades, capacidades, participantes, permisos, validación, responsabilidad, intercambio y evidencias.

## Regla de seguridad
Capacidad técnica no equivale a permiso. Toda ejecución permanece bloqueada hasta disponer de autorización válida.

## Evolución
1. JSON lateral local.
2. Proyección en Google Sheets.
3. Persistencia canónica en PostgreSQL.
4. Relaciones y visualización mediante grafo.

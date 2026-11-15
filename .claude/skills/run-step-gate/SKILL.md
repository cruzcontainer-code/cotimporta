---
name: run-step-gate
description: Ejecuta y cierra un paso del plan de construcción de Cotimporta (tasks.json) con su verify, commit y tag. Úsalo al terminar una tarea, cuando digan "cerrar paso", "marcar hecho", "siguiente tarea" o al retomar una sesión interrumpida.
---

# Cerrar un paso del plan

## Cuándo usarlo
- Terminaste el trabajo de una tarea de `blueprints/cotimporta/tasks.json`.
- Retomas una sesión y hay una tarea en `in_progress`.

## Pasos
1. `export PATH="$HOME/.local/bin:$PATH"` y confirma `node -v` = `v24.22.3`.
2. Si la tarea toca base de datos: `pnpm db:up`.
3. Corre **cada** comando del arreglo `verify` de la tarea, en orden, desde la raíz del proyecto.
4. Si alguno falla: corrige el código, nunca el comando. Repite el arreglo completo.
5. Cambia `status` a `done` en `tasks.json`.
6. `git add -A && git commit -m "<id>: <título>"` y luego `git tag <checkpoint>` (valor literal del campo).
7. Corre las aserciones que el bloque Checkpoint del paso traiga después del tag.

## Verify
```bash
pnpm typecheck && pnpm lint && pnpm test        # expect: exit 0
git tag -l 'step-*'                               # expect: lista el tag recién creado
```

## No hagas
- Saltar a la siguiente tarea con un gate en rojo.
- Hacer commit antes de que el `verify` pase.
- Inventar un tag distinto del campo `checkpoint`.

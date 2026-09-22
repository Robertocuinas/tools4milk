"""Dependencias FastAPI compartidas por los routers de dominio.

Centraliza la sesión de base de datos y los controles de acceso por rol que antes
estaban duplicados en frontend_core.py.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Usuario
from app.security import require_roles

DbSession = Annotated[Session, Depends(get_db)]
AdminOnly = Annotated[Usuario, Depends(require_roles("admin"))]
AnimalManager = Annotated[Usuario, Depends(require_roles("admin", "veterinario"))]
TaskManager = Annotated[Usuario, Depends(require_roles("admin", "operario", "alimentacion"))]
ClinicalManager = Annotated[Usuario, Depends(require_roles("admin", "veterinario"))]
QualityManager = Annotated[Usuario, Depends(require_roles("admin", "veterinario", "alimentacion"))]
OperationsManager = Annotated[Usuario, Depends(require_roles("admin", "operario", "alimentacion"))]
# T15: pedidos.py, shifts.py y handovers.py solo exigian get_current_user sin
# comprobar rol (hueco senalado en docs/ESPECIFICACION_MEJORAS_TOOLS4MILK.md,
# T15). Los conjuntos de roles siguen exactamente
# frontend/src/lib/role-capabilities.ts para no introducir una politica de
# permisos distinta entre frontend y backend:
#   - manage_orders/create_order: admin, alimentacion (operario NO puede)
#   - manage_shifts/create_shift: solo admin (ningun otro rol las tiene)
#   - create_handover: admin, operario (veterinario/alimentacion solo ven)
OrdersManager = Annotated[Usuario, Depends(require_roles("admin", "alimentacion"))]
HandoverManager = Annotated[Usuario, Depends(require_roles("admin", "operario"))]

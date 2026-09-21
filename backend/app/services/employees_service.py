from typing import Any
from app.models.tools4milk import Empleado


def serialize(e: Empleado) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "nombre": e.nombre,
        "apellidos": e.apellidos,
        "role": e.rol,
        "zona_principal_id": str(e.zona_principal_id) if getattr(e, "zona_principal_id", None) else None,
        "activo": e.activo,
        # T10.2: idioma preferente del trabajador (para I18n por persona, no
        # por dispositivo) y vinculo con su cuenta de aplicacion, si tiene.
        "idioma_preferente": e.idioma_preferente,
        "usuario_id": str(e.usuario_id) if e.usuario_id else None,
    }

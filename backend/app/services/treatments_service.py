from typing import Any
from app.models.tools4milk import TratamientoActivo


def serialize(t: TratamientoActivo) -> dict[str, Any]:
    # Auditoria post-implementacion (hallazgo 3.4): periodo_retirada_dias y
    # fecha_fin_retirada se devolvian siempre null pese a que el dato real
    # existe en eventos_sanitarios.periodo_retirada_hasta cuando el
    # tratamiento viene de un evento sanitario. Es un dato de seguridad
    # alimentaria (cuando la leche de un animal tratado vuelve a ser apta),
    # asi que se sirve cuando esta disponible.
    fecha_fin_retirada = t.evento_sanitario.periodo_retirada_hasta if t.evento_sanitario else None
    periodo_retirada_dias = (fecha_fin_retirada - t.fecha_inicio).days if fecha_fin_retirada else None

    return {
        "id": str(t.id),
        "animal_id": str(t.animal_id),
        "medicamento": t.farmaco,
        "dosis": t.dosis,
        "via_administracion": t.via_administracion,
        "fecha_inicio": t.fecha_inicio.isoformat() if t.fecha_inicio else None,
        "fecha_fin": t.fecha_fin_prevista.isoformat() if t.fecha_fin_prevista else None,
        "periodo_retirada_dias": periodo_retirada_dias,
        "fecha_fin_retirada": fecha_fin_retirada.isoformat() if fecha_fin_retirada else None,
        "activo": t.activo,
        # Auditoria post-implementacion (hallazgo 3.11): create()/update() ya
        # guardaban "motivo" y "observaciones" en la misma columna `notas`;
        # motivo se devolvia siempre null, perdiendo el dato en el camino de
        # vuelta si el cliente lo habia mandado como "motivo".
        "motivo": t.notas,
        "veterinario": str(t.prescrito_por) if t.prescrito_por else None,
        "observaciones": t.notas,
    }

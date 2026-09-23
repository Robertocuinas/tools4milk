"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task, Employee, Zone } from "@/lib/types";
import { WorkerRecommendationList, useWorkerRecommendations, type RankedEmployee } from "./WorkerRecommendationList";

interface TaskAssignmentModalProps {
  task: Task;
  employees: Employee[];
  zones: Zone[];
  onAssign: (employeeId: string) => void;
  onClose: () => void;
}

export function TaskAssignmentModal({
  task,
  employees,
  zones,
  onAssign,
  onClose,
}: TaskAssignmentModalProps) {
  const { t } = useTranslation();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(task.empleado_id ?? null);
  const titleId = useId();
  const listLabelId = useId();

  const zone = zones.find((z) => z.id === task.zona_id);

  // Recomendacion dependiente de la tarea (catalogo, zona y fecha). Si el
  // endpoint falla, `ranked` conserva la lista original de empleados.
  const { ranked, status } = useWorkerRecommendations(
    {
      catalogoId: task.tarea_catalogo_id,
      zonaId: task.zona_id,
      tsPlanificada: task.fecha_programada,
      taskId: task.id,
    },
    employees,
  );

  // Orden de respaldo (el que habia antes): primero los de la zona de la
  // tarea y despues por nombre. Solo se usa si no hay recomendacion.
  const options = useMemo<RankedEmployee[]>(() => {
    if (status === "ready") return ranked;
    const inZone = (emp: Employee) => !emp.zona_principal_id || emp.zona_principal_id === task.zona_id;
    return [...ranked].sort((a, b) => {
      const ca = inZone(a.employee);
      const cb = inZone(b.employee);
      if (ca !== cb) return ca ? -1 : 1;
      return a.employee.nombre.localeCompare(b.employee.nombre);
    });
  }, [ranked, status, task.zona_id]);

  // Aviso informativo (ya NO deshabilita la opcion: la asignacion es libre).
  const zoneNote = (emp: Employee) =>
    task.zona_id && emp.zona_principal_id && emp.zona_principal_id !== task.zona_id
      ? t("leanfarming.zoneMismatch")
      : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-[14px] bg-white shadow-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 id={titleId} className="font-heading text-lg font-bold text-app-text">{t("leanfarming.assignTask")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-app-dim hover:text-app-text"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-5">
          {/* Task details */}
          <div className="rounded-[10px] bg-app-bg p-3">
            <p className="text-xs font-semibold uppercase text-app-dim mb-1">{t("leanfarming.taskFallback")}</p>
            <p className="font-bold text-app-text">{task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}</p>
            {zone && (
              <p className="text-xs text-app-dim mt-1">{t("leanfarming.zoneLabel")}: {zone.nombre}</p>
            )}
          </div>

          {/* Employee selector: primero el recomendado, despues el resto por puntuacion */}
          <div>
            <p id={listLabelId} className="text-xs font-semibold uppercase text-app-dim mb-2 block">
              {t("leanfarming.assignTo")}
            </p>
            <WorkerRecommendationList
              name={`assign-${task.id}`}
              labelledBy={listLabelId}
              ranked={options}
              status={status}
              selectedId={selectedEmployeeId}
              onSelect={setSelectedEmployeeId}
              note={zoneNote}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[10px] border border-app-border px-4 py-2 text-sm font-bold text-app-text transition hover:bg-app-bg"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedEmployeeId) {
                  onAssign(selectedEmployeeId);
                }
              }}
              disabled={!selectedEmployeeId}
              className="flex-1 rounded-[10px] bg-brand-dark px-4 py-2 text-sm font-bold text-white transition hover:bg-sidebar-bg disabled:opacity-50"
            >
              {t("leanfarming.assign")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

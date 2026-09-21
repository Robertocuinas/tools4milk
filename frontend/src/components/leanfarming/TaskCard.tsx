"use client";

import { AlertOctagon, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task, Employee, TaskPriority } from "@/lib/types";

interface TaskCardProps {
  task: Task;
  assignedEmployee?: Employee;
  onClick?: () => void;
  showAssigned?: boolean;
  variant?: "planning" | "compact";
}

const stateColors = {
  programada: "bg-state-info/10 border-state-info/30 text-state-info",
  retrasada: "bg-state-critica/10 border-state-critica/30 text-state-critica",
  pausada: "bg-brand/10 border-brand/30 text-brand",
  ejecutada: "bg-state-ok/10 border-state-ok/30 text-state-ok",
  cancelada: "bg-app-bg border-app-border text-app-dim",
};

const priorityDotColors: Partial<Record<TaskPriority, string>> = {
  urgente: "bg-state-critica",
  alta: "bg-state-atencion",
};

export function TaskCard({
  task,
  assignedEmployee,
  onClick,
  showAssigned = true,
  variant = "planning",
}: TaskCardProps) {
  const { t } = useTranslation();
  const bgClass = stateColors[task.estado as keyof typeof stateColors] || stateColors.programada;
  const isCompact = variant === "compact";

  return (
    <div
      onClick={onClick}
      className={`rounded-[10px] border cursor-pointer transition hover:shadow-sm ${bgClass} ${
        isCompact ? "p-3" : "p-4"
      } ${!onClick && "cursor-default"}`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold truncate ${isCompact ? "text-sm" : "text-base"}`}>
              {task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}
            </p>
            {task.zona_id && (
              <p className="text-xs text-app-dim mt-1">
                {t("leanfarming.zoneLabel")}: {task.zona_id}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {priorityDotColors[task.prioridad] && (
              <span
                className={`h-2 w-2 rounded-full ${priorityDotColors[task.prioridad]}`}
                title={task.prioridad === "urgente" ? t("leanfarming.priorityUrgent") : t("leanfarming.priorityHigh")}
              />
            )}
            {task.estado === "retrasada" && <AlertOctagon className="h-4 w-4" />}
          </div>
        </div>

        {!isCompact && (
          <div className="space-y-1 text-xs text-app-dim">
            {task.fecha_programada && (
              <p>
                {new Date(task.fecha_programada).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        )}

        {showAssigned && (
          <div className="flex items-center gap-1 text-xs">
            <User className="h-3 w-3" />
            <span>{assignedEmployee ? `${assignedEmployee.nombre}` : t("leanfarming.unassigned")}</span>
          </div>
        )}

        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-app-dim">
          {task.estado}
        </div>
      </div>
    </div>
  );
}

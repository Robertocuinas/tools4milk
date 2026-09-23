"use client";

import { useTranslation } from "react-i18next";
import { TvFitList } from "@/components/tv/TvFitList";
import { TvBadge, TvEmptyRow, TvItem, TvPanel } from "@/components/tv/TvPanel";
import { dateLocale } from "@/lib/i18n";
import type { Incident, Task } from "@/lib/types";

function formatTime(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TaskCard = ({ task, hasIncident }: { task: Task; hasIncident: boolean }) => {
  const { t, i18n } = useTranslation();
  const bgClass = hasIncident ? "border-state-critica/50 bg-state-critica/10" : "border-app-border bg-white";

  return (
    <div className={`rounded-[10px] border p-4 shadow-sm ${bgClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-app-text">{task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}</p>
          <p className="mt-1 text-xs text-app-dim">{formatTime(task.fecha_programada, dateLocale(i18n.language))}</p>
          {task.observaciones && <p className="mt-2 text-xs leading-relaxed text-app-text">{task.observaciones}</p>}
        </div>
        {hasIncident && (
          <div className="shrink-0 rounded-full bg-state-critica/20 px-2 py-1">
            <span className="text-[10px] font-bold uppercase text-state-critica">⚠️ {t("zone.kanban.incidentBadge")}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const KanbanColumn = ({
  title,
  tasks,
  incidents,
  isEmpty,
}: {
  title: string;
  tasks: Task[];
  incidents: Incident[];
  isEmpty: boolean;
}) => {
  const { t } = useTranslation();
  const taskIncidentMap = new Set(
    incidents.map((i) => {
      // Try to extract task ID from description or metadata
      return i.descripcion?.includes("Tarea:") ? i.descripcion.split("Tarea:")[1]?.trim() : null;
    })
  );

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-app-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base font-bold text-app-text">{title}</h3>
        <span className="rounded-full bg-app-bg px-3 py-1 text-sm font-bold text-app-dim">{tasks.length}</span>
      </div>

      {isEmpty ? (
        <p className="rounded-[10px] border border-dashed border-app-border bg-app-bg py-8 text-center text-sm text-app-dim">
          {t("leanfarming.noTasksShort")}
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} hasIncident={taskIncidentMap.has(task.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

function hasTaskIncident(task: Task, incidents: Incident[]) {
  return incidents.some((incident) =>
    incident.descripcion?.includes("Tarea:") && incident.descripcion.split("Tarea:")[1]?.trim() === task.id,
  );
}

function TvKanbanColumn({ title, tasks, incidents }: { title: string; tasks: Task[]; incidents: Incident[] }) {
  const { t, i18n } = useTranslation();

  return (
    <TvPanel title={title} count={tasks.length} className="h-full">
      {tasks.length === 0 ? (
        <TvEmptyRow text={t("leanfarming.noTasksShort")} tone="ok" />
      ) : (
        <TvFitList
          items={tasks}
          getKey={(task) => task.id}
          renderItem={(task) => {
            const hasIncident = hasTaskIncident(task, incidents);
            return (
              <TvItem accent={hasIncident ? "critical" : undefined}>
                <div className="flex items-start justify-between gap-(--tvu-gap-sm)">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-(length:--tvu-fs-sm) font-bold leading-tight text-tv-text">
                      {task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}
                    </p>
                    <p className="mt-(--tvu-gap-sm) text-(length:--tvu-fs-xs) font-semibold text-tv-dim">
                      {formatTime(task.fecha_programada, dateLocale(i18n.language))}
                    </p>
                  </div>
                  {hasIncident && <TvBadge tone="critical">{t("zone.kanban.incidentBadge")}</TvBadge>}
                </div>
              </TvItem>
            );
          }}
        />
      )}
    </TvPanel>
  );
}

export function ZoneKanbanView({
  tasks,
  incidents,
  variant = "management",
}: {
  tasks: Task[];
  incidents: Incident[];
  /** En TV se limita la lista al alto disponible y nunca ofrece acciones. */
  variant?: "management" | "tv";
}) {
  const { t } = useTranslation();
  // Sort tasks by priority (if field exists), then by scheduled time
  const sortedTasks = [...tasks].sort((a, b) => {
    const aTime = new Date(a.fecha_programada || 0).getTime();
    const bTime = new Date(b.fecha_programada || 0).getTime();
    return aTime - bTime;
  });

  const pendingTasks = sortedTasks.filter((t) => t.estado === "programada" || t.estado === "retrasada");
  const inProgressTasks = sortedTasks.filter((t) => t.estado === "pausada");
  const completedTasks = sortedTasks.filter((t) => t.estado === "ejecutada");

  if (variant === "tv") {
    return (
      <div className="grid h-full min-h-0 gap-(--tvu-gap) lg:grid-cols-3">
        <TvKanbanColumn title={t("zones.pendingTasks")} tasks={pendingTasks} incidents={incidents} />
        <TvKanbanColumn title={t("leanfarming.stateInProgress")} tasks={inProgressTasks} incidents={incidents} />
        <TvKanbanColumn title={t("zone.kanban.finished")} tasks={completedTasks} incidents={incidents} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[10px] border border-state-info/30 bg-state-info/5 px-4 py-3 text-xs font-semibold text-state-info">
        {t("zone.kanban.info")}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <KanbanColumn
          title={t("zones.pendingTasks")}
          tasks={pendingTasks}
          incidents={incidents}
          isEmpty={pendingTasks.length === 0}
        />
        <KanbanColumn
          title={t("leanfarming.stateInProgress")}
          tasks={inProgressTasks}
          incidents={incidents}
          isEmpty={inProgressTasks.length === 0}
        />
        <KanbanColumn
          title={t("zone.kanban.finished")}
          tasks={completedTasks}
          incidents={incidents}
          isEmpty={completedTasks.length === 0}
        />
      </div>
    </div>
  );
}

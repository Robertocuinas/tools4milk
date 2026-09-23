"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, CheckCircle2, MessageSquare, AlertOctagon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { useToast } from "@/components/ui/toast";
import type { Task } from "@/lib/types";

function formatTime(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}


const TaskActionButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = "secondary",
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) => {
  const baseClass = "tablet-touch flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-bold transition";
  const variantClass = {
    primary: "bg-state-ok/10 text-state-ok hover:bg-state-ok/20",
    secondary: "bg-brand/10 text-brand-dark hover:bg-brand/20",
    danger: "bg-state-critica/10 text-state-critica hover:bg-state-critica/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClass[variant]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
};

function TaskRow({
  task,
  onStart,
  onCreateIncident,
  onComplete,
  onAddNote,
  canStart,
  canCreateIncidents,
  section,
}: {
  task: Task;
  onStart: (taskId: string) => void;
  onCreateIncident: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onAddNote: (taskId: string) => void;
  canStart: boolean;
  canCreateIncidents: boolean;
  section: "pending" | "inProgress";
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-bold text-app-text">{task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}</p>
          <p className="mt-1 text-xs text-app-dim">
            {formatTime(task.fecha_programada, dateLocale(i18n.language))} · {enumLabel("taskStatus", task.estado)}
          </p>
          {task.observaciones && <p className="mt-2 text-xs text-app-dim">{task.observaciones}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {section === "pending" && (
          <TaskActionButton
            icon={Play}
            label={t("zone.tablet.start")}
            onClick={() => onStart(task.id)}
            disabled={!canStart}
            variant="primary"
          />
        )}

        {section === "inProgress" && (
          <>
            {canCreateIncidents && (
              <TaskActionButton
                icon={AlertOctagon}
                label={t("zone.tablet.incident")}
                onClick={() => onCreateIncident(task.id)}
                variant="danger"
              />
            )}
            <TaskActionButton
              icon={MessageSquare}
              label={t("zone.tablet.note")}
              onClick={() => onAddNote(task.id)}
            />
            <TaskActionButton
              icon={CheckCircle2}
              label={t("zone.tablet.finish")}
              onClick={() => onComplete(task.id)}
              variant="primary"
            />
          </>
        )}
      </div>
    </div>
  );
}

export function ZoneTabletView({
  tasks,
  zoneKey,
  canStartTasks,
  canCreateIncidents,
  canManageTreatments,
  onCreateIncident,
  onShowTreatment,
}: {
  tasks: Task[];
  zoneKey: "recria" | "nave";
  canStartTasks: boolean;
  // Auditoria post-implementacion (hallazgo 4.2): estos permisos ya se
  // calculaban en zones/[id]/page.tsx pero nunca se aplicaban aqui — el
  // modal de tratamiento veterinario se podia abrir desde cualquier rol.
  canCreateIncidents: boolean;
  canManageTreatments: boolean;
  onCreateIncident: () => void;
  onShowTreatment: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedTaskForNote, setSelectedTaskForNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  // Auditoria post-implementacion (hallazgo 4.7): ninguna de estas tres
  // mutaciones avisaba de un fallo — en la tablet (manos ocupadas, guantes,
  // conexion inestable) un fallo silencioso deja al operario sin saber si
  // la accion se aplico o no.
  const startTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.updateTask(taskId, {
        estado: "pausada",
      } as Parameters<typeof api.updateTask>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zone-tasks"] });
    },
    onError: (err: Error) => toast.error(err.message || t("zone.tablet.startError")),
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.updateTask(taskId, {
        estado: "ejecutada",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zone-tasks"] });
    },
    onError: (err: Error) => toast.error(err.message || t("zone.tablet.finishError")),
  });

  const addNoteMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.updateTask(taskId, {
        observaciones: noteText,
      } as Parameters<typeof api.updateTask>[1]),
    onSuccess: () => {
      setSelectedTaskForNote(null);
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["zone-tasks"] });
    },
    onError: (err: Error) => toast.error(err.message || t("zone.tablet.noteError")),
  });

  const pendingTasks = tasks.filter((t) => t.estado === "programada" || t.estado === "retrasada");
  const inProgressTasks = tasks.filter((t) => t.estado === "pausada");
  const completedTasks = tasks.filter((t) => t.estado === "ejecutada");

  const showTreatmentSection = zoneKey === "recria" && canManageTreatments;

  return (
    <div className="space-y-5">
      {/* Action Buttons */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {canCreateIncidents && (
          <button
            type="button"
            onClick={onCreateIncident}
            className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[14px] border border-app-border bg-white font-bold text-state-atencion shadow-card hover:border-state-atencion/50 transition"
          >
            <Plus className="h-7 w-7" />
            {t("zone.incidentModal.title")}
          </button>
        )}

        {showTreatmentSection && (
          <button
            type="button"
            onClick={onShowTreatment}
            className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[14px] border border-app-border bg-white font-bold text-brand-dark shadow-card hover:border-brand/50 transition"
          >
            <Plus className="h-7 w-7" />
            {t("zone.treatmentModal.title")}
          </button>
        )}

        <div className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[14px] border border-app-border bg-white text-center text-xs font-semibold text-app-dim shadow-card">
          <span>{t("zone.tablet.totalTasks")}</span>
          <span className="font-heading text-2xl font-bold text-app-text">{tasks.length}</span>
        </div>
      </div>

      {/* Pending Tasks */}
      <div>
        <h3 className="mb-3 font-heading text-base font-bold text-app-text">
          {t("zones.pendingTasks")} {pendingTasks.length > 0 && <span className="text-state-info">({pendingTasks.length})</span>}
        </h3>
        {pendingTasks.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-app-border bg-app-bg py-8 text-center text-sm text-app-dim">
            {t("zone.noPendingTasks")}
          </p>
        ) : (
          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onStart={() => startTaskMutation.mutate(task.id)}
                onCreateIncident={onCreateIncident}
                onComplete={() => completeTaskMutation.mutate(task.id)}
                onAddNote={() => setSelectedTaskForNote(task.id)}
                canStart={canStartTasks}
                canCreateIncidents={canCreateIncidents}
                section="pending"
              />
            ))}
          </div>
        )}
      </div>

      {/* In Progress Tasks */}
      <div>
        <h3 className="mb-3 font-heading text-base font-bold text-app-text">
          {t("zone.tablet.inProgressTasks")} {inProgressTasks.length > 0 && <span className="text-brand-dark">({inProgressTasks.length})</span>}
        </h3>
        {inProgressTasks.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-app-border bg-app-bg py-8 text-center text-sm text-app-dim">
            {t("zone.tablet.noInProgressTasks")}
          </p>
        ) : (
          <div className="space-y-3">
            {inProgressTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onStart={() => startTaskMutation.mutate(task.id)}
                onCreateIncident={onCreateIncident}
                onComplete={() => completeTaskMutation.mutate(task.id)}
                onAddNote={() => setSelectedTaskForNote(task.id)}
                canStart={false}
                canCreateIncidents={canCreateIncidents}
                section="inProgress"
              />
            ))}
          </div>
        )}
      </div>

      {/* Completadas — auditoria post-implementacion (hallazgo 4.8):
          completedTasks se calculaba pero nunca se pintaba, asi que el
          Kanban de la tablet no tenia columna de "hechas". Solo lectura:
          una tarea ejecutada no necesita botones de accion. */}
      <div>
        <h3 className="mb-3 font-heading text-base font-bold text-app-text">
          {t("leanfarming.completed")} {completedTasks.length > 0 && <span className="text-state-ok">({completedTasks.length})</span>}
        </h3>
        {completedTasks.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-app-border bg-app-bg py-8 text-center text-sm text-app-dim">
            {t("zone.tablet.noCompletedTasks")}
          </p>
        ) : (
          <div className="space-y-3">
            {completedTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-app-border bg-app-bg p-4 opacity-80">
                <div className="min-w-0">
                  <p className="truncate font-bold text-app-text">{task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}</p>
                  <p className="mt-1 text-xs text-app-dim">{formatTime(task.fecha_programada, dateLocale(i18n.language))}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-state-ok" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note Modal */}
      {selectedTaskForNote && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-[14px] bg-white shadow-panel">
            <div className="border-b border-app-border px-5 py-4">
              <h2 className="font-heading text-lg font-bold text-app-text">{t("zone.tablet.addObservation")}</h2>
            </div>
            <div className="space-y-4 p-5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t("zone.tablet.observationPlaceholder")}
                rows={4}
                className="w-full resize-none rounded-[10px] border border-app-border px-3 py-2 text-sm"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaskForNote(null);
                    setNoteText("");
                  }}
                  className="tablet-touch flex-1 rounded-[10px] border border-app-border px-4 py-2 text-sm font-bold text-app-text transition hover:bg-app-bg"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => addNoteMutation.mutate(selectedTaskForNote)}
                  disabled={!noteText.trim() || addNoteMutation.isPending}
                  className="tablet-touch flex-1 rounded-[10px] bg-brand-dark px-4 py-2 text-sm font-bold text-white transition hover:bg-sidebar-bg disabled:opacity-50"
                >
                  {addNoteMutation.isPending ? t("leanfarming.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

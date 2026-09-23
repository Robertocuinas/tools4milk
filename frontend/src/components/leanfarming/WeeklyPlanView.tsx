"use client";

import { ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateLocale } from "@/lib/i18n";
import type { Employee, Task, TaskPriority, Zone } from "@/lib/types";
import { TaskAssignmentModal } from "./TaskAssignmentModal";

interface WeeklyPlanViewProps {
  tasks: Task[];
  zones: Zone[];
  employees: Employee[];
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
}

type ShiftKey = "manana" | "tarde" | "noche";

const STATE_BADGES: Record<Task["estado"], string> = {
  retrasada: "bg-state-critica/10 text-state-critica",
  programada: "bg-state-info/10 text-state-info",
  pausada: "bg-state-atencion/10 text-state-atencion",
  ejecutada: "bg-state-ok/10 text-state-ok",
  cancelada: "bg-app-bg text-app-dim",
};

const PRIORITY_BADGES: Record<TaskPriority, string> = {
  urgente: "bg-state-critica/15 text-state-critica",
  alta: "bg-state-atencion/15 text-state-atencion",
  normal: "bg-app-bg text-app-dim",
  baja: "bg-app-bg text-app-dim",
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getShift(task: Task): ShiftKey {
  const hour = new Date(task.fecha_programada).getHours();
  if (hour >= 22 || hour < 6) return "noche";
  return hour < 14 ? "manana" : "tarde";
}

function currentShift(): ShiftKey {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return "noche";
  return hour < 14 ? "manana" : "tarde";
}

function orderedTasks(tasks: Task[]) {
  const order: Record<Task["estado"], number> = { retrasada: 0, programada: 1, pausada: 1, ejecutada: 2, cancelada: 3 };
  return [...tasks].sort((a, b) => order[a.estado] - order[b.estado] || Number(b.es_urgente) - Number(a.es_urgente));
}

function TaskItem({ task, zones, employees, onClick }: { task: Task; zones: Zone[]; employees: Employee[]; onClick: () => void }) {
  const { t } = useTranslation();
  const zone = zones.find((item) => item.id === task.zona_id);
  const employee = employees.find((item) => item.id === task.empleado_id);
  const priorityLabel: Record<TaskPriority, string> = {
    urgente: t("leanfarming.priorityUrgent"), alta: t("leanfarming.priorityHigh"), normal: t("leanfarming.priorityNormal"), baja: t("leanfarming.priorityLow"),
  };
  const stateLabel: Record<Task["estado"], string> = {
    retrasada: t("leanfarming.stateDelayed"), programada: t("leanfarming.stateScheduled"), pausada: t("leanfarming.stateInProgress"), ejecutada: t("leanfarming.stateFinished"), cancelada: t("leanfarming.stateCancelled"),
  };

  return (
    <button type="button" onClick={onClick} className="w-full rounded-[10px] border border-app-border bg-white px-3 py-2.5 text-start shadow-card transition hover:border-brand/30 hover:shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-app-text">{task.tarea_catalogo?.nombre ?? t("leanfarming.taskFallback")}</p>
          <p className="mt-1 truncate text-xs text-app-dim">{zone?.nombre ?? t("leanfarming.noZone")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_BADGES[task.estado]}`}>{stateLabel[task.estado]}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_BADGES[task.prioridad]}`}>{priorityLabel[task.prioridad]}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-app-dim">
        <UserRound className="h-3 w-3" />
        {employee ? `${employee.nombre}${employee.apellidos ? ` ${employee.apellidos}` : ""}` : t("leanfarming.unassigned")}
      </div>
    </button>
  );
}

function ShiftBlock({ shift, tasks, zones, employees, isCurrent, onTaskClick }: {
  shift: ShiftKey; tasks: Task[]; zones: Zone[]; employees: Employee[]; isCurrent: boolean; onTaskClick: (task: Task) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(isCurrent);
  const labels: Record<ShiftKey, string> = { manana: t("leanfarming.shiftMorning"), tarde: t("leanfarming.shiftAfternoon"), noche: t("leanfarming.shiftNight") };

  return (
    <div className="rounded-[10px] border border-app-border bg-app-bg/40">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-3 py-2.5 text-start">
        <span className="text-xs font-bold text-app-text">{labels[shift]}</span>
        <span className="flex items-center gap-2 text-xs text-app-dim">{tasks.length}{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-app-border p-2">
          {orderedTasks(tasks).map((task) => <TaskItem key={task.id} task={task} zones={zones} employees={employees} onClick={() => onTaskClick(task)} />)}
          {tasks.length === 0 && <p className="py-2 text-center text-xs text-app-dim">{t("leanfarming.noTasksShort")}</p>}
        </div>
      )}
    </div>
  );
}

export function WeeklyPlanView({ tasks, zones, employees, onTaskUpdate }: WeeklyPlanViewProps) {
  const { t, i18n } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const weekDates = useMemo(() => {
    const reference = new Date();
    reference.setDate(reference.getDate() + weekOffset * 7);
    const monday = new Date(reference);
    monday.setDate(reference.getDate() - ((reference.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [weekOffset]);
  const tasksByDay = useMemo(() => {
    const byDay = new Map(weekDates.map((date) => [localDateKey(date), [] as Task[]]));
    for (const task of tasks) byDay.get(task.fecha_programada.slice(0, 10))?.push(task);
    return byDay;
  }, [tasks, weekDates]);
  const today = localDateKey(new Date());
  const range = `${weekDates[0].getDate()}–${weekDates[6].getDate()} ${weekDates[6].toLocaleDateString(dateLocale(i18n.language), { month: "long" })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekOffset((value) => value - 1)} aria-label={t("leanfarming.previousWeek")} className="rounded-[8px] border border-app-border bg-white p-1.5 text-app-dim hover:text-brand"><ChevronDown className="h-4 w-4 rotate-90 rtl:-rotate-90" /></button>
          <span className="text-sm font-semibold text-app-text">{range}</span>
          <button type="button" onClick={() => setWeekOffset((value) => value + 1)} aria-label={t("leanfarming.nextWeek")} className="rounded-[8px] border border-app-border bg-white p-1.5 text-app-dim hover:text-brand"><ChevronDown className="h-4 w-4 -rotate-90 rtl:rotate-90" /></button>
        </div>
        {weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} className="text-xs font-bold text-brand-dark hover:underline">{t("leanfarming.today")}</button>}
      </div>

      <div className="space-y-3">
        {weekDates.map((date) => {
          const dateKey = localDateKey(date);
          return <DayBlock key={dateKey} date={date} tasks={tasksByDay.get(dateKey) ?? []} zones={zones} employees={employees} defaultOpen={weekOffset === 0 && dateKey === today} onTaskClick={setSelectedTask} />;
        })}
      </div>

      {selectedTask && <TaskAssignmentModal task={selectedTask} employees={employees} zones={zones} onAssign={(employeeId) => { onTaskUpdate(selectedTask.id, { empleado_id: employeeId }); setSelectedTask(null); }} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}

function DayBlock({ date, tasks, zones, employees, defaultOpen, onTaskClick }: {
  date: Date; tasks: Task[]; zones: Zone[]; employees: Employee[]; defaultOpen: boolean; onTaskClick: (task: Task) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const isToday = localDateKey(date) === localDateKey(new Date());
  const byShift: Record<ShiftKey, Task[]> = { manana: [], tarde: [], noche: [] };
  for (const task of tasks) byShift[getShift(task)].push(task);
  const label = date.toLocaleDateString(dateLocale(i18n.language), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className={`overflow-hidden rounded-[14px] border bg-white shadow-card ${isToday ? "border-brand/30" : "border-app-border"}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3.5 text-start hover:bg-app-bg/50">
        <div><p className={`text-sm font-bold capitalize ${isToday ? "text-brand-dark" : "text-app-text"}`}>{label}</p><p className="text-xs text-app-dim">{t("leanfarming.taskCountAbbr", { count: tasks.length })}</p></div>
        <div className="flex items-center gap-2">{tasks.some((task) => task.estado === "retrasada") && <span className="rounded-full bg-state-critica/10 px-2 py-0.5 text-[10px] font-bold text-state-critica">{t("leanfarming.stateDelayed")}</span>}{open ? <ChevronDown className="h-4 w-4 text-app-dim" /> : <ChevronRight className="h-4 w-4 text-app-dim rtl:-scale-x-100" />}</div>
      </button>
      {open && <div className="space-y-2 border-t border-app-border p-3">{(["manana", "tarde", "noche"] as ShiftKey[]).map((shift) => <ShiftBlock key={shift} shift={shift} tasks={byShift[shift]} zones={zones} employees={employees} isCurrent={isToday && currentShift() === shift} onTaskClick={onTaskClick} />)}</div>}
    </div>
  );
}

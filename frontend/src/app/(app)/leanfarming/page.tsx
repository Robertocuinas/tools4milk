"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, BookOpen, Calendar, CheckCircle2, Clock, LayoutGrid, ListTodo } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskCatalogView } from "@/components/leanfarming/TaskCatalogView";
import { WeeklyPlanView } from "@/components/leanfarming/WeeklyPlanView";
import { ZonePlanView } from "@/components/leanfarming/ZonePlanView";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { TV_REFETCH, TV_STALE } from "@/lib/tv-constants";
import type { Task } from "@/lib/types";

type LeanTab = "weekly" | "zones" | "catalog";

export default function LeanFarmingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [leanTab, setLeanTab] = useState<LeanTab>("weekly");
  const farmSettings = useQuery({ queryKey: ["farm-settings"], queryFn: api.farmSettings, staleTime: TV_STALE.CATALOG, refetchInterval: 60_000 });
  const nightEnabled = farmSettings.data?.turno_noche_habilitado ?? true;

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: api.zones,
    staleTime: TV_STALE.CATALOG,
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks-all-lean"],
    // La planificación semanal necesita incluir la semana actual aunque haya
    // histórico anterior. El backend ordena cronológicamente, por lo que el
    // límite operativo anterior podía dejar fuera tareas recién programadas.
    queryFn: () => api.tasks({ limit: 5000 }),
    staleTime: TV_STALE.NORMAL,
    refetchInterval: TV_REFETCH.NORMAL,
  });
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees(),
    staleTime: TV_STALE.CATALOG,
  });
  const catalogQuery = useQuery({
    queryKey: ["task-catalog"],
    queryFn: () => api.taskCatalog(),
    staleTime: TV_STALE.CATALOG,
  });

  const updateTaskMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Task> }) => api.updateTask(data.id, data.updates),
    onSuccess: () => toast.success(t("leanfarming.toastTaskUpdated")),
    onError: (err: Error) => toast.error(err.message || t("leanfarming.toastUpdateTaskError")),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks-all-lean"] });
      queryClient.invalidateQueries({ queryKey: ["employee-recommendations"] });
    },
  });
  const createCatalogMutation = useMutation({
    mutationFn: (task: Record<string, unknown>) => api.createTaskCatalog(task),
    onSuccess: () => toast.success(t("leanfarming.toastCatalogTaskCreated")),
    onError: (err: Error) => toast.error(err.message || t("leanfarming.toastCreateCatalogError")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["task-catalog"] }),
  });
  const updateCatalogMutation = useMutation({
    mutationFn: (data: { id: string; updates: Record<string, unknown> }) => api.updateTaskCatalog(data.id, data.updates),
    onSuccess: () => toast.success(t("leanfarming.toastCatalogTaskUpdated")),
    onError: (err: Error) => toast.error(err.message || t("leanfarming.toastUpdateCatalogError")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["task-catalog"] }),
  });
  const deleteCatalogMutation = useMutation({
    mutationFn: (id: string) => api.deleteTaskCatalog(id),
    onSuccess: () => toast.success(t("leanfarming.toastCatalogTaskDeleted")),
    onError: (err: Error) => toast.error(err.message || t("leanfarming.toastDeleteCatalogError")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["task-catalog"] }),
  });

  const tasks = tasksQuery.data ?? [];
  const totals = {
    retrasadas: tasks.filter((task) => task.estado === "retrasada").length,
    urgentes: tasks.filter((task) => task.es_urgente && task.estado !== "ejecutada").length,
    programadas: tasks.filter((task) => task.estado === "programada").length,
    ejecutadas: tasks.filter((task) => task.estado === "ejecutada").length,
  };

  const tabs = [
    { key: "weekly" as const, label: t("leanfarming.tabWeekly"), Icon: Calendar },
    { key: "zones" as const, label: t("leanfarming.viewZones"), Icon: LayoutGrid },
    { key: "catalog" as const, label: t("leanfarming.tabCatalog"), Icon: BookOpen },
  ];

  return (
    <div className="min-h-full bg-app-bg text-app-text">
      <PageHeader eyebrow={t("leanfarming.eyebrow")} title={t("leanfarming.title")} EyebrowIcon={ListTodo} />

      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <BentoGrid className="xl:!grid-cols-2">
          <BentoTile><KpiCard label={t("leanfarming.totalDelayed")} value={totals.retrasadas} Icon={AlertOctagon} tone={totals.retrasadas > 0 ? "critical" : "success"} /></BentoTile>
          <BentoTile><KpiCard label={t("leanfarming.totalUrgent")} value={totals.urgentes} Icon={ListTodo} tone={totals.urgentes > 0 ? "warning" : "success"} /></BentoTile>
          <BentoTile><KpiCard label={t("leanfarming.totalScheduled")} value={totals.programadas} Icon={Clock} tone="info" /></BentoTile>
          <BentoTile><KpiCard label={t("leanfarming.totalExecuted")} value={totals.ejecutadas} Icon={CheckCircle2} tone="success" /></BentoTile>
        </BentoGrid>

        <section className="space-y-4" aria-label={t("leanfarming.title")}>
          <div className="flex flex-wrap gap-2 border-b border-app-border pb-4" role="tablist">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                id={`lean-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={leanTab === key}
                aria-controls={`lean-panel-${key}`}
                onClick={() => setLeanTab(key)}
                className={`inline-flex items-center gap-2 rounded-t-[10px] border-b-2 px-4 py-2 text-sm font-semibold transition ${
                  leanTab === key ? "border-brand text-brand-dark" : "border-transparent text-app-dim hover:text-app-text"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {tasksQuery.isLoading || zones.isLoading || employeesQuery.isLoading ? (
            <div className="space-y-4" aria-busy="true">
              <div className="h-40 animate-pulse rounded-[10px] bg-white" />
              <div className="h-40 animate-pulse rounded-[10px] bg-white" />
            </div>
          ) : leanTab === "weekly" ? (
            <div id="lean-panel-weekly" role="tabpanel" aria-labelledby="lean-tab-weekly">
              <WeeklyPlanView tasks={tasks} zones={zones.data ?? []} employees={employeesQuery.data ?? []} nightEnabled={nightEnabled} onTaskUpdate={(id, updates) => updateTaskMutation.mutate({ id, updates })} />
            </div>
          ) : leanTab === "zones" ? (
            <div id="lean-panel-zones" role="tabpanel" aria-labelledby="lean-tab-zones">
              <ZonePlanView tasks={tasks} zones={zones.data ?? []} employees={employeesQuery.data ?? []} catalog={catalogQuery.data ?? []} />
            </div>
          ) : (
            <div id="lean-panel-catalog" role="tabpanel" aria-labelledby="lean-tab-catalog">
              <TaskCatalogView
                catalog={catalogQuery.data ?? []}
                zones={zones.data ?? []}
                onCreateTask={(task) => createCatalogMutation.mutate(task)}
                onUpdateTask={(id, updates) => updateCatalogMutation.mutate({ id, updates })}
                onDeleteTask={(id) => deleteCatalogMutation.mutate(id)}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

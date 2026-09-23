"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/common/Pagination";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { BentoGrid, BentoTile } from "@/components/ui/bento-grid";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { VoiceToTextButton } from "@/components/ui/voice-to-text-button";
import { api } from "@/lib/api";
import { extractionApi } from "@/lib/api-extraction";
import { dateLocale, enumLabel } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE, getSkip } from "@/lib/pagination";
import { usePermissions } from "@/lib/use-permissions";
import type { CreateOrderPayload, Order, OrderStatus } from "@/lib/types";
import type { ExtractionResponse, Suggestion } from "@/lib/types-extraction";

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_SEQUENCE: OrderStatus[] = [
  "solicitado",
  "aprobado",
  "en_transito",
  "recibido",
  "cancelado",
];

const STATUS_STYLES: Record<OrderStatus, string> = {
  solicitado: "bg-state-info/15 text-state-info border-state-info/30",
  aprobado: "bg-state-ok/15 text-state-ok border-state-ok/30",
  en_transito: "bg-state-atencion/15 text-state-atencion border-state-atencion/30",
  recibido: "bg-brand/12 text-brand-dark border-brand/20",
  cancelado: "bg-state-neutral/10 text-state-neutral border-state-neutral/20",
};

// Estado → próximos estados válidos
const NEXT_STATES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  solicitado: ["aprobado", "cancelado"],
  aprobado: ["en_transito", "cancelado"],
  en_transito: ["recibido", "cancelado"],
};

const NEXT_BTN_STYLE: Partial<Record<OrderStatus, string>> = {
  aprobado: "bg-state-ok/15 text-state-ok hover:bg-state-ok/25",
  en_transito: "bg-state-atencion/15 text-state-atencion hover:bg-state-atencion/25",
  recibido: "bg-brand/12 text-brand-dark hover:bg-brand/15",
  cancelado: "bg-state-neutral/10 text-state-neutral hover:bg-state-neutral/20",
};

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number | null | undefined, locale: string) {
  if (value == null) return "-";
  return value.toLocaleString(locale, { style: "currency", currency: "EUR" });
}

function suggestedText(suggestion: Suggestion<string>): string | null {
  return suggestion.value?.trim() ? suggestion.value.trim() : null;
}

function suggestedNumber(suggestion: Suggestion<number>): number | null {
  return suggestion.value;
}

// ── Sub-components ───────────────────────────────────────────────────────

function StatusBadge({ estado }: { estado: OrderStatus }) {
  // Suscripcion al cambio de idioma para re-renderizar la etiqueta
  useTranslation();
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase ${STATUS_STYLES[estado]}`}>
      {enumLabel("orderStatus", estado)}
    </span>
  );
}

function StatusWorkflow({ estado }: { estado: OrderStatus }) {
  useTranslation();
  const active = STATUS_SEQUENCE.indexOf(estado);
  const isCancelled = estado === "cancelado";
  const steps = STATUS_SEQUENCE.filter((s) => s !== "cancelado");

  if (isCancelled) {
    return (
      <div className="flex items-center gap-1 text-xs text-state-neutral">
        <span className="rounded-full bg-state-neutral/10 px-2 py-0.5 font-bold">{enumLabel("orderStatus", "cancelado")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const stepIndex = STATUS_SEQUENCE.indexOf(step);
        const isDone = stepIndex < active;
        const isCurrent = stepIndex === active;
        return (
          <div key={step} className="flex items-center gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isCurrent
                  ? STATUS_STYLES[step].replace("border-", "").replace(/border-\S+/g, "")
                  : isDone
                    ? "bg-state-ok/10 text-state-ok"
                    : "bg-app-bg text-app-dim"
              }`}
            >
              {enumLabel("orderStatus", step)}
            </span>
            {index < steps.length - 1 && (
              <ArrowRight className={`h-3 w-3 rtl:-scale-x-100 ${isDone ? "text-state-ok" : "text-app-dim"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Create order modal ───────────────────────────────────────────────────

function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [insumo, setInsumo] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [costeEstimado, setCosteEstimado] = useState("");
  const [notas, setNotas] = useState("");
  const [dictatedText, setDictatedText] = useState<string | null>(null);
  const [suggestedOrder, setSuggestedOrder] = useState<NonNullable<ExtractionResponse["pedido"]> | null>(null);
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);

  const applySuggestedProduct = (
    order: NonNullable<ExtractionResponse["pedido"]>,
    productIndex: number,
  ) => {
    const product = order.productos[productIndex];
    if (!product) return;

    const suggestedSupply = suggestedText(product.insumo);
    const suggestedQuantity = suggestedNumber(product.cantidad);
    const suggestedUnit = suggestedText(product.unidad);

    // Campos sin una sugerencia concreta se mantienen para que la persona
    // los revise o complete; el dictado nunca genera pedidos por sí solo.
    if (suggestedSupply) setInsumo(suggestedSupply);
    if (suggestedQuantity != null) setCantidad(String(suggestedQuantity));
    if (suggestedUnit) setUnidad(suggestedUnit);
    setSelectedProductIndex(productIndex);
  };

  const extractionMutation = useMutation({
    mutationFn: (text: string) => extractionApi.suggest("pedido", text),
    onSuccess: (response) => {
      setDictatedText(response.texto);
      const order = response.pedido;
      setSuggestedOrder(order);
      setSelectedProductIndex(null);

      if (!order) return;

      const suggestedSupplier = suggestedText(order.proveedor);
      const suggestedNotes = suggestedText(order.observaciones);
      if (suggestedSupplier) setProveedor(suggestedSupplier);
      if (suggestedNotes) {
        setNotas((current) => (current ? `${current}\n${suggestedNotes}` : suggestedNotes));
      }

      // Una única línea puede prellenarse para su revisión. Con varias líneas
      // se exige una selección explícita para que nunca se creen pedidos extra.
      if (order.productos.length === 1) applySuggestedProduct(order, 0);
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateOrderPayload) => api.createOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(t("orders.toastCreated"));
      onClose();
    },
  });

  const canSubmit = insumo.trim() && cantidad.trim() && !Number.isNaN(Number(cantidad));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-order-title"
        className="w-full max-w-lg rounded-t-[20px] border border-app-border bg-white shadow-panel sm:rounded-[14px]"
      >
        <div className="flex items-center justify-between border-b border-app-border px-6 py-4">
          <h2 id="create-order-title" className="font-heading text-lg font-bold text-app-text">{t("orders.newOrder")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="text-app-dim hover:text-app-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <section
            aria-labelledby="order-voice-heading"
            className="rounded-[10px] border border-app-border bg-app-bg/45 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="order-voice-heading" className="text-sm font-bold text-app-text">
                  {t("orders.voice.title")}
                </h3>
                <p className="mt-0.5 text-xs text-app-dim">{t("orders.voice.description")}</p>
              </div>
              <VoiceToTextButton
                disabled={extractionMutation.isPending || mutation.isPending}
                onTranscribed={(text) => {
                  setDictatedText(text);
                  setSuggestedOrder(null);
                  setSelectedProductIndex(null);
                  extractionMutation.mutate(text);
                }}
              />
            </div>

            {extractionMutation.isPending && (
              <p role="status" className="mt-3 text-xs font-semibold text-app-dim">
                {t("orders.voice.extracting")}
              </p>
            )}

            {extractionMutation.isError && (
              <p role="alert" className="mt-3 text-xs font-semibold text-state-critica">
                {t("orders.voice.extractionError")}
              </p>
            )}

            {dictatedText && !extractionMutation.isPending && (
              <div className="mt-3 space-y-2 border-t border-app-border pt-3">
                <p className="text-xs text-app-dim">
                  <span className="font-bold text-app-text">{t("orders.voice.transcriptLabel")}</span>{" "}
                  {dictatedText}
                </p>

                {suggestedOrder ? (
                  <>
                    <p className="text-xs font-semibold text-app-dim">{t("orders.voice.reviewRequired")}</p>
                    {suggestedOrder.productos.length > 1 && (
                      <div className="space-y-2" role="group" aria-label={t("orders.voice.productSelectionLabel")}>
                        <p className="text-xs font-bold text-app-text">{t("orders.voice.selectOneProduct")}</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestedOrder.productos.map((product, index) => {
                            const productName = suggestedText(product.insumo) ?? t("orders.voice.ambiguousProduct");
                            const productQuantity = suggestedNumber(product.cantidad);
                            const productUnit = suggestedText(product.unidad);
                            const isSelected = selectedProductIndex === index;
                            return (
                              <button
                                key={`${productName}-${index}`}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => applySuggestedProduct(suggestedOrder, index)}
                                className={`rounded-[8px] border px-3 py-2 text-left text-xs font-semibold transition ${
                                  isSelected
                                    ? "border-brand bg-brand/10 text-brand-dark"
                                    : "border-app-border bg-white text-app-text hover:border-brand/40"
                                }`}
                              >
                                {productName}
                                {productQuantity != null && ` · ${productQuantity}${productUnit ? ` ${productUnit}` : ""}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {suggestedOrder.productos.length === 0 && (
                      <p className="text-xs font-semibold text-state-atencion">{t("orders.voice.noProductSuggestion")}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs font-semibold text-state-atencion">{t("orders.voice.noOrderSuggestion")}</p>
                )}
              </div>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("orders.fieldSupply")}
              </span>
              <input
                type="text"
                value={insumo}
                onChange={(e) => setInsumo(e.target.value)}
                placeholder={t("orders.fieldSupplyPlaceholder")}
                className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("orders.fieldQuantity")}
              </span>
              <input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("orders.fieldUnit")}
              </span>
              <input
                type="text"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder={t("orders.fieldUnitPlaceholder")}
                className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("orders.fieldSupplier")}
              </span>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("orders.fieldEstimatedCost")}
              </span>
              <input
                type="number"
                value={costeEstimado}
                onChange={(e) => setCosteEstimado(e.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-[10px] border border-app-border bg-white px-3 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.14em] text-app-dim">
                {t("orders.fieldDescriptionNotes")}
              </span>
              <textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full resize-none rounded-[10px] border border-app-border bg-white px-3 py-2.5 text-sm text-app-text outline-none placeholder:text-app-dim focus:border-brand"
              />
            </label>
          </div>

          {mutation.isError && (
            <p className="rounded-[10px] bg-state-critica/10 px-3 py-2 text-sm text-state-critica">
              {mutation.error.message}
            </p>
          )}

          <button
            type="button"
            disabled={!canSubmit || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                insumo: insumo.trim(),
                cantidad: Number(cantidad),
                unidad: unidad.trim() || undefined,
                proveedor: proveedor.trim() || undefined,
                coste_estimado: costeEstimado ? Number(costeEstimado) : undefined,
                notas: notas.trim() || undefined,
              })
            }
            className="w-full rounded-[10px] bg-brand-dark py-3.5 font-heading text-base font-bold text-white shadow-brand transition hover:bg-sidebar-bg disabled:opacity-50"
          >
            {mutation.isPending ? t("orders.creating") : t("orders.createOrder")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order card ───────────────────────────────────────────────────────────

function OrderCard({
  order,
  onStatusChange,
  updatingId,
  canManage,
}: {
  order: Order;
  onStatusChange: (id: string, estado: OrderStatus) => void;
  updatingId: string | null;
  canManage: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const [expanded, setExpanded] = useState(false);
  const isUpdating = updatingId === order.id;
  const nextStates = NEXT_STATES[order.estado] ?? [];

  return (
    <div className="rounded-[10px] border border-app-border bg-white">
      <button
        type="button"
        className="w-full px-4 py-4 text-start"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge estado={order.estado} />
              {order.unidad && (
                <span className="text-xs text-app-dim">{order.cantidad} {order.unidad}</span>
              )}
            </div>
            <h2 className="mt-2 font-heading text-base font-bold text-app-text">
              {order.insumo}
            </h2>
            <div className="mt-1.5">
              <StatusWorkflow estado={order.estado} />
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-app-dim">
              <span>{t("orders.requestedAt", { date: formatDate(order.ts_solicitud, locale) })}</span>
              {order.coste_estimado != null && (
                <span>{t("orders.estimatedLabel")} <span className="text-app-text">{formatCurrency(order.coste_estimado, locale)}</span></span>
              )}
              {order.proveedor && <span>{t("orders.supplierLabel")} <span className="text-app-text">{order.proveedor}</span></span>}
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-app-dim" />
          ) : (
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-app-dim" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-app-border px-4 py-4">
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            {order.descripcion && (
              <div className="sm:col-span-2">
                <span className="block text-app-dim">{t("orders.description")}</span>
                <span className="text-app-text">{order.descripcion}</span>
              </div>
            )}
            {order.ts_aprobacion && (
              <div>
                <span className="block text-app-dim">{enumLabel("orderStatus", "aprobado")}</span>
                <span className="text-app-text">{formatDate(order.ts_aprobacion, locale)}</span>
              </div>
            )}
            {order.ts_recepcion && (
              <div>
                <span className="block text-app-dim">{enumLabel("orderStatus", "recibido")}</span>
                <span className="text-app-text">{formatDate(order.ts_recepcion, locale)}</span>
              </div>
            )}
            {order.coste_real != null && (
              <div>
                <span className="block text-app-dim">{t("orders.realCost")}</span>
                <span className="text-app-text">{formatCurrency(order.coste_real, locale)}</span>
              </div>
            )}
            {order.notas && (
              <div className="sm:col-span-2">
                <span className="block text-app-dim">{t("orders.notes")}</span>
                <span className="text-app-text">{order.notas}</span>
              </div>
            )}
          </div>

          {canManage && nextStates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nextStates.map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onStatusChange(order.id, next)}
                  className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${NEXT_BTN_STYLE[next] ?? ""}`}
                >
                  {isUpdating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                  )}
                  {enumLabel("orderStatus", next)}
                </button>
              ))}
            </div>
          )}

          {order.estado === "recibido" && (
            <div className="rounded-[10px] bg-brand/8 px-3 py-2 text-xs font-bold text-brand-dark">
              {t("orders.receivedBanner")}
            </div>
          )}
          {order.estado === "cancelado" && (
            <div className="rounded-[10px] bg-state-neutral/10 px-3 py-2 text-xs font-bold text-state-neutral">
              {t("orders.cancelledBanner")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

type FilterStatus = OrderStatus | "todas";

export default function OrdersPage() {
  const { t } = useTranslation();
  const { role, can } = usePermissions();
  const canViewOrders = can("manage_orders");
  const canCreateOrder = can("create_order");

  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("todas");
  const [page, setPage] = useState(1);
  // Auto-open creation modal when ?new=1 is in the URL
  const [showCreate, setShowCreate] = useState(() => searchParams.get("new") === "1");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const pageSize = DEFAULT_PAGE_SIZE;

  const ordersQuery = useQuery({
    queryKey: ["orders", statusFilter, page],
    queryFn: () =>
      api.orders({
        skip: getSkip(page, pageSize),
        limit: pageSize + 1,
        ...(statusFilter !== "todas" ? { estado: statusFilter } : {}),
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: canViewOrders,
  });

  // Load all orders for KPI stats (cached separately)
  const allOrdersQuery = useQuery({
    queryKey: ["orders-all"],
    queryFn: () => api.orders({ limit: 500 }),
    staleTime: 30_000,
    enabled: canViewOrders,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: OrderStatus }) =>
      api.updateOrderStatus(id, estado),
    onMutate: ({ id }) => setUpdatingId(id),
    onSuccess: (_, { estado }) => {
      toast.success(t("orders.toastStatusChanged", { status: enumLabel("orderStatus", estado).toLowerCase() }));
    },
    onError: (err: Error) => {
      toast.error(err.message || t("orders.toastStatusError"));
    },
    onSettled: () => {
      setUpdatingId(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-all"] });
    },
  });

  const pageData = ordersQuery.data?.pedidos ?? [];
  const hasNext = pageData.length > pageSize;
  const pageItems = pageData.slice(0, pageSize);
  const allItems = useMemo(() => allOrdersQuery.data?.pedidos ?? [], [allOrdersQuery.data]);

  const stats = useMemo(() => {
    const count = (s: OrderStatus) => allItems.filter((o) => o.estado === s).length;
    return {
      total: allItems.length,
      solicitado: count("solicitado"),
      aprobado: count("aprobado"),
      en_transito: count("en_transito"),
      recibido: count("recibido"),
      cancelado: count("cancelado"),
    };
  }, [allItems]);

  const statusTabs: { key: FilterStatus; label: string; count: number }[] = [
    { key: "todas", label: t("orders.tabs.todas"), count: stats.total },
    { key: "solicitado", label: t("orders.tabs.solicitado"), count: stats.solicitado },
    { key: "aprobado", label: t("orders.tabs.aprobado"), count: stats.aprobado },
    { key: "en_transito", label: t("orders.tabs.en_transito"), count: stats.en_transito },
    { key: "recibido", label: t("orders.tabs.recibido"), count: stats.recibido },
    { key: "cancelado", label: t("orders.tabs.cancelado"), count: stats.cancelado },
  ];

  if (!canViewOrders) {
    return (
      <div className="min-h-full">
        <PageHeader eyebrow={t("orders.eyebrow")} title={t("nav.orders")} EyebrowIcon={Package} />
        <AccessDenied
          role={role}
          requiredCapability="manage_orders"
          description={t("orders.accessDeniedDescription")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}

      <PageHeader eyebrow={t("orders.eyebrow")} title={t("nav.orders")} EyebrowIcon={Package}>
        {canCreateOrder && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-brand-dark px-4 py-2 text-sm font-bold text-white shadow-brand transition hover:bg-sidebar-bg"
            >
              <Plus className="h-4 w-4" />
              {t("orders.newOrder")}
            </button>
          </div>
        )}
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* KPIs */}
        {allOrdersQuery.isSuccess && (
          <BentoGrid>
            <BentoTile footprint={stats.en_transito > 0 ? "2x1" : "1x1"}>
              <KpiCard label={t("orders.tabs.en_transito")} value={stats.en_transito} tone="warning" sublabel={t("orders.kpiInTransitSublabel")} featured={stats.en_transito > 0} />
            </BentoTile>
            <BentoTile footprint={stats.solicitado > 0 ? "2x1" : "1x1"}>
              <KpiCard label={t("orders.tabs.solicitado")} value={stats.solicitado} tone="info" sublabel={t("orders.kpiRequestedSublabel")} featured={stats.solicitado > 0} />
            </BentoTile>
            <BentoTile><KpiCard label={t("orders.tabs.aprobado")} value={stats.aprobado} tone="success" /></BentoTile>
            <BentoTile><KpiCard label={t("orders.tabs.recibido")} value={stats.recibido} tone="success" /></BentoTile>
            <BentoTile><KpiCard label={t("orders.tabs.cancelado")} value={stats.cancelado} tone="muted" /></BentoTile>
            <BentoTile><KpiCard label={t("orders.kpiTotal")} value={stats.total} tone="default" /></BentoTile>
          </BentoGrid>
        )}

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {statusTabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setStatusFilter(key); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold transition ${
                statusFilter === key
                  ? "bg-app-bg text-brand-dark"
                  : "bg-white text-app-dim hover:bg-app-bg"
              }`}
            >
              {label}
              <span className="rounded-full bg-app-bg/60 px-1.5 text-[11px] font-bold">{count}</span>
            </button>
          ))}
        </div>

        {/* Loading */}
        {ordersQuery.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[10px] bg-app-bg" />
            ))}
          </div>
        )}

        {/* Error */}
        {ordersQuery.isError && (
          <div className="rounded-[10px] border border-state-critica/30 bg-state-critica/10 px-4 py-3 text-sm font-semibold text-state-critica">
            {t("orders.loadError", { message: ordersQuery.error.message })}
          </div>
        )}

        {/* Empty */}
        {ordersQuery.isSuccess && pageItems.length === 0 && (
          <EmptyState
            Icon={Package}
            title={t("orders.emptyTitle")}
            description={statusFilter !== "todas" ? t("orders.emptyFiltered") : t("orders.emptyCreateFirst")}
          />
        )}

        {/* List */}
        <div className="space-y-3">
          {pageItems.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={(id, estado) => statusMutation.mutate({ id, estado })}
              updatingId={updatingId}
              canManage={canViewOrders}
            />
          ))}
        </div>

        {/* Pagination */}
        {!ordersQuery.isLoading && pageItems.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            currentCount={pageItems.length}
            hasNext={hasNext}
            isLoading={ordersQuery.isFetching}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}

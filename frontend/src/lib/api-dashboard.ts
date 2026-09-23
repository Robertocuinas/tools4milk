// Cliente de los endpoints nuevos del Centro de control. Se mantiene fuera de
// api.ts y reutiliza su `request` (token, errores y base URL compartidos).
import { request } from "@/lib/api";
import type { SeverityTrendResponse } from "@/lib/types-dashboard";

export const dashboardApi = {
  severityTrend(days: number) {
    return request<SeverityTrendResponse>("/dashboard/severity-trend", {}, { days });
  },
};

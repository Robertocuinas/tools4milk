import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Utilidad de auditoría ejecutada directamente por Node/Playwright.
      // Es CommonJS por compatibilidad con ese entorno, no código de Next.
      ".audit-ux.cjs",
    ],
  },
];

export default eslintConfig;

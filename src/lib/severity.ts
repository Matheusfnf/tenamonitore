/** Escala de severidade 1–5 usada nas observações de praga/doença. */
export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Média',
  4: 'Alta',
  5: 'Muito alta',
};

export const SEVERITY_LEVELS = [1, 2, 3, 4, 5] as const;

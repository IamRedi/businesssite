const positiveMoney = (value: string | undefined) => {
  if (!value?.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000 ? amount : undefined;
};

export const providerUsageWarningBudgets = () => ({
  dailyUsd: positiveMoney(process.env.PROVIDER_COST_DAILY_WARNING_USD),
  monthlyUsd: positiveMoney(process.env.PROVIDER_COST_MONTHLY_WARNING_USD),
});

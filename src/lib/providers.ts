export const providerLabels: Record<string, string> = {
  selectel: "Selectel",
  timeweb: "Timeweb Cloud",
};

export function providerLabel(provider: string) {
  return providerLabels[provider] ?? provider;
}

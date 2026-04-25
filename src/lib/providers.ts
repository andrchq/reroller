export const providerLabels: Record<string, string> = {
  selectel: "Selectel",
  timeweb: "Timeweb Cloud",
  regru: "Reg.ru CloudVPS",
};

export function providerLabel(provider: string) {
  return providerLabels[provider] ?? provider;
}

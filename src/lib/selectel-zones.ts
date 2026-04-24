export type SelectelZoneInfo = {
  name: string;
  city: string;
  label: string;
  badge?: string;
};

export const selectelZones: SelectelZoneInfo[] = [
  { name: "ru-2", city: "Москва", label: "Зона доступности 1" },
  { name: "ru-6", city: "Москва", label: "Зона доступности 1, 3 и 4", badge: "Мультизональный пул" },
  { name: "ru-7", city: "Москва", label: "Зона доступности 1" },
  { name: "gis-1", city: "Москва", label: "Зона доступности 1", badge: "Аттестованный сегмент" },
  { name: "ru-1", city: "Санкт-Петербург", label: "Зона доступности 2" },
  { name: "ru-3", city: "Санкт-Петербург", label: "Зона доступности 1" },
  { name: "ru-9", city: "Санкт-Петербург", label: "Зона доступности 2" },
  { name: "gis-2", city: "Санкт-Петербург", label: "Зона доступности 1", badge: "Аттестованный сегмент" },
];

export function selectelZoneTitle(name: string) {
  const zone = selectelZones.find((item) => item.name === name);
  return zone ? `${zone.name} - ${zone.label}` : name;
}

export function selectelZoneGroups(names: string[]) {
  const available = new Set(names);
  const known = selectelZones.filter((zone) => available.has(zone.name));
  const unknown = names
    .filter((name) => !selectelZones.some((zone) => zone.name === name))
    .map((name) => ({ name, city: "Другие", label: "Зона Selectel" }));

  return [...known, ...unknown].reduce<Record<string, SelectelZoneInfo[]>>((groups, zone) => {
    groups[zone.city] = [...(groups[zone.city] ?? []), zone];
    return groups;
  }, {});
}

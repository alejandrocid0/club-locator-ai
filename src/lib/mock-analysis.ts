export type AnalysisResult = ReturnType<typeof generateMockAnalysis>;

export function generateMockAnalysis(query: string, radius: number) {
  // Deterministic-ish randomness based on query
  const seed = Array.from(query).reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (min: number, max: number, offset = 0) => {
    const x = Math.sin(seed + offset) * 10000;
    const r = x - Math.floor(x);
    return Math.round((min + r * (max - min)) * 10) / 10;
  };

  const radiusFactor = radius / 10;
  const population = Math.round(rand(80000, 320000, 1) * radiusFactor);
  const clubs = Math.max(3, Math.round(rand(6, 22, 2) * radiusFactor));
  const indoorCourts = Math.round(rand(8, 38, 3) * radiusFactor);
  const outdoorCourts = Math.round(rand(14, 60, 4) * radiusFactor);
  const totalCourts = indoorCourts + outdoorCourts;

  const habPerCourt = Math.round(population / totalCourts);
  const habPerIndoor = Math.round(population / Math.max(1, indoorCourts));
  const opportunityScore = Math.min(9.8, Math.max(4.2, rand(6.5, 9.4, 5)));

  return {
    query,
    radius,
    coords: { lat: 40.4168 + rand(-0.4, 0.4, 9) / 5, lng: -3.7038 + rand(-0.4, 0.4, 10) / 5 },
    summary: {
      opportunityScore,
      demandLevel: habPerCourt >= 6000
        ? "Muy alta"
        : habPerCourt >= 3800
          ? "Alta"
          : habPerCourt >= 2500
            ? "Media"
            : habPerCourt >= 1500
              ? "Baja"
              : "Muy baja",
      indoorDeficit: Math.round(rand(35, 78, 6)),
      competitiveRisk: rand(0.5, 8, 7) < 3 ? "alto" : rand(0.5, 8, 7) <= 5 ? "medio" : "bajo",
    },
    demographics: {
      population,
    },
    supply: {
      clubs,
      totalCourts,
      indoor: indoorCourts,
      outdoor: outdoorCourts,
    },
    benchmark: {
      habPerCourt,
      habPerIndoor,
      habPerOutdoor: Math.round(population / Math.max(1, outdoorCourts)),
      indoorRatio: Math.round((indoorCourts / totalCourts) * 100),
      outdoorRatio: Math.round((outdoorCourts / totalCourts) * 100),
      saturation: clubs > 18 ? "alta" : clubs > 10 ? "media" : "baja",
      spain: { habPerCourt: 3800, habPerIndoor: 18000, habPerOutdoor: 4810, indoorRatio: 21, outdoorRatio: 79 },
    },
    pricing: {
      valle: Math.round(rand(14, 22, 12)),
      punta: Math.round(rand(24, 36, 13)),
    },
    clubsNearby: Array.from({ length: clubs }).map((_, i) => ({
      id: i,
      name:
        ["Padel Pro", "Indoor Club", "Set & Match", "Premium Padel", "City Padel", "Royal Padel"][
          i % 6
        ] +
        " " +
        (i + 1),
      type: i % 3 === 0 ? "indoor" : "outdoor",
      courts: Math.round(rand(3, 10, 20 + i)),
      distance_km: Math.round(rand(0.5, radius * 0.9, 50 + i) * 10) / 10,
      lat: 0,
      lng: 0,
      offset: {
        x: rand(-1, 1, 30 + i),
        y: rand(-1, 1, 40 + i),
      },
    })),
    recommendation: {
      summary:
        "Mercado con fuerte demanda deportiva y claro déficit de oferta indoor de calidad. Existe espacio para un proyecto premium diferenciado que capture la demanda no atendida en horario punta.",
      model: "Club premium · 6-8 pistas indoor + 2 panorámicas",
      opportunities: [
        "Déficit estructural de pistas indoor cubiertas",
        "Renta media superior al benchmark nacional",
        "Saturación competitiva contenida en formato premium",
        "Demanda corporate y eventos no atendida",
      ],
      risks: [
        "Costes de suelo elevados en zonas prime",
        "Estacionalidad en formato outdoor existente",
        "Posible entrada de cadenas en 12-18 meses",
      ],
    },
  };
}

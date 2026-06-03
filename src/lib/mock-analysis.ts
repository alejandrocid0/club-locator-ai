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
      demandLevel: opportunityScore > 8 ? "Muy alta" : opportunityScore > 6.5 ? "Alta" : "Media",
      indoorDeficit: rand(35, 78, 6),
      premiumPotential: opportunityScore > 7.5 ? "Alto" : "Medio",
      competitiveRisk: clubs > 15 ? "Medio" : "Bajo",
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
      indoorRatio: Math.round((indoorCourts / totalCourts) * 100),
      saturation: clubs > 18 ? "alta" : clubs > 10 ? "media" : "baja",
      spain: { habPerCourt: 3200, habPerIndoor: 9800, indoorRatio: 32 },
      premium: { habPerCourt: 1800, habPerIndoor: 4200, indoorRatio: 58 },
    },
    pricing: {
      valle: Math.round(rand(14, 22, 12)),
      punta: Math.round(rand(24, 36, 13)),
      premium: Math.round(rand(36, 52, 14)),
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

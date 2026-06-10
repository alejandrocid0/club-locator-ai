import { lazy, Suspense } from "react";
import type { AnalysisResult } from "@/lib/api/analyze.functions";

const CompetitionMap = lazy(() => import("./CompetitionMap"));
import {
  TrendingUp,
  Users,
  ShieldAlert,
  Layers,
  Gauge,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-border bg-card shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-6 border-l-4 border-primary pl-4">
      <div className="text-xs uppercase tracking-[0.2em] font-bold text-primary">{kicker}</div>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h2>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = "text-foreground";
  return (
    <Card className="p-5 bg-card-elevated">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
        <div className="rounded-full bg-primary p-1.5 text-primary-foreground">
          <Icon className="size-4" />
        </div>
      </div>
      <div className={`mt-3 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function Semaforo({ tone }: { tone: "green" | "yellow" | "red" }) {
  const map = { green: "bg-success", yellow: "bg-warning", red: "bg-destructive" };
  return (
    <span
      className={`inline-block size-2.5 rounded-full ${map[tone]} shadow-[0_0_12px_currentColor]`}
    />
  );
}

const fmt = (n: number) => new Intl.NumberFormat("es-ES").format(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Report({ data }: { data: AnalysisResult }) {
  const supplyData = [
    { name: "Indoor", value: data.supply.indoor, color: "var(--color-primary)" },
    { name: "Outdoor", value: data.supply.outdoor, color: "var(--color-accent)" },
  ];

  const benchmarkData = [
    {
      name: "Hab/pista",
      Ubicación: data.benchmark.habPerCourt,
      España: data.benchmark.spain.habPerCourt,
    },
    {
      name: "Hab/indoor",
      Ubicación: data.benchmark.habPerIndoor,
      España: data.benchmark.spain.habPerIndoor,
    },
    {
      name: "Hab/outdoor",
      Ubicación: data.benchmark.habPerOutdoor,
      España: data.benchmark.spain.habPerOutdoor,
    },
  ];

  return (
    <div className="space-y-12">
      {/* 1. Resumen ejecutivo */}
      <section>
        <SectionTitle kicker="01 · Resumen ejecutivo" title="Puntuación de oportunidad" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6 lg:col-span-2 bg-primary text-primary-foreground border-primary">
            <div className="relative">
              <div className="text-xs uppercase tracking-widest font-bold opacity-90">
                Puntuación de oportunidad
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-6xl font-bold tabular-nums">
                  {data.summary.opportunityScore.toFixed(1)}
                </span>
                <span className="text-2xl opacity-80 mb-1">/10</span>
              </div>
            </div>
          </Card>
          <Stat
            icon={TrendingUp}
            label="Demanda"
            value={data.summary.demandLevel}
          />
          <Stat
            icon={ShieldAlert}
            label="Riesgo competitivo"
            value={capitalize(data.summary.competitiveRisk)}
            tone={data.summary.competitiveRisk === "bajo" ? "success" : "warning"}
          />
        </div>
      </section>

      {/* 2. Demografía */}
      <section>
        <SectionTitle kicker="02 · Demografía" title="Mercado en el radio analizado" />
        <div className="grid grid-cols-1 gap-4 max-w-xs">
          <Stat
            icon={Users}
            label="Población"
            value={fmt(data.demographics.population)}
            hint={`Radio ${data.radius} km`}
          />
        </div>
      </section>

      {/* 3. Oferta de pádel */}
      <section>
        <SectionTitle kicker="03 · Oferta" title="Oferta actual de pádel" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            <Stat icon={Layers} label="Pistas totales" value={String(data.supply.totalCourts)} />
            <Stat icon={Layers} label="Indoor" value={String(data.supply.indoor)} tone="success" />
            <Stat
              icon={Layers}
              label="Outdoor"
              value={String(data.supply.outdoor)}
              tone="warning"
            />
          </div>
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Mix indoor / outdoor
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={supplyData}
                    dataKey="value"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {supplyData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" /> Indoor
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" /> Outdoor
              </span>
            </div>
          </Card>
        </div>
      </section>

      {/* 4. Benchmark */}
      <section>
        <SectionTitle kicker="04 · Benchmark" title="Ratios vs. media nacional" />
        <Card className="p-6">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={benchmarkData}>
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="Ubicación" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="España" fill="var(--color-muted-foreground)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla comparativa */}
          <div className="mt-6 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-foreground bg-card-elevated">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-foreground font-bold">Métrica</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-foreground font-bold">Este radio</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-foreground font-bold">Media España</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  {
                    label: "Hab. por pista",
                    local: fmt(data.benchmark.habPerCourt),
                    national: fmt(data.benchmark.spain.habPerCourt),
                  },
                  {
                    label: "Hab. por pista indoor",
                    local: data.benchmark.habPerIndoor > 0 ? fmt(data.benchmark.habPerIndoor) : "—",
                    national: fmt(data.benchmark.spain.habPerIndoor),
                  },
                  {
                    label: "Hab. por pista outdoor",
                    local: data.benchmark.habPerOutdoor > 0 ? fmt(data.benchmark.habPerOutdoor) : "—",
                    national: fmt(data.benchmark.spain.habPerOutdoor),
                  },
                  {
                    label: "% pistas indoor",
                    local: `${data.benchmark.indoorRatio}%`,
                    national: `${data.benchmark.spain.indoorRatio}%`,
                  },
                  {
                    label: "% pistas outdoor",
                    local: `${data.benchmark.outdoorRatio}%`,
                    national: `${data.benchmark.spain.outdoorRatio}%`,
                  },
                  {
                    label: "Saturación",
                    local: capitalize(data.benchmark.saturation),
                    national: "Media",
                  },
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-card-elevated transition-colors">
                    <td className="px-4 py-3 text-foreground">{row.label}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">{row.local}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.national}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* 5. Pricing */}
      <section>
        <SectionTitle kicker="05 · Pricing" title="Pricing competencia local" />
        {data.pricing.valle === null ? (
          <p className="text-sm text-muted-foreground -mt-4">
            Precio no disponible — ningún club del radio tiene datos de precio en este momento.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground -mt-4 mb-4">
              Promedio de {data.pricing.clubCount} club{data.pricing.clubCount !== 1 ? "es" : ""} con precios disponibles en el radio analizado.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
              {[
                { label: "Hora valle", value: data.pricing.valle },
                { label: "Hora punta", value: data.pricing.punta },
              ].map((p) => (
                <Card key={p.label} className="p-6">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {p.label}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tabular-nums text-foreground">
                      €{p.value}
                    </span>
                    <span className="text-muted-foreground">/ 90 min</span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 6. Mapa */}
      <section>
        <SectionTitle kicker="06 · Mapa" title="Competencia en el radio analizado" />
        <Card className="p-2">
          <Suspense
            fallback={
              <div className="aspect-[16/9] rounded-xl bg-card-elevated animate-pulse flex items-center justify-center text-muted-foreground text-sm">
                Cargando mapa…
              </div>
            }
          >
            <CompetitionMap
              coords={data.coords}
              radius={data.radius}
              clubs={data.clubsNearby as any}
            />
          </Suspense>
        </Card>
      </section>

      {/* 7. Recomendación */}
      <section>
        <SectionTitle kicker="07 · Recomendación" title="Tesis de inversión" />
        <Card className="p-8">
          <div>
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-primary p-3 text-primary-foreground">
                <Gauge className="size-5" />
              </div>
              <div className="flex-1">
                <p className="text-lg leading-relaxed text-foreground">
                  {data.recommendation.summary}
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card-elevated p-5">
                <div className="flex items-center gap-2 text-foreground font-bold">
                  <CheckCircle2 className="size-4" /> Oportunidades
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {data.recommendation.opportunities.map((o) => (
                    <li key={o} className="flex gap-2">
                      <span className="text-foreground mt-1">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-card-elevated p-5">
                <div className="flex items-center gap-2 text-foreground font-bold">
                  <AlertTriangle className="size-4" /> Riesgos
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {data.recommendation.risks.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="text-foreground mt-1">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

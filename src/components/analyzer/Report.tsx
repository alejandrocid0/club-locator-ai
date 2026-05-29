import type { AnalysisResult } from "@/lib/mock-analysis";
import {
  TrendingUp,
  Users,
  ShieldAlert,
  Sparkles,
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
      className={`rounded-2xl border border-border bg-[var(--gradient-surface)] backdrop-blur shadow-[var(--shadow-elegant)] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-6">
      <div className="text-xs uppercase tracking-[0.2em] text-primary/80">{kicker}</div>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
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
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="rounded-lg bg-card-elevated p-1.5 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
      <div className={`mt-3 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
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
const eur = (n: number) => `€${fmt(n)}`;

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
      Premium: data.benchmark.premium.habPerCourt,
    },
    {
      name: "Hab/indoor",
      Ubicación: data.benchmark.habPerIndoor,
      España: data.benchmark.spain.habPerIndoor,
      Premium: data.benchmark.premium.habPerIndoor,
    },
  ];

  const scoreTone =
    data.summary.opportunityScore >= 8
      ? "success"
      : data.summary.opportunityScore >= 6.5
        ? "warning"
        : "danger";

  return (
    <div className="space-y-12">
      {/* 1. Resumen ejecutivo */}
      <section>
        <SectionTitle kicker="01 · Resumen ejecutivo" title="Score de oportunidad" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="p-6 lg:col-span-2 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-50"
              style={{ background: "var(--gradient-hero)" }}
            />
            <div className="relative">
              <div className="text-xs uppercase tracking-widest text-primary/80">
                Opportunity Score
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-6xl font-semibold tabular-nums bg-gradient-to-br from-primary to-primary-glow bg-clip-text text-transparent">
                  {data.summary.opportunityScore.toFixed(1)}
                </span>
                <span className="text-2xl text-muted-foreground mb-1">/10</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-primary" />
                Ubicación recomendada para inversión estratégica
              </div>
            </div>
          </Card>
          <Stat icon={TrendingUp} label="Demanda" value={data.summary.demandLevel} tone="success" />
          <Stat
            icon={Layers}
            label="Déficit indoor"
            value={`${data.summary.indoorDeficit}%`}
            tone="warning"
          />
          <Stat
            icon={Sparkles}
            label="Potencial premium"
            value={data.summary.premiumPotential}
            tone="success"
          />
        </div>
        <div className="mt-4">
          <Stat
            icon={ShieldAlert}
            label="Riesgo competitivo"
            value={data.summary.competitiveRisk}
            tone={data.summary.competitiveRisk === "Bajo" ? "success" : "warning"}
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
        <SectionTitle kicker="04 · Benchmark" title="Ratios vs. media España y costa premium" />
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
                <Bar dataKey="Premium" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              {
                label: "Habitantes por pista",
                value: fmt(data.benchmark.habPerCourt),
                tone: "green" as const,
              },
              {
                label: "Habitantes por pista indoor",
                value: fmt(data.benchmark.habPerIndoor),
                tone: "green" as const,
              },
              {
                label: "Ratio indoor / outdoor",
                value: `${data.benchmark.indoorRatio}%`,
                tone: "yellow" as const,
              },
              {
                label: "Saturación de mercado",
                value: data.benchmark.saturation,
                tone:
                  data.benchmark.saturation === "alta"
                    ? ("red" as const)
                    : data.benchmark.saturation === "media"
                      ? ("yellow" as const)
                      : ("green" as const),
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-xl border border-border bg-card-elevated/60 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Semaforo tone={row.tone} />
                  <span className="text-muted-foreground">{row.label}</span>
                </div>
                <span className="font-medium tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* 5. Pricing */}
      <section>
        <SectionTitle kicker="05 · Pricing" title="Pricing recomendado por franja" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Hora valle", value: data.pricing.valle, hint: "L-V mañanas" },
            { label: "Hora punta", value: data.pricing.punta, hint: "L-V 18-22h" },
            { label: "Premium", value: data.pricing.premium, hint: "Sábado prime + indoor" },
          ].map((p, i) => (
            <Card key={p.label} className="p-6 relative overflow-hidden">
              {i === 2 && (
                <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  Top tier
                </div>
              )}
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {p.label}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tabular-nums text-foreground">
                  €{p.value}
                </span>
                <span className="text-muted-foreground">/ 90 min</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{p.hint}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* 6. Mapa */}
      <section>
        <SectionTitle kicker="06 · Mapa" title="Competencia en el radio analizado" />
        <Card className="p-2">
          <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-border bg-[radial-gradient(circle_at_50%_50%,oklch(0.98_0.005_25),oklch(0.94_0.008_25))]">
            {/* grid */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }}
            />
            {/* radius circles */}
            {[0.4, 0.7, 1].map((s) => (
              <div
                key={s}
                className="absolute left-1/2 top-1/2 rounded-full border border-primary/30"
                style={{
                  width: `${s * 70}%`,
                  height: `${s * 70}%`,
                  transform: "translate(-50%, -50%)",
                  boxShadow: "inset 0 0 60px oklch(0.72 0.18 155 / 8%)",
                }}
              />
            ))}
            {/* center pin */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <div className="size-3 rounded-full bg-primary shadow-[0_0_20px_var(--color-primary)]" />
              <div className="mt-2 px-2 py-0.5 text-[10px] uppercase tracking-widest rounded bg-card-elevated border border-border text-foreground">
                Ubicación
              </div>
            </div>
            {/* clubs */}
            {data.clubsNearby.map((c) => (
              <div
                key={c.id}
                className="absolute group"
                style={{
                  left: `${50 + c.offset.x * 35}%`,
                  top: `${50 + c.offset.y * 35}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className={`size-2.5 rounded-full ${
                    c.type === "indoor"
                      ? "bg-accent shadow-[0_0_12px_var(--color-accent)]"
                      : "bg-success shadow-[0_0_12px_var(--color-success)]"
                  }`}
                />
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute left-3 top-0 whitespace-nowrap px-2 py-1 rounded-md bg-card-elevated border border-border text-[11px]">
                  {c.name} · {c.courts} pistas
                </div>
              </div>
            ))}
            {/* legend */}
            <div className="absolute bottom-3 left-3 flex gap-3 text-xs bg-card-elevated/80 backdrop-blur border border-border rounded-lg px-3 py-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" /> Indoor
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Outdoor
              </span>
            </div>
            <div className="absolute bottom-3 right-3 text-[10px] uppercase tracking-widest text-muted-foreground bg-card-elevated/80 backdrop-blur border border-border rounded-lg px-3 py-2">
              Radio {data.radius} km
            </div>
          </div>
        </Card>
      </section>

      {/* 7. Recomendación */}
      <section>
        <SectionTitle kicker="07 · Recomendación" title="Tesis de inversión" />
        <Card className="p-8 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="relative">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-3 text-primary">
                <Gauge className="size-5" />
              </div>
              <div className="flex-1">
                <p className="text-lg leading-relaxed text-foreground">
                  {data.recommendation.summary}
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
                  <Sparkles className="size-3.5" />
                  Modelo recomendado: {data.recommendation.model}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card-elevated/60 p-5">
                <div className="flex items-center gap-2 text-success font-medium">
                  <CheckCircle2 className="size-4" /> Oportunidades
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {data.recommendation.opportunities.map((o) => (
                    <li key={o} className="flex gap-2">
                      <span className="text-success mt-1">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-card-elevated/60 p-5">
                <div className="flex items-center gap-2 text-warning font-medium">
                  <AlertTriangle className="size-4" /> Riesgos
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {data.recommendation.risks.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="text-warning mt-1">•</span>
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

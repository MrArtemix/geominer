'use client';

/* ============================================
   Scenario - Simulation predictive
   Zone 1 : 3 cartes scenario cliquables
   Zone 2 : LineChart projection 10 mois
   Zone 3 : Tableau comparatif indicateurs
   Zone 4 : Jauge SVG risque projete
   ============================================ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Shield,
  Target,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/cn';

/* ---------- Animation stagger ---------- */

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

/* ---------- Tooltip custom glassmorphism ---------- */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: 'var(--text-muted)' }}>{entry.name} :</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Types scenario ---------- */

type ScenarioKey = 'optimiste' | 'modere' | 'pessimiste';

interface ScenarioConfig {
  key: ScenarioKey;
  label: string;
  description: string;
  icon: typeof TrendingUp;
  color: string;
  ringColor: string;
  bgColor: string;
  riskScore: number;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    key: 'optimiste', label: 'Optimiste', color: '#22c55e',
    description: 'Intervention renforcee, budget augmente de 30%, cooperation regionale active',
    icon: TrendingUp, ringColor: 'ring-emerald-500', bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    riskScore: 38,
  },
  {
    key: 'modere', label: 'Modere', color: '#f59e0b',
    description: 'Maintien des ressources actuelles, strategies existantes poursuivies',
    icon: Minus, ringColor: 'ring-amber-500', bgColor: 'bg-amber-500/10 border-amber-500/20',
    riskScore: 62,
  },
  {
    key: 'pessimiste', label: 'Pessimiste', color: '#ef4444',
    description: 'Reduction budgetaire, desengagement partiel, pression miniere accrue',
    icon: TrendingDown, ringColor: 'ring-red-500', bgColor: 'bg-red-500/10 border-red-500/20',
    riskScore: 84,
  },
];

/* ---------- Projection data ---------- */

const PROJECTION_DATA = [
  { month: 'M1', optimiste: 127, modere: 127, pessimiste: 127 },
  { month: 'M2', optimiste: 120, modere: 130, pessimiste: 138 },
  { month: 'M3', optimiste: 112, modere: 133, pessimiste: 150 },
  { month: 'M4', optimiste: 101, modere: 135, pessimiste: 165 },
  { month: 'M5', optimiste: 90, modere: 137, pessimiste: 178 },
  { month: 'M6', optimiste: 78, modere: 139, pessimiste: 195 },
  { month: 'M7', optimiste: 65, modere: 140, pessimiste: 210 },
  { month: 'M8', optimiste: 55, modere: 142, pessimiste: 228 },
  { month: 'M9', optimiste: 42, modere: 143, pessimiste: 245 },
  { month: 'M10', optimiste: 30, modere: 145, pessimiste: 260 },
];

/* ---------- Indicateurs comparatifs ---------- */

interface Indicator {
  label: string;
  optimiste: string;
  modere: string;
  pessimiste: string;
}

const INDICATORS: Indicator[] = [
  { label: 'Sites actifs (M10)', optimiste: '30', modere: '145', pessimiste: '260' },
  { label: 'Taux demantelement', optimiste: '76%', modere: '34%', pessimiste: '12%' },
  { label: 'Budget requis (Mds FCFA)', optimiste: '8.5', modere: '5.2', pessimiste: '3.1' },
  { label: 'Agents necessaires', optimiste: '280', modere: '150', pessimiste: '80' },
  { label: 'Reduction contamination', optimiste: '-65%', modere: '-15%', pessimiste: '+40%' },
  { label: 'Score risque projete', optimiste: '38', modere: '62', pessimiste: '84' },
];

/* ---------- Jauge risque projete ---------- */

function ProjectedRiskGauge({ score, color }: { score: number; color: string }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="glass-card flex flex-col items-center py-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4" style={{ color }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Risque projete
        </h3>
      </div>
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth="8" />
          <motion.circle
            key={score}
            cx="64" cy="64" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={score}
              className="text-3xl font-bold"
              style={{ color }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              {score}
            </motion.span>
          </AnimatePresence>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            /100
          </span>
        </div>
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
        Score de risque a 10 mois
      </p>
    </div>
  );
}

/* ---------- Page principale ---------- */

export default function ScenarioPage() {
  const [selected, setSelected] = useState<ScenarioKey>('modere');
  const activeScenario = SCENARIOS.find((s) => s.key === selected)!;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Titre */}
      <motion.div variants={item}>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Scenarios predictifs</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Simulation de l&apos;evolution des sites miniers illegaux selon differentes hypotheses
        </p>
      </motion.div>

      {/* Zone 1 : 3 cartes scenario */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SCENARIOS.map((sc) => {
          const Icon = sc.icon;
          const isActive = selected === sc.key;
          return (
            <motion.button
              key={sc.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(sc.key)}
              className={cn(
                'glass-card-hover text-left relative overflow-hidden transition-all duration-300',
                isActive && `ring-2 ${sc.ringColor}`,
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="scenario-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: `${sc.color}08`, border: `1px solid ${sc.color}30` }}
                  transition={{ duration: 0.3 }}
                />
              )}
              <div className="relative z-10">
                <div className={cn('inline-flex p-2.5 rounded-xl border mb-3', sc.bgColor)}>
                  <Icon size={20} style={{ color: sc.color }} />
                </div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {sc.label}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {sc.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Zone 2 : LineChart projection */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Projection des sites actifs
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Evolution estimee sur 10 mois — scenario {activeScenario.label.toLowerCase()} selectionne
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {SCENARIOS.map((sc) => (
                <span key={sc.key} className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: sc.color, opacity: selected === sc.key ? 1 : 0.3 }} />
                  <span style={{ color: selected === sc.key ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    {sc.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={PROJECTION_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                {SCENARIOS.map((sc) => (
                  <Line
                    key={sc.key}
                    type="monotone"
                    dataKey={sc.key}
                    name={sc.label}
                    stroke={sc.color}
                    strokeWidth={selected === sc.key ? 3 : 1.5}
                    strokeOpacity={selected === sc.key ? 1 : 0.25}
                    dot={selected === sc.key ? { fill: sc.color, r: 3, strokeWidth: 0 } : false}
                    activeDot={selected === sc.key ? { r: 6, fill: sc.color, stroke: `${sc.color}40`, strokeWidth: 8 } : undefined}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Zone 3 + 4 : Tableau + Jauge */}
      <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Tableau comparatif */}
        <div className="xl:col-span-2 glass-card">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Comparatif des indicateurs
            </h3>
          </div>
          <div className="overflow-x-auto rounded-xl" style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(148,163,184,0.08)' }}>
            <table className="min-w-full">
              <thead>
                <tr className="bg-geo-900/60">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-geo-500 uppercase tracking-wider">Indicateur</th>
                  {SCENARIOS.map((sc) => (
                    <th
                      key={sc.key}
                      className={cn(
                        'px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider',
                        selected === sc.key ? 'text-geo-300' : 'text-geo-500',
                      )}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: sc.color }} />
                        {sc.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {INDICATORS.map((ind) => (
                  <tr key={ind.label} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm text-geo-400">{ind.label}</td>
                    {SCENARIOS.map((sc) => {
                      const val = ind[sc.key];
                      const isActive = selected === sc.key;
                      return (
                        <td
                          key={sc.key}
                          className={cn(
                            'px-4 py-3 text-center text-sm font-mono',
                            isActive ? 'text-geo-200 font-bold' : 'text-geo-500',
                          )}
                          style={isActive ? { background: `${sc.color}08` } : undefined}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Jauge risque projete */}
        <ProjectedRiskGauge score={activeScenario.riskScore} color={activeScenario.color} />
      </motion.div>
    </motion.div>
  );
}

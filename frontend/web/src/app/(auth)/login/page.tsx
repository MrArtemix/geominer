'use client';

/* ============================================================================
   Ge O'Miner — MISSION CONTROL LOGIN
   Split-screen cinematique : Globe Theatre (55%) + Console Login (45%)
   Boot sequence, HUD telemetrie, parallax multi-couche, film grain
   ============================================================================ */

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Fingerprint,
  Satellite,
  Radio,
  ChevronRight,
  Power,
} from 'lucide-react';
import GlobeAnimation from '@/components/ui/GlobeAnimation';

/* ==========================================================================
   BOOT SEQUENCE — Overlay terminal noir, typewriter, curseur clignotant
   ========================================================================== */
function BootSequence({ onComplete }: { onComplete: () => void }) {
  const lines = [
    { text: '> INITIALIZING GEOMINER COMMAND...', delay: 0 },
    { text: '> SATELLITE UPLINK: ESTABLISHED', delay: 400 },
    { text: '> ENCRYPTION LAYER: AES-256-GCM', delay: 700 },
    { text: '> THREAT MATRIX: LOADED', delay: 950 },
    { text: '> ALL SYSTEMS NOMINAL', delay: 1200 },
  ];

  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [currentText, setCurrentText] = useState('');
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    lines.forEach((line, index) => {
      timers.push(
        setTimeout(() => {
          setVisibleLines(index);
          setCurrentText('');
          const chars = line.text.split('');
          chars.forEach((_, charIdx) => {
            timers.push(
              setTimeout(() => {
                setCurrentText(line.text.slice(0, charIdx + 1));
              }, charIdx * 18)
            );
          });
        }, line.delay)
      );
    });

    timers.push(
      setTimeout(() => {
        setVisibleLines(lines.length);
        setCurrentText(lines[lines.length - 1].text);
      }, 1400)
    );

    timers.push(setTimeout(() => setIsExiting(true), 1800));
    timers.push(setTimeout(() => onComplete(), 2200));

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
        >
          <div className="w-full max-w-xl px-8">
            <div className="flex items-center gap-2 mb-4 text-green-500/60 mono text-[10px] tracking-widest uppercase">
              <div className="w-2 h-2 rounded-full bg-green-500/60 animate-pulse" />
              GEOMINER COMMAND v2.0.0
            </div>

            <div className="mono text-sm space-y-1">
              {lines.slice(0, visibleLines).map((line, i) => (
                <div key={i} className="text-green-400/90">
                  {line.text}
                </div>
              ))}
              {visibleLines < lines.length && (
                <div className="text-green-400/90">
                  {currentText}
                  <span className="inline-block w-2 h-4 bg-green-400 ml-0.5 animate-[pulse_0.8s_steps(1)_infinite]" />
                </div>
              )}
              {visibleLines >= lines.length && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-gold-400 mt-3 text-xs tracking-wider"
                >
                  COMMAND CENTER READY — LAUNCHING INTERFACE...
                </motion.div>
              )}
            </div>

            <div className="mt-6 h-px bg-green-900/40 rounded overflow-hidden">
              <motion.div
                className="h-full bg-green-500/60"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ==========================================================================
   HUD TELEMETRY — 4 badges mono positionnement absolu (desktop only)
   ========================================================================== */
function HUDTelemetry() {
  const [values, setValues] = useState({
    satellites: 12,
    threat: 'LOW',
    lat: '7.539',
    lon: '-5.547',
    area: 23148,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setValues({
        satellites: 11 + Math.floor(Math.random() * 4),
        threat: ['LOW', 'LOW', 'MODERATE', 'LOW'][Math.floor(Math.random() * 4)],
        lat: (7.5 + Math.random() * 0.1).toFixed(3),
        lon: (-5.5 - Math.random() * 0.1).toFixed(3),
        area: 23000 + Math.floor(Math.random() * 300),
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const badges = [
    {
      label: 'SAT-LINK',
      value: `${values.satellites} ACTIVE`,
      pos: 'top-6 left-6',
      color: 'text-cyan-400',
      border: 'border-cyan-500/20',
      bg: 'bg-cyan-950/30',
    },
    {
      label: 'THREAT LEVEL',
      value: values.threat,
      pos: 'top-6 right-6',
      color: values.threat === 'MODERATE' ? 'text-amber-400' : 'text-green-400',
      border: values.threat === 'MODERATE' ? 'border-amber-500/20' : 'border-green-500/20',
      bg: values.threat === 'MODERATE' ? 'bg-amber-950/30' : 'bg-green-950/30',
    },
    {
      label: 'COORDINATES',
      value: `${values.lat}N ${values.lon}W`,
      pos: 'bottom-6 left-6',
      color: 'text-geo-500',
      border: 'border-geo-700/30',
      bg: 'bg-geo-950/50',
    },
    {
      label: 'SCAN AREA',
      value: `${values.area.toLocaleString()} km2`,
      pos: 'bottom-6 right-6',
      color: 'text-violet-400',
      border: 'border-violet-500/20',
      bg: 'bg-violet-950/30',
    },
  ];

  return (
    <>
      {badges.map((b, i) => (
        <motion.div
          key={b.label}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 2 + i * 0.2, duration: 0.4 }}
          className={`hidden xl:flex absolute ${b.pos} z-40 flex-col gap-0.5 px-3 py-2 rounded-md border ${b.border} ${b.bg} backdrop-blur-sm`}
        >
          <span className="mono text-[9px] tracking-[0.2em] uppercase text-geo-600">
            {b.label}
          </span>
          <span className={`mono text-xs font-bold ${b.color}`}>
            {b.value}
          </span>
        </motion.div>
      ))}
    </>
  );
}

/* ==========================================================================
   FILM GRAIN — feTurbulence overlay (desktop only)
   ========================================================================== */
function FilmGrain() {
  return (
    <div className="hidden md:block fixed inset-0 z-50 pointer-events-none mix-blend-overlay opacity-[0.015]">
      <svg className="w-full h-full">
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves={3}
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </div>
  );
}

/* ==========================================================================
   CINEMATIC VIGNETTE — box-shadow inset lens effect
   ========================================================================== */
function CinematicVignette() {
  return (
    <div
      className="fixed inset-0 z-[45] pointer-events-none"
      style={{
        boxShadow:
          'inset 0 0 150px 60px rgba(0,0,0,0.7), inset 0 0 60px 20px rgba(0,0,0,0.3)',
      }}
    />
  );
}

/* ==========================================================================
   SCANLINES CRT — repeating gradient subtil
   ========================================================================== */
function ScanlinesCRT() {
  return (
    <div
      className="fixed inset-0 z-[46] pointer-events-none opacity-[0.02]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
      }}
    />
  );
}

/* ==========================================================================
   GEO LOGO — Glow pulse + anneau externe SVG rotatif CSS
   ========================================================================== */
function GeoLogo({ onClick }: { onClick?: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onClick}>
      <svg
        viewBox="0 0 80 80"
        className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] animate-[spin_20s_linear_infinite]"
        fill="none"
      >
        <circle
          cx="40"
          cy="40"
          r="38"
          stroke="url(#ringGrad)"
          strokeWidth="0.5"
          strokeDasharray="6 8"
          opacity="0.4"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="80" y2="80">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>

      <div
        className="absolute -inset-4 rounded-full animate-[breath_4s_ease-in-out_infinite]"
        style={{
          background: 'radial-gradient(circle, rgba(251,191,36,0.15) 0%, transparent 70%)',
        }}
      />

      <svg viewBox="0 0 64 64" className="w-16 h-16 relative z-10" fill="none">
        <path
          d="M32 4L56 18V46L32 60L8 46V18L32 4Z"
          stroke="url(#logoGrad)"
          strokeWidth="2"
          fill="rgba(251,191,36,0.08)"
        />
        <path
          d="M32 14L46 22V38L32 46L18 38V22L32 14Z"
          stroke="url(#logoGrad2)"
          strokeWidth="1"
          fill="rgba(6,182,212,0.05)"
          strokeDasharray="3 2"
        />
        <circle cx="32" cy="32" r="8" stroke="#fbbf24" strokeWidth="1.5" />
        <line x1="32" y1="20" x2="32" y2="26" stroke="#06b6d4" strokeWidth="1.5" />
        <line x1="32" y1="38" x2="32" y2="44" stroke="#06b6d4" strokeWidth="1.5" />
        <line x1="20" y1="32" x2="26" y2="32" stroke="#06b6d4" strokeWidth="1.5" />
        <line x1="38" y1="32" x2="44" y2="32" stroke="#06b6d4" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="2.5" fill="#fbbf24">
          <animate attributeName="r" values="2;3;2" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
        </circle>
        <defs>
          <linearGradient id="logoGrad" x1="8" y1="4" x2="56" y2="60">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="logoGrad2" x1="18" y1="14" x2="46" y2="46">
            <stop stopColor="#06b6d4" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ==========================================================================
   FLOATING PARTICLES — 30 standard + 5 golden specials
   ========================================================================== */
function FloatingParticles() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: `${(i * 13 + 5) % 100}%`,
    top: `${(i * 19 + 7) % 100}%`,
    size: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1.5,
    delay: `${(i * 0.5) % 6}s`,
    duration: `${6 + (i % 5) * 2}s`,
    color:
      i % 5 === 0
        ? '#fbbf24'
        : i % 5 === 1
          ? '#06b6d4'
          : i % 5 === 2
            ? '#8b5cf6'
            : i % 5 === 3
              ? '#f59e0b'
              : '#22d3ee',
    opacity: 0.12 + (i % 5) * 0.04,
  }));

  const goldenSpecials = Array.from({ length: 5 }, (_, i) => ({
    id: 100 + i,
    left: `${15 + i * 18}%`,
    top: `${20 + (i * 23) % 60}%`,
    size: 5 + i,
    delay: `${i * 1.2}s`,
    duration: `${10 + i * 2}s`,
    color: '#fbbf24',
    opacity: 0.08,
  }));

  const allParticles = [...particles, ...goldenSpecials];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {allParticles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            opacity: p.opacity,
            animationDelay: p.delay,
            animationDuration: p.duration,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}

/* ==========================================================================
   TARGET PINGS — Cercles expansifs type radar sur points mines
   ========================================================================== */
function TargetPings() {
  const targets = [
    { x: '30%', y: '35%', color: '#ef4444', delay: '0s' },
    { x: '55%', y: '55%', color: '#fbbf24', delay: '1s' },
    { x: '40%', y: '70%', color: '#06b6d4', delay: '2s' },
    { x: '65%', y: '30%', color: '#f59e0b', delay: '0.5s' },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {targets.map((t, i) => (
        <div key={i} className="absolute" style={{ left: t.x, top: t.y }}>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: t.color, boxShadow: `0 0 8px ${t.color}` }}
          />
          <div
            className="absolute -inset-1 rounded-full animate-target-ping"
            style={{ border: `1px solid ${t.color}`, animationDelay: t.delay }}
          />
          <div
            className="absolute -inset-1 rounded-full animate-target-ping"
            style={{ border: `1px solid ${t.color}`, animationDelay: `calc(${t.delay} + 1s)` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ==========================================================================
   PARTNER BADGE — whileHover scale 1.08 + glow gold
   ========================================================================== */
function PartnerBadge({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <motion.div
      whileHover={{ scale: 1.08, boxShadow: '0 0 16px rgba(251,191,36,0.25)' }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wide uppercase cursor-default transition-colors"
      style={{
        background: 'rgba(251,191,36,0.06)',
        border: '1px solid rgba(251,191,36,0.12)',
        color: '#fbbf24',
      }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </motion.div>
  );
}

/* ==========================================================================
   LOGIN FORM — Console login avec toutes les animations
   ========================================================================== */
function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [easterEgg, setEasterEgg] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --- Credentials form state --- */
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credError, setCredError] = useState('');
  const [credLoading, setCredLoading] = useState(false);

  /* --- Parallax multi-couche (useRef + RAF, pas useState) --- */
  const gridRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      mouseRef.current = {
        x: (e.clientX - cx) / cx,
        y: (e.clientY - cy) / cy,
      };
    };

    const animate = () => {
      const { x, y } = mouseRef.current;
      if (gridRef.current) {
        gridRef.current.style.transform = `translate(${x * 3}px, ${y * 3}px)`;
      }
      if (particlesRef.current) {
        particlesRef.current.style.transform = `translate(${x * -5}px, ${y * -5}px)`;
      }
      if (mapRef.current) {
        mapRef.current.style.transform = `translate(${x * 1}px, ${y * 1}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleLogin = useCallback(() => {
    setIsLoading(true);
    signIn('keycloak', { callbackUrl });
  }, [callbackUrl]);

  /* --- Connexion credentials dev --- */
  const handleCredentialsLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError('');
    setCredLoading(true);
    try {
      const res = await signIn('credentials', {
        username,
        password,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setCredError('Identifiants incorrects. Essayez admin/admin ou agent/agent.');
      } else if (res?.url) {
        window.location.href = res.url;
      }
    } catch {
      setCredError('Erreur de connexion.');
    } finally {
      setCredLoading(false);
    }
  }, [username, password, callbackUrl]);

  /* --- Easter egg : triple-click logo --- */
  const handleLogoClick = useCallback(() => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      setEasterEgg(true);
      setTimeout(() => setEasterEgg(false), 2500);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 500);
    }
  }, []);

  return (
    <>
      {!bootDone && <BootSequence onComplete={() => setBootDone(true)} />}
      <FilmGrain />
      <CinematicVignette />
      <ScanlinesCRT />

      <div className="relative min-h-screen flex flex-col xl:flex-row overflow-hidden">
        {/* ==============================================================
            PANNEAU GAUCHE — Globe Theatre (55% desktop)
            ============================================================== */}
        <div className="relative xl:w-[55%] w-full xl:min-h-screen min-h-[50vh] flex items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #0D1F3C 0%, #070F1B 40%, #050A14 70%, #000000 100%)',
            }}
          >
            {/* Grille geometrique (parallax) */}
            <div
              ref={gridRef}
              className="absolute inset-0 opacity-[0.04] will-change-transform"
              style={{
                backgroundImage: `linear-gradient(rgba(251,191,36,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.5) 1px, transparent 1px)`,
                backgroundSize: '60px 60px',
              }}
            />

            <div className="absolute inset-0 bg-geo-mesh" />

            {/* Carte SVG Cote d Ivoire (parallax) */}
            <div ref={mapRef} className="absolute inset-0 will-change-transform">
              <svg
                viewBox="0 0 600 600"
                className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none"
                fill="none"
              >
                <path
                  d="M280 80 L320 75 L360 85 L400 78 L430 90 L450 110 L460 140 L470 170 L475 200 L480 230 L485 260 L478 290 L470 320 L460 350 L445 380 L430 400 L410 420 L385 440 L360 455 L335 465 L310 470 L285 475 L260 472 L235 465 L215 450 L195 435 L180 415 L170 390 L160 360 L155 330 L152 300 L150 270 L155 240 L162 210 L170 185 L185 160 L200 140 L218 120 L240 105 L260 90 Z"
                  stroke="url(#ciGradP)"
                  strokeWidth="2"
                  fill="rgba(251,191,36,0.03)"
                  className="animate-draw-in"
                />
                <circle cx="310" cy="380" r="4" fill="#fbbf24" opacity="0.3" />
                <circle cx="270" cy="280" r="3" fill="#fbbf24" opacity="0.2" />
                <circle cx="230" cy="200" r="3" fill="#06b6d4" opacity="0.2" />
                <circle cx="380" cy="250" r="3" fill="#06b6d4" opacity="0.2" />
                <circle cx="190" cy="300" r="3" fill="#8b5cf6" opacity="0.2" />
                <defs>
                  <linearGradient id="ciGradP" x1="150" y1="75" x2="485" y2="475">
                    <stop stopColor="#fbbf24" />
                    <stop offset="0.5" stopColor="#06b6d4" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Particules flottantes (parallax) */}
            <div ref={particlesRef} className="absolute inset-0 will-change-transform">
              <FloatingParticles />
            </div>

            <TargetPings />
          </div>

          {/* Globe 3D avec anneaux */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={bootDone ? { scale: 1, opacity: 1 } : {}}
            transition={{ delay: 0.3, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-[90%] max-w-[700px] xl:max-w-[900px] aspect-square flex items-center justify-center z-10"
          >
            <GlobeAnimation className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] opacity-100 z-10 pointer-events-auto" />

            {[100, 75, 50, 25].map((size, i) => (
              <motion.div
                key={size}
                initial={{ scale: 0, opacity: 0 }}
                animate={bootDone ? { scale: 1, opacity: 1 } : {}}
                transition={{ delay: 0.8 + i * 0.15, duration: 0.6, ease: 'easeOut' }}
                className="absolute rounded-full border"
                style={{
                  width: `${size}%`,
                  height: `${size}%`,
                  borderColor: `rgba(251,191,36,${0.05 + i * 0.08})`,
                }}
              />
            ))}

            <div className="absolute w-[80%] h-[80%] rounded-full border-[1.5px] border-gold-400/5 border-dashed animate-[spin_40s_linear_reverse_infinite]" />
            <div className="absolute w-[40%] h-[40%] rounded-full border-[1.5px] border-gold-400/10 border-dashed animate-[spin_30s_linear_infinite]" />

            {/* Satellite orbiting dot */}
            <div className="absolute w-full h-full animate-orbit-dot">
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400"
                style={{ boxShadow: '0 0 8px #06b6d4' }}
              />
            </div>

            {/* Radar sweep */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={bootDone ? { opacity: 1 } : {}}
              transition={{ delay: 1 }}
              className="absolute w-full h-full rounded-full overflow-hidden"
            >
              <div
                className="absolute top-1/2 left-1/2 w-[500px] h-[500px] origin-top-left animate-radar-spin"
                style={{
                  background: 'conic-gradient(from 180deg at 0 0, transparent 70%, rgba(251,191,36,0.05) 90%, rgba(251,191,36,0.3) 100%)',
                }}
              />
            </motion.div>

            <div className="absolute w-full h-[1px] bg-gold-400/10" />
            <div className="absolute w-[1px] h-full bg-gold-400/10" />

            <div className="absolute w-3 h-3 rounded-full bg-danger-400 top-[20%] left-[65%] animate-[pulse_3s_ease-in-out_infinite] shadow-[0_0_15px_rgba(239,68,68,0.9)]" />
            <div className="absolute w-2 h-2 rounded-full bg-gold-400 top-[40%] right-[20%] animate-[pulse_4s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
            <div className="absolute w-2 h-2 rounded-full bg-gold-400 bottom-[25%] left-[35%] animate-[pulse_2s_ease-in-out_infinite]" style={{ animationDelay: '2s' }} />
          </motion.div>

          {/* Scan-line doree */}
          <div
            className="absolute left-0 right-0 h-px opacity-30"
            style={{
              background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)',
              animation: 'scan-line 4s linear infinite',
            }}
          />

          {bootDone && <HUDTelemetry />}
        </div>

        {/* ==============================================================
            PANNEAU DROIT — Console Login (45% desktop)
            ============================================================== */}
        <div className="relative xl:w-[45%] w-full min-h-[50vh] xl:min-h-screen flex items-center justify-center px-4 xl:px-12">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, #050A14 0%, #0A1628 50%, #0D1F3C 100%)',
            }}
          />

          {/* Separateur vertical lumineux (desktop) */}
          <div className="hidden xl:block absolute left-0 top-0 bottom-0 w-px">
            <div
              className="w-full h-full"
              style={{
                background: 'linear-gradient(180deg, transparent 10%, rgba(251,191,36,0.15) 50%, transparent 90%)',
              }}
            />
          </div>

          {/* Login card — materialize blur->clear */}
          <motion.div
            initial={{ opacity: 0, y: 30, filter: 'blur(12px)' }}
            animate={bootDone ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md z-50"
          >
            <div className="glass-card text-center gradient-border p-8">
              {/* Status indicator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={bootDone ? { opacity: 1 } : {}}
                transition={{ delay: 1.5 }}
                className="flex items-center justify-center gap-2 mb-6"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 animate-[pulse_2s_ease-in-out_infinite]" />
                <span className="mono text-[10px] text-green-400/80 tracking-[0.2em] uppercase">
                  Systemes Operationnels
                </span>
              </motion.div>

              {/* Logo avec rotateY flip */}
              <motion.div
                initial={{ scale: 0, rotateY: -180 }}
                animate={bootDone ? { scale: 1, rotateY: 0 } : {}}
                transition={{ delay: 0.8, type: 'spring', stiffness: 200, damping: 15 }}
                className="mx-auto mb-4 flex justify-center"
                style={{ perspective: 600 }}
              >
                <GeoLogo onClick={handleLogoClick} />
              </motion.div>

              {/* Easter egg flash */}
              <AnimatePresence>
                {easterEgg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-2 mono text-[10px] text-danger-400 tracking-wider"
                  >
                    7.539N, 5.547W — TARGET LOCKED
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.p
                initial={{ opacity: 0 }}
                animate={bootDone ? { opacity: 1 } : {}}
                transition={{ delay: 1 }}
                className="text-[10px] text-cyan-400/70 mono tracking-[0.3em] uppercase mb-2"
              >
                GeoSmart Africa
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={bootDone ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.1 }}
                className="text-3xl font-bold bg-gradient-to-r from-gold-400 via-yellow-300 to-gold-500 bg-clip-text text-transparent mb-1"
              >
                Ge O&apos;Miner
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={bootDone ? { opacity: 1 } : {}}
                transition={{ delay: 1.2 }}
                className="text-sm text-geo-500 mb-8"
              >
                Centre de Commandement Geospatial
              </motion.p>

              <div
                className="w-16 h-px mx-auto mb-6"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.4), transparent)' }}
              />

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    className="mb-6 p-3 rounded-lg text-sm badge-critical flex items-center gap-2"
                  >
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {error === 'CredentialsSignin'
                        ? 'Identifiants incorrects. Veuillez reessayer.'
                        : error === 'SessionExpired'
                          ? 'Session expiree. Veuillez vous reconnecter.'
                          : 'Une erreur est survenue lors de la connexion.'}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bouton SSO — glow pulse + power-on */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={bootDone ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.4 }}
                whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(251,191,36,0.4)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full relative overflow-hidden rounded-xl py-4 px-6 font-semibold text-sm text-white transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed group animate-power-on"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #b45309 100%)',
                  boxShadow: '0 0 20px rgba(251,191,36,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                <div
                  className="absolute inset-0 opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.05) 55%, transparent 60%)',
                    animation: 'shimmer-sweep 3s ease-in-out infinite',
                  }}
                />

                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div
                      key="loader"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center gap-3"
                    >
                      <div className="relative w-5 h-5">
                        <div className="absolute inset-0 rounded-full border-2 border-white/30" />
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" />
                      </div>
                      <span>Redirection securisee...</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center gap-3"
                    >
                      <Power className="w-5 h-5" />
                      <span>Acces au Centre de Commande</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              <motion.div
                initial={{ opacity: 0 }}
                animate={bootDone ? { opacity: 1 } : {}}
                transition={{ delay: 1.6 }}
                className="mt-4 flex items-center justify-center gap-2"
              >
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium"
                  style={{
                    background: 'rgba(6,182,212,0.08)',
                    border: '1px solid rgba(6,182,212,0.15)',
                    color: '#06b6d4',
                  }}
                >
                  <Fingerprint className="w-3 h-3" />
                  SSO Securise — Keycloak 24
                </div>
              </motion.div>

              {/* Separateur OU */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={bootDone ? { opacity: 1 } : {}}
                transition={{ delay: 1.7 }}
                className="my-5 flex items-center gap-3"
              >
                <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.12)' }} />
                <span className="text-[10px] text-geo-600 uppercase tracking-widest mono">ou</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.12)' }} />
              </motion.div>

              {/* Formulaire Credentials dev */}
              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={bootDone ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.8 }}
                onSubmit={handleCredentialsLogin}
                className="space-y-3"
              >
                <div>
                  <input
                    type="text"
                    placeholder="Identifiant"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <input
                    type="password"
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    autoComplete="current-password"
                  />
                </div>

                {credError && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-danger-400 flex items-center gap-1.5"
                  >
                    <Shield className="w-3 h-3 flex-shrink-0" />
                    {credError}
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={credLoading || !username || !password}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(148,163,184,0.08)',
                    border: '1px solid rgba(148,163,184,0.15)',
                    color: '#cbd5e1',
                  }}
                >
                  {credLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Connexion...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Shield className="w-4 h-4" />
                      Connexion locale
                    </span>
                  )}
                </button>

                <p className="text-[10px] text-geo-700 text-center mono">
                  Dev : admin/admin ou agent/agent
                </p>
              </motion.form>

              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.1)' }} />
                <span className="text-[10px] text-geo-600 uppercase tracking-widest">Partenaires</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.1)' }} />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={bootDone ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.8 }}
                className="flex flex-wrap items-center justify-center gap-2 mb-6"
              >
                <PartnerBadge label="GSLOI" icon={Shield} />
                <PartnerBadge label="BRICM" icon={Satellite} />
                <PartnerBadge label="Min. Mines" icon={Radio} />
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={bootDone ? { opacity: 1 } : {}}
                transition={{ delay: 2 }}
                className="text-[11px] text-geo-600 leading-relaxed"
              >
                Protocole de securite GSLOI/Ministere actif
                <br />
                <span className="text-geo-700">
                  Contactez votre administrateur pour obtenir un compte.
                </span>
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={bootDone ? { opacity: 1 } : {}}
              transition={{ delay: 2.2 }}
              className="mt-4 text-center"
            >
              <p className="text-[9px] text-geo-700 mono tracking-wider">
                v2.0.0 — GEOMINER COMMAND CENTER — AUCTAL 360
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   PAGE EXPORTEE avec Suspense
   ========================================================================== */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0D1F3C 0%, #000000 100%)' }}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-gold-400/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold-400 animate-spin" />
            </div>
            <p className="text-sm text-geo-600 mono">Chargement...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

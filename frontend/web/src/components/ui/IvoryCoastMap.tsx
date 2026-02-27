'use client';

import { motion } from 'framer-motion';
import { Network } from 'lucide-react';

export default function IvoryCoastMap({ className }: { className?: string }) {
    // Coordonnees approchees pour le SVG viewBox="0 0 1000 1000"
    // Ce path est une version simplifiee mais reconnaissable des frontieres de la Cote d'Ivoire
    const ivoryCoastPath = "M 400 100 Q 420 80 450 120 Q 500 100 550 150 L 600 180 Q 650 200 680 250 L 720 300 Q 750 350 780 400 L 800 500 L 780 600 Q 750 700 700 800 Q 650 850 600 880 L 500 900 L 400 900 Q 350 850 300 800 Q 250 850 200 800 L 150 700 Q 100 600 150 500 Q 200 450 180 350 Q 200 250 250 200 L 300 150 Q 350 100 400 100 Z";

    return (
        <div className={`relative ${className} bg-geo-950/50 rounded-3xl border border-slate-800/60 overflow-hidden shadow-2xl backdrop-blur-sm group`}>

            {/* Header/HUD de la map */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-30 pointer-events-none">
                <div className="flex flex-col gap-1 text-xs font-mono">
                    <div className="inline-flex items-center gap-2 text-cyan-400 bg-cyan-950/40 px-3 py-1.5 rounded-md border border-cyan-500/20 backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        SATELLITE ORBIT: ACTIVE
                    </div>
                    <div className="text-slate-500 px-3 py-1">COORD: 7.5400° N, 5.5471° W</div>
                </div>

                {/* Mode tactique badge */}
                <div className="px-3 py-1.5 rounded-md border border-gold-500/30 bg-gold-950/30 text-gold-400 text-xs font-mono font-bold tracking-widest flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    CI_GRID
                </div>
            </div>

            {/* Scanline Effect (Laser de balayage) */}
            <motion.div
                className="absolute left-0 w-full h-[2px] bg-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.8)] z-20 pointer-events-none"
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
            {/* Overlay Gradient pour le scan */}
            <motion.div
                className="absolute left-0 w-full h-[150px] bg-gradient-to-b from-transparent to-cyan-500/10 z-10 pointer-events-none"
                animate={{ top: ['-150px', '100%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />

            {/* Conteneur principal de la map */}
            <div className="relative w-full h-[500px] lg:h-[600px] flex items-center justify-center p-8">
                <svg
                    viewBox="0 0 1000 1000"
                    className="w-full h-full max-h-[80%] drop-shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-transform duration-700 group-hover:scale-[1.02]"
                >
                    {/* Grille de fond SVG */}
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
                        </pattern>
                        {/* Glow effect definitions */}
                        <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="8" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    <rect width="1000" height="1000" fill="url(#grid)" />

                    {/* Le pays (Cote d'Ivoire) */}
                    <path
                        d={ivoryCoastPath}
                        fill="rgba(15,23,42,0.8)"
                        stroke="#06b6d4"
                        strokeWidth="3"
                        className="transition-colors duration-500"
                    />

                    {/* Inner stroke for depth */}
                    <path
                        d={ivoryCoastPath}
                        fill="none"
                        stroke="rgba(6,182,212,0.3)"
                        strokeWidth="8"
                        style={{ filter: "blur(4px)" }}
                    />

                    {/* --- TARGET 1 : Mine illegale detectee (Nord/Est) --- */}
                    <g transform="translate(600, 350)">
                        {/* Radar Pulse */}
                        <motion.circle
                            r="30" fill="none" stroke="#ef4444" strokeWidth="2"
                            animate={{ r: [10, 80], opacity: [0.8, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                        />
                        <motion.circle
                            r="10" fill="none" stroke="#ef4444" strokeWidth="1.5"
                            animate={{ r: [5, 40], opacity: [1, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                        />
                        <circle cx="0" cy="0" r="6" fill="#ef4444" filter="url(#glow-gold)" />

                        {/* Reticule */}
                        <path d="M -20 0 L -10 0 M 10 0 L 20 0 M 0 -20 L 0 -10 M 0 10 L 0 20" stroke="#ef4444" strokeWidth="2" />
                    </g>

                    {/* --- TARGET 2 : Capteur IoT AquaGuard actif (Ouest/Sud) --- */}
                    <g transform="translate(300, 650)">
                        {/* Radar Pulse */}
                        <motion.circle
                            r="20" fill="none" stroke="#06b6d4" strokeWidth="1.5"
                            animate={{ r: [5, 50], opacity: [0.5, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                        />
                        <circle cx="0" cy="0" r="5" fill="#06b6d4" />
                        <circle cx="0" cy="0" r="15" fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="4 4" />
                    </g>

                    {/* --- TARGET 3 : Zone en verification (Centre) --- */}
                    <g transform="translate(450, 500)">
                        <circle cx="0" cy="0" r="4" fill="#fbbf24" filter="url(#glow-gold)" />
                        <motion.path
                            d="M -15 -15 L 15 -15 L 15 15 L -15 15 Z"
                            fill="none" stroke="#fbbf24" strokeWidth="1" strokeDasharray="5 5"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                        />
                    </g>
                </svg>

                {/* --- HTML OVERLAYS (Tooltips & Annotations) --- */}
                {/* Annotation Target 1 (Danger) */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="absolute top-[25%] right-[15%] flex items-start gap-4 z-30"
                >
                    <div className="w-[100px] h-[1px] bg-danger-500 mt-3 absolute -left-[90px] origin-right -rotate-[15deg] opacity-50 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                    <div className="bg-slate-900/90 border border-danger-500/40 p-3 rounded-lg backdrop-blur-md shadow-lg shadow-danger-500/10 min-w-[200px]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-danger-400 font-mono text-xs font-bold bg-danger-500/10 px-2 py-0.5 rounded">ALERTE CRITIQUE</span>
                            <span className="flex w-2 h-2 rounded-full bg-danger-500 animate-pulse" />
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">Extraction Illégale (Or)</h4>
                        <p className="text-xs text-slate-400 mb-2 font-mono">CONF: 98.4% | SegFormer</p>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-danger-500 w-[98%]" />
                        </div>
                    </div>
                </motion.div>

                {/* Annotation Target 2 (IoT) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="absolute bottom-[20%] left-[10%] flex items-start gap-4 z-30"
                >
                    <div className="w-[80px] h-[1px] bg-cyan-500 mt-3 absolute -right-[70px] origin-left rotate-[20deg] opacity-50 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                    <div className="bg-slate-900/90 border border-cyan-500/40 p-3 rounded-lg backdrop-blur-md shadow-lg shadow-cyan-500/10 min-w-[180px]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-cyan-400 font-mono text-xs font-bold flex items-center gap-1">
                                <Network className="w-3 h-3" /> CAPTEUR IoT
                            </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">AquaGuard #04</h4>
                        <p className="text-xs text-slate-400 font-mono">Qualité Eau: NORMALE</p>
                    </div>
                </motion.div>

                {/* Annotation Target 3 (Verification) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 }}
                    className="absolute top-[48%] left-[45%] z-30"
                >
                    <div className="bg-slate-900/80 border border-gold-500/40 px-2 py-1 rounded backdrop-blur-md translate-x-4 -translate-y-4">
                        <span className="text-gold-400 font-mono text-[10px] whitespace-nowrap">SCAN EN COURS...</span>
                    </div>
                </motion.div>

            </div>

            {/* Corner Decorative Elements */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/50 m-4 pointer-events-none" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/50 m-4 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/50 m-4 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/50 m-4 pointer-events-none" />
        </div>
    );
}

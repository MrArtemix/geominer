'use client';

import createGlobe from 'cobe';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export default function GlobeAnimation({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointerInteracting = useRef<number | null>(null);
    const pointerInteractionMovement = useRef(0);
    const [r, setR] = useState(0);

    useEffect(() => {
        let phi = 4.2; // Start rotated to show West Africa
        let width = 0;

        // Resize handler
        const onResize = () => {
            if (canvasRef.current) {
                width = canvasRef.current.offsetWidth;
            }
        };
        window.addEventListener('resize', onResize);
        onResize();

        if (!canvasRef.current || width === 0) return;

        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: width * 2,
            height: width * 2,
            phi: 0,
            theta: 0.15,
            dark: 1,
            diffuse: 1.2,
            mapSamples: 16000,
            mapBrightness: 6,
            baseColor: [0.06, 0.09, 0.16], // slate/geo-950
            markerColor: [0.98, 0.75, 0.14], // fbbf24
            glowColor: [0.98, 0.75, 0.14], // fbbf24
            markers: [
                // Illicit Gold Mine Target in West Africa (e.g., Mali region ~ 12°N, 8°W)
                { location: [12.6392, -8.0029], size: 0.08 }
            ],
            onRender: (state) => {
                state.phi = phi + r;
                phi += 0.003;
                state.width = width * 2;
                state.height = width * 2;
            }
        });

        setTimeout(() => {
            if (canvasRef.current) canvasRef.current.style.opacity = '1';
        }, 100);

        return () => {
            globe.destroy();
            window.removeEventListener('resize', onResize);
        };
    }, [r]);

    return (
        <div className={`relative isolate ${className}`}>
            {/* Globe Canvas Container */}
            <div
                className="relative w-full aspect-square"
                onPointerDown={(e) => {
                    pointerInteracting.current =
                        e.clientX - pointerInteractionMovement.current;
                    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
                }}
                onPointerUp={() => {
                    pointerInteracting.current = null;
                    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
                }}
                onPointerOut={() => {
                    pointerInteracting.current = null;
                    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
                }}
                onMouseMove={(e) => {
                    if (pointerInteracting.current !== null) {
                        const delta = e.clientX - pointerInteracting.current;
                        pointerInteractionMovement.current = delta;
                        setR(delta / 200);
                    }
                }}
                onTouchMove={(e) => {
                    if (pointerInteracting.current !== null && e.touches[0]) {
                        const delta = e.touches[0].clientX - pointerInteracting.current;
                        pointerInteractionMovement.current = delta;
                        setR(delta / 100);
                    }
                }}
            >
                <canvas
                    ref={canvasRef}
                    className="w-full h-full opacity-0 transition-opacity duration-1000 cursor-grab z-10"
                />

                {/* Satellite and Targeting Beam */}
                <div className="absolute top-[20%] right-[35%] z-20 pointer-events-none">
                    <motion.div
                        initial={{ opacity: 0, y: -40, x: 40 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        transition={{ delay: 0.5, duration: 2, ease: "easeOut" }}
                        className="relative"
                    >
                        {/* Satellite SVG */}
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" className="text-gold-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)] relative z-20">
                            {/* Solar Panels & Body */}
                            <path d="M12 10L14 12L12 14L10 12L12 10Z" stroke="currentColor" strokeWidth="1.5" fill="rgba(30,41,59,0.8)" />
                            <path d="M7 6L5 8L8 11L10 9L7 6Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.3" />
                            <path d="M17 16L19 14L16 11L14 13L17 16Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.3" />
                            <path d="M13 9L15 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M11 15L9 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                        </svg>

                        {/* Laser Beam Targeting the Globe */}
                        <motion.div
                            className="absolute top-1/2 left-1/2 w-[2px] h-[220px] origin-top-left -rotate-[118deg] z-10"
                            style={{
                                background: 'linear-gradient(to bottom, rgba(251,191,36,0.8) 0%, rgba(251,191,36,0.1) 80%, transparent)',
                                boxShadow: '0 0 15px rgba(251,191,36,0.4)'
                            }}
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        />

                        {/* Targeting Reticle on the Ground (Mali) */}
                        <motion.div
                            className="absolute top-[85px] -left-[185px] w-12 h-12 z-30 pointer-events-none"
                            initial={{ opacity: 0, scale: 2 }}
                            animate={{ opacity: 1, scale: 1, rotate: 180 }}
                            transition={{ delay: 1.5, duration: 4, repeat: Infinity, repeatType: 'reverse' }}
                        >
                            <div className="absolute inset-0 border border-gold-400 rounded-full opacity-60" />
                            <div className="absolute top-0 left-1/2 w-[1px] h-2 bg-gold-400 -translate-x-1/2" />
                            <div className="absolute bottom-0 left-1/2 w-[1px] h-2 bg-gold-400 -translate-x-1/2" />
                            <div className="absolute left-0 top-1/2 h-[1px] w-2 bg-gold-400 -translate-y-1/2" />
                            <div className="absolute right-0 top-1/2 h-[1px] w-2 bg-gold-400 -translate-y-1/2" />
                            <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-danger-500 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_12px_rgba(239,68,68,1)] animate-pulse" />

                            {/* Target Details HUD Output - Removed per user request */}
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

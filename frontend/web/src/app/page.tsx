'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import GlobeAnimation from '@/components/ui/GlobeAnimation';
import { Shield, Satellite, Activity, ChevronRight, Fingerprint, Database, Cpu, Network, CheckCircle2, ArrowRight, Layers, FileSearch, Zap, MapPin } from 'lucide-react';
import IvoryCoastMap from '@/components/ui/IvoryCoastMap';

export default function WelcomePage() {
    return (
        <div className="relative min-h-screen bg-geo-950 text-slate-200 overflow-hidden font-sans">
            {/* Background Grids & FX */}
            <div className="absolute inset-0 z-0">
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: `
              linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)
            `,
                        backgroundSize: '60px 60px',
                    }}
                />
                <div className="absolute inset-0 bg-geo-mesh opacity-50" />
            </div>

            {/* Header */}
            <header className="absolute top-0 w-full z-40 px-8 py-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <svg viewBox="0 0 64 64" className="w-10 h-10" fill="none">
                        <path
                            d="M32 4L56 18V46L32 60L8 46V18L32 4Z"
                            stroke="url(#logoGradLand)"
                            strokeWidth="2"
                            fill="rgba(6,182,212,0.1)"
                        />
                        <circle cx="32" cy="32" r="8" stroke="#06b6d4" strokeWidth="1.5" />
                        <circle cx="32" cy="32" r="2" fill="#06b6d4" />
                        <defs>
                            <linearGradient id="logoGradLand" x1="8" y1="4" x2="56" y2="60">
                                <stop stopColor="#06b6d4" />
                                <stop offset="1" stopColor="#fbbf24" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-gold-400 bg-clip-text text-transparent tracking-wide">
                        GE O'MINER
                    </span>
                </div>
                <Link
                    href="/login"
                    className="px-5 py-2.5 rounded-full border border-cyan-500/30 text-cyan-400 text-sm font-medium hover:bg-cyan-500/10 transition-colors"
                >
                    Espace Client
                </Link>
            </header>

            <main className="relative z-10 w-full">
                {/* Hero Section */}
                <section className="relative min-h-screen flex items-center pt-24 pb-12 overflow-hidden">
                    <div className="max-w-7xl mx-auto w-full px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between gap-12">
                        {/* Left Typography & CTA */}
                        <div className="flex-1 w-full text-center lg:text-left z-20">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                            >
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-8 mx-auto lg:mx-0">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                    SYSTÈME DE SURVEILLANCE ACTIF v2.0
                                </div>

                                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
                                    L'Intelligence Spatiale au Service de notre <span className="bg-gradient-to-r from-gold-400 to-amber-500 bg-clip-text text-transparent">Terre</span>
                                </h1>

                                <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                                    Plateforme géospatiale avancée pour la surveillance minière.
                                    Détection par IA satellitaire, monitoring environnemental et contrôle cryptographique
                                    pour une souveraineté numérique totale.
                                </p>

                                <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                                    <Link
                                        href="/login"
                                        className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-semibold text-lg hover:from-cyan-500 hover:to-cyan-400 transition-all shadow-glow-cyan overflow-hidden"
                                    >
                                        <Shield className="w-5 h-5 relative z-10" />
                                        <span className="relative z-10">Accès Plateforme</span>
                                        <ChevronRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                                    </Link>
                                    <a
                                        href="#tech-stack"
                                        className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-slate-700 hover:bg-slate-800/50 text-slate-300 font-medium transition-colors"
                                    >
                                        Découvrir l'Architecture
                                    </a>
                                </div>
                            </motion.div>
                        </div>

                        {/* Right Globe Visualization */}
                        <div className="flex-1 w-full h-[500px] lg:h-[800px] relative pointer-events-none lg:pointer-events-auto">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2, duration: 1.2, ease: "easeOut" }}
                                className="absolute inset-0 flex items-center justify-center"
                            >
                                <GlobeAnimation className="w-full h-full max-w-[800px] z-10" />
                                {/* Ambient Back Glow */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-gold-500/20 blur-[120px] rounded-full z-0" />
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Tech Stack Section */}
                <section id="tech-stack" className="relative py-24 pb-32 border-t border-slate-800/50 bg-slate-900/20 backdrop-blur-sm">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">Architecture <span className="text-cyan-400">Souveraine</span></h2>
                            <p className="text-slate-400 max-w-2xl mx-auto">Une synergie de technologies de pointe pour garantir des résultats fiables, sécurisés et exploitables juridiquement.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Card 1: IA */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                                className="group p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-violet-500/50 transition-colors backdrop-blur-md"
                            >
                                <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Cpu className="w-6 h-6 text-violet-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-200 mb-3">Intelligence Artificielle</h3>
                                <p className="text-sm text-slate-400 leading-relaxed mb-4">Modèles de segmentation avancée (SegFormer-B4) analysant des milliers de kilomètres carrés d'images satellites pour détecter la déforestation et les mines clandestines avec 98% de précision.</p>
                                <div className="flex gap-2 text-xs font-mono text-violet-400">
                                    <span className="px-2 py-1 bg-violet-500/10 rounded">PyTorch</span>
                                    <span className="px-2 py-1 bg-violet-500/10 rounded">TensorRT</span>
                                </div>
                            </motion.div>

                            {/* Card 2: Blockchain */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="group p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-gold-500/50 transition-colors backdrop-blur-md"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Fingerprint className="w-6 h-6 text-gold-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-200 mb-3">Traçabilité Blockchain</h3>
                                <p className="text-sm text-slate-400 leading-relaxed mb-4">Registre distribué immuable enregistrant chaque transaction, rapport et alerte. Garantit la valeur probatoire des données pour les autorités légales via des Smart Contracts stricts.</p>
                                <div className="flex gap-2 text-xs font-mono text-gold-400">
                                    <span className="px-2 py-1 bg-gold-500/10 rounded">Hyperledger</span>
                                    <span className="px-2 py-1 bg-gold-500/10 rounded">Golang</span>
                                </div>
                            </motion.div>

                            {/* Card 3: IoT */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                                className="group p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-cyan-500/50 transition-colors backdrop-blur-md"
                            >
                                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Network className="w-6 h-6 text-cyan-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-200 mb-3">IoT Environnemental</h3>
                                <p className="text-sm text-slate-400 leading-relaxed mb-4">Réseau de capteurs hydrophiles (AquaGuard) déployés sur les fleuves pour détecter les pollutions chimiques (cyanure, mercure) liées au lavage de l'or en temps réel via LoRaWAN.</p>
                                <div className="flex gap-2 text-xs font-mono text-cyan-400">
                                    <span className="px-2 py-1 bg-cyan-500/10 rounded">MQTT</span>
                                    <span className="px-2 py-1 bg-cyan-500/10 rounded">TimescaleDB</span>
                                </div>
                            </motion.div>

                            {/* Card 4: PostGIS */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="group p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-blue-500/50 transition-colors backdrop-blur-md"
                            >
                                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Database className="w-6 h-6 text-blue-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-200 mb-3">Traitement Géospatial</h3>
                                <p className="text-sm text-slate-400 leading-relaxed mb-4">Moteur de base de données ultra-performant pour l'analyse spatiale complexe, le croisement des couches cadastrales avec les détections IA et la restitution sur carte vetorielle MapLibre.</p>
                                <div className="flex gap-2 text-xs font-mono text-blue-400">
                                    <span className="px-2 py-1 bg-blue-500/10 rounded">PostGIS</span>
                                    <span className="px-2 py-1 bg-blue-500/10 rounded">FastAPI</span>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Workflow Section */}
                <section className="py-24 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-cyan-500/5 blur-[150px] rounded-full pointer-events-none" />
                    <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                            className="text-center mb-20"
                        >
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">Cycle de <span className="text-gold-400">Surveillance Continu</span></h2>
                            <p className="text-slate-400 max-w-2xl mx-auto">De l'orbite terrestre jusqu'à l'intervention sur le terrain, notre pipeline de détection est entièrement automatisé.</p>
                        </motion.div>

                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative">
                            {/* Connecting Line (Desktop) with Animation */}
                            <div className="hidden md:block absolute top-[60px] left-[10%] right-[10%] h-0.5 bg-slate-800 z-0 overflow-hidden">
                                <motion.div
                                    className="absolute top-0 left-0 w-1/4 h-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80"
                                    animate={{ left: ['-25%', '125%'] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                />
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-cyan-500/20 to-gold-400/20" />
                            </div>

                            {/* Step 1 */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="relative z-10 flex flex-col items-center text-center max-w-[250px] group"
                            >
                                <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-cyan-500/30 flex items-center justify-center mb-6 group-hover:border-cyan-400 group-hover:shadow-glow-cyan transition-all relative">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-[-4px] border border-cyan-500/10 rounded-full border-dashed" />
                                    <Satellite className="w-8 h-8 text-cyan-400 relative z-10" />
                                </div>
                                <h4 className="text-lg font-bold text-slate-200 mb-2">1. Acquisition</h4>
                                <p className="text-sm text-slate-400">Collecte d'images satellites (Sentinel/Planet) et de données IoT des capteurs fluviaux.</p>
                            </motion.div>

                            <ArrowRight className="hidden md:block w-6 h-6 text-slate-600" />

                            {/* Step 2 */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="relative z-10 flex flex-col items-center text-center max-w-[250px] group"
                            >
                                <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-violet-500/30 flex items-center justify-center mb-6 group-hover:border-violet-400 group-hover:shadow-glow-violet transition-all">
                                    <Cpu className="w-8 h-8 text-violet-400" />
                                </div>
                                <h4 className="text-lg font-bold text-slate-200 mb-2">2. Analyse IA</h4>
                                <p className="text-sm text-slate-400">Le pipeline Prefect lance les modèles SegFormer pour repérer les excavations illégales.</p>
                            </motion.div>

                            <ArrowRight className="hidden md:block w-6 h-6 text-slate-600" />

                            {/* Step 3 */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.5 }}
                                className="relative z-10 flex flex-col items-center text-center max-w-[250px] group"
                            >
                                <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-gold-500/30 flex items-center justify-center mb-6 group-hover:border-gold-400 group-hover:shadow-glow-gold transition-all">
                                    <Activity className="w-8 h-8 text-gold-400" />
                                </div>
                                <h4 className="text-lg font-bold text-slate-200 mb-2">3. Vérification</h4>
                                <p className="text-sm text-slate-400">Génération d'alertes ancrées dans la Blockchain pour valider l'infraction de manière immuable.</p>
                            </motion.div>

                            <ArrowRight className="hidden md:block w-6 h-6 text-slate-600" />

                            {/* Step 4 */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.7 }}
                                className="relative z-10 flex flex-col items-center text-center max-w-[250px] group"
                            >
                                <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-danger-500/30 flex items-center justify-center mb-6 group-hover:border-danger-400 group-hover:shadow-glow-danger transition-all relative">
                                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 bg-danger-500/20 rounded-full" />
                                    <Shield className="w-8 h-8 text-danger-400 relative z-10" />
                                </div>
                                <h4 className="text-lg font-bold text-slate-200 mb-2">4. Action GSLOI</h4>
                                <p className="text-sm text-slate-400">Transmission des coordonnées GPS exactes aux équipes tactiques pour intervention.</p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Interactive Map Section */}
                <section className="py-24 relative overflow-hidden bg-slate-900/30 border-t border-slate-800/50">
                    <div className="absolute top-1/2 left-[20%] w-[600px] h-[600px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2" />
                    <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
                        <div className="flex flex-col lg:flex-row gap-16 items-center">
                            {/* Left Text Detail */}
                            <div className="flex-1">
                                <motion.div
                                    initial={{ opacity: 0, x: -30 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6 }}
                                >
                                    <h2 className="text-3xl md:text-5xl font-bold mb-6">Contrôle Total du <span className="text-cyan-400">Territoire</span></h2>
                                    <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                                        Notre Interface Opérationnelle permet un ciblage topographique absolu. Les anomalies identifiées par l'IA ou les sondes IoT sont projetées en temps réel sur une grille vectorielle interactive.
                                    </p>

                                    <div className="space-y-6">
                                        <div className="flex gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-danger-500/10 flex items-center justify-center border border-danger-500/20 shrink-0">
                                                <Activity className="w-6 h-6 text-danger-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-semibold mb-1">Ciblage d'Excavations Illégales</h4>
                                                <p className="text-sm text-slate-400">Détection des zones de lavage d'or dissimulées sous la canopée via les capteurs Radar (SAR) des satellites Sentinel-1.</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shrink-0">
                                                <MapPin className="w-6 h-6 text-cyan-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-semibold mb-1">Réseau IoT Hydrographique</h4>
                                                <p className="text-sm text-slate-400">Balises AquaGuard rapportant la turbidité et les niveaux de mercure sur l'ensemble du réseau fluvial ivoirien.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <Link
                                        href="/login"
                                        className="inline-flex items-center gap-2 mt-10 px-6 py-3 rounded-lg text-cyan-400 font-medium hover:bg-cyan-500/10 transition-colors border border-cyan-500/30"
                                    >
                                        Ouvrir le Centre de Contrôle <ChevronRight className="w-4 h-4" />
                                    </Link>
                                </motion.div>
                            </div>

                            {/* Right Interactive Map */}
                            <div className="flex-1 w-full relative">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.8, delay: 0.2 }}
                                >
                                    <IvoryCoastMap className="w-full" />
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Additional Platform Capabilities Section */}
                <section className="py-24 bg-slate-900/30 border-t border-slate-800/50">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">Fonctionnalités <span className="text-cyan-400">Avancées</span></h2>
                            <p className="text-slate-400 max-w-2xl">Outils décisionnels et tactiques conçus pour les autorités de régulation et les forces d'intervention.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4 }}
                                className="flex flex-col gap-4 p-8 rounded-3xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700/50"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 text-cyan-400 mb-2">
                                    <Layers className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold">Cartographie Tactique 3D</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">Visualisation topographique en temps réel des zones d'intérêt. Superposition de couches cadastrales, hydrographiques et détections d'anomalies sur une interface fluide MapLibre.</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: 0.1 }}
                                className="flex flex-col gap-4 p-8 rounded-3xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700/50"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-gold-500/10 flex items-center justify-center border border-gold-500/20 text-gold-400 mb-2">
                                    <FileSearch className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold">Rapports Probatoires</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">Génération automatique de dossiers d'intervention complets avec preuves satellites (avant/après), données IoT environnementales et signature numérique certifiée (Hash Blockchain).</p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: 0.2 }}
                                className="flex flex-col gap-4 p-8 rounded-3xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700/50"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20 text-violet-400 mb-2">
                                    <Zap className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold">Alertes Temps Réel</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">Notification immédiate push/email/SMS lors d'activités suspectes majeures évaluées par l'IA ou modifications soudaines de la qualité de l'eau repérées par le réseau AquaGuard.</p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Partners & Stats */}
                <section className="py-24 border-t border-slate-800/50 relative">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div>
                                <h2 className="text-3xl md:text-5xl font-bold mb-6">Confiance & <br />Transparence</h2>
                                <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                                    Ge O'Miner est une plateforme d'État construite en respectant les normes de sécurité les plus strictes. Utilisant une authentification SSO (Keycloak) et des stockages souverains (MinIO).
                                </p>

                                <div className="flex flex-col gap-4 mb-8">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-gold-400" />
                                        <span className="text-slate-300">Conformité RGPD et directives nationales</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-gold-400" />
                                        <span className="text-slate-300">Audits de sécurité par organismes tiers</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-gold-400" />
                                        <span className="text-slate-300">Disponibilité garantie 99.9%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 text-center">
                                    <div className="text-4xl font-black text-white mb-2 font-mono">322,462</div>
                                    <div className="text-sm text-slate-400">Hectares Scannés / Jour</div>
                                </div>
                                <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 text-center">
                                    <div className="text-4xl font-black text-cyan-400 mb-2 font-mono">{`< 2s`}</div>
                                    <div className="text-sm text-slate-400">Temps de Traitement Alerte</div>
                                </div>
                                <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 text-center">
                                    <div className="text-4xl font-black text-violet-400 mb-2 font-mono">98.5%</div>
                                    <div className="text-sm text-slate-400">Précision Modèle IA</div>
                                </div>
                                <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-gold-500/20 shadow-glow-gold text-center">
                                    <div className="text-4xl font-black text-gold-400 mb-2 font-mono">100%</div>
                                    <div className="text-sm text-slate-400">Traçabilité Immutable</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-800/80 bg-slate-950 py-12 relative z-20">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-gold-400 bg-clip-text text-transparent">
                                GE O'MINER
                            </span>
                            <span className="text-sm text-slate-500 border-l border-slate-700 pl-3">
                                Propulsé par GeoSmart Africa
                            </span>
                        </div>

                        <div className="flex gap-6 text-sm text-slate-400">
                            <Link href="#" className="hover:text-cyan-400 transition-colors">Mentions Légales</Link>
                            <Link href="#" className="hover:text-cyan-400 transition-colors">Confidentialité</Link>
                            <Link href="#" className="hover:text-cyan-400 transition-colors">Support GSLOI</Link>
                        </div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-slate-800/50 flex justify-between items-center text-xs text-slate-500">
                        <p>© 2026 AUCTAL 360 / République de Côte d'Ivoire. Tous droits réservés.</p>
                        <p className="font-mono">SYS_VERSION: 2.0.4-STABLE</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}

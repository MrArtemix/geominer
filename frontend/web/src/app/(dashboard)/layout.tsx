'use client';

/* ============================================================================
   Ge O'Miner - Layout Dashboard ENRICHI
   Sidebar 240px fixe, navigation par role, header glassmorphic,
   mobile responsive avec collapse hamburger
   ============================================================================ */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  LayoutDashboard,
  Map,
  Mountain,
  Bell,
  BarChart3,
  Droplets,
  Gem,
  Pickaxe,
  Award,
  FileBarChart,
  Shield,
  Menu,
  X,
  LogOut,
  User,
  Settings,
  ChevronRight,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { useAlertStore } from '@/stores/alertStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';

/* ---------- Types ---------- */

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  showBadge?: boolean;
  /** Roles requis pour voir cet item (vide = accessible a tous les roles dashboard) */
  requiredRoles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/* ---------- Constantes de roles ---------- */

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN_MINES: 'ADMIN_MINES',
  COORDINATEUR_REGIONAL: 'COORDINATEUR_REGIONAL',
  ANALYSTE_SIG: 'ANALYSTE_SIG',
  AGENT_TERRAIN: 'AGENT_TERRAIN',
  OPERATEUR_AQUAGUARD: 'OPERATEUR_AQUAGUARD',
  AUDITEUR_GOLDPATH: 'AUDITEUR_GOLDPATH',
  OBSERVATEUR: 'OBSERVATEUR',
} as const;

/* Couleurs de badge par role */
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SUPER_ADMIN: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
  ADMIN_MINES: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  COORDINATEUR_REGIONAL: { bg: 'rgba(139,92,246,0.12)', text: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  ANALYSTE_SIG: { bg: 'rgba(6,182,212,0.12)', text: '#22d3ee', border: 'rgba(6,182,212,0.3)' },
  AGENT_TERRAIN: { bg: 'rgba(251,191,36,0.12)', text: '#fcd34d', border: 'rgba(251,191,36,0.3)' },
  OPERATEUR_AQUAGUARD: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  AUDITEUR_GOLDPATH: { bg: 'rgba(251,191,36,0.12)', text: '#fcd34d', border: 'rgba(251,191,36,0.3)' },
  OBSERVATEUR: { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)' },
};

/* Labels lisibles pour les roles */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_MINES: 'Admin Mines',
  COORDINATEUR_REGIONAL: 'Coord. Regional',
  ANALYSTE_SIG: 'Analyste SIG',
  AGENT_TERRAIN: 'Agent Terrain',
  OPERATEUR_AQUAGUARD: 'Op. AquaGuard',
  AUDITEUR_GOLDPATH: 'Auditeur GoldPath',
  OBSERVATEUR: 'Observateur',
};

/* ---------- Groupes de navigation ---------- */

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operational Layers',
    items: [
      { name: 'Operational Risk', href: '/operations/risk', icon: Shield, requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MINES, ROLES.COORDINATEUR_REGIONAL] },
      { name: 'Concessions', href: '/concessions', icon: Pickaxe, requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MINES] },
      { name: 'Geography', href: '/map', icon: Map },
      { name: 'Scenario', href: '/scenario', icon: BarChart3, requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MINES, ROLES.ANALYSTE_SIG] },
      { name: 'HIV', href: '/hiv', icon: Droplets, requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_MINES, ROLES.OPERATEUR_AQUAGUARD] },
    ],
  },
  {
    label: 'Modules',
    items: [
      { name: 'Operations', href: '/operations', icon: Pickaxe },
      { name: 'Operational GIS', href: '/gis', icon: Map, requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ANALYSTE_SIG] },
      { name: 'Alerts', href: '/alerts', icon: Bell, showBadge: true },
    ],
  },
];

/* ---------- Logo SVG Sidebar ---------- */

function GeoLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7 flex-shrink-0" fill="none">
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        stroke="url(#sideLogoGrad)"
        strokeWidth="1.5"
        fill="rgba(251,191,36,0.1)"
      />
      <circle cx="16" cy="16" r="4" stroke="#fbbf24" strokeWidth="1" />
      <circle cx="16" cy="16" r="1" fill="#fbbf24" />
      <defs>
        <linearGradient id="sideLogoGrad" x1="4" y1="2" x2="28" y2="30">
          <stop stopColor="#fbbf24" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ---------- Composant Breadcrumb ---------- */

function Breadcrumb({ pathname, navItems }: { pathname: string; navItems: NavItem[] }) {
  const currentItem = navItems.find((item) => {
    if (item.href === '/dashboard' || item.href === '/') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname.startsWith(item.href);
  });

  /* Segments du chemin pour les sous-pages */
  const segments = pathname.split('/').filter(Boolean);

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Link href="/dashboard" className="text-geo-600 hover:text-geo-400 transition-colors">
        Accueil
      </Link>
      {currentItem && currentItem.href !== '/dashboard' && (
        <>
          <ChevronRight className="w-3 h-3 text-geo-700" />
          <Link href={currentItem.href} className="text-geo-400 font-medium">
            {currentItem.name}
          </Link>
        </>
      )}
      {segments.length > 2 && (
        <>
          <ChevronRight className="w-3 h-3 text-geo-700" />
          <span className="text-geo-500 capitalize">
            {segments[segments.length - 1]}
          </span>
        </>
      )}
    </div>
  );
}

/* ---------- Layout principal ---------- */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { roles, hasRole } = useAuth();
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const { status: wsStatus } = useWebSocket();

  /* Role principal de l'utilisateur (le plus eleve) */
  const primaryRole = useMemo(() => {
    const roleOrder = [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN_MINES,
      ROLES.COORDINATEUR_REGIONAL,
      ROLES.ANALYSTE_SIG,
      ROLES.AGENT_TERRAIN,
      ROLES.OPERATEUR_AQUAGUARD,
      ROLES.AUDITEUR_GOLDPATH,
      ROLES.OBSERVATEUR,
    ];
    if (!roles || roles.length === 0) return ROLES.OBSERVATEUR;
    return roleOrder.find((r) => roles.includes(r)) || ROLES.OBSERVATEUR;
  }, [roles]);

  const roleStyle = ROLE_COLORS[primaryRole] || ROLE_COLORS.OBSERVATEUR;
  const roleLabel = ROLE_LABELS[primaryRole] || primaryRole;

  /* Filtrage des items de navigation selon les roles utilisateur */
  const filteredNavGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          /* Si pas de roles requis, visible par tous */
          if (!item.requiredRoles || item.requiredRoles.length === 0) return true;
          /* Verifier si l'utilisateur a au moins un role requis */
          return item.requiredRoles.some((role) => hasRole(role));
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [hasRole]);

  /* Tous les items aplatis pour le breadcrumb */
  const allNavItems = useMemo(
    () => filteredNavGroups.flatMap((g) => g.items),
    [filteredNavGroups]
  );

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname.startsWith(href);
  };

  /* Initiale de l'utilisateur pour l'avatar */
  const userInitial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : 'U';

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="min-h-screen flex bg-[var(--bg-deep)] text-[var(--text-primary)]">
        {/* ===== Overlay mobile ===== */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ===== SIDEBAR 240px ===== */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 ease-out
            lg:translate-x-0 lg:static lg:z-auto flex-shrink-0 bg-[var(--sidebar-bg)] border-r border-[var(--border-subtle)]
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="flex flex-col h-full">
            {/* En-tete sidebar : logo + nom */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/[0.06]">
              <Link href="/dashboard" className="flex items-center gap-2.5 group">
                <motion.div whileHover={{ rotate: 15 }} transition={{ type: 'spring', stiffness: 400 }}>
                  <GeoLogo />
                </motion.div>
                <div>
                  <span className="text-base font-bold bg-gradient-to-r from-gold-400 to-cyan-400 bg-clip-text text-transparent">
                    Ge O&apos;Miner
                  </span>
                  <p className="text-[10px] text-geo-600 mono tracking-wider">
                    GeoSmart Africa
                  </p>
                </div>
              </Link>
              {/* Bouton fermer sidebar (mobile) */}
              <button
                className="lg:hidden p-1 rounded-md text-geo-500 hover:text-geo-400 transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation groupee filtree par role */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6 sidebar-nav-scroll">
              {filteredNavGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-geo-600">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <li key={item.name}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <Link
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${active
                                    ? 'bg-amber-600/10 text-gold-500 border-l-2 border-gold-500'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                  }`}
                                onClick={() => setSidebarOpen(false)}
                              >
                                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                                <span className="flex-1 truncate">{item.name}</span>
                                {/* Badge alertes non-lues */}
                                {item.showBadge && unreadCount > 0 && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold bg-danger-500/20 text-danger-400 border border-danger-500/30 px-1.5"
                                  >
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                  </motion.span>
                                )}
                              </Link>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                side="right"
                                sideOffset={8}
                                className="z-[60] px-3 py-1.5 rounded-lg text-xs font-medium text-geo-300 shadow-lg lg:hidden"
                                style={{
                                  background: 'rgba(30, 41, 59, 0.95)',
                                  border: '1px solid rgba(148, 163, 184, 0.12)',
                                  backdropFilter: 'blur(12px)',
                                }}
                              >
                                {item.name}
                                <Tooltip.Arrow
                                  className="fill-[rgba(30,41,59,0.95)]"
                                />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            {/* Pied de sidebar : WebSocket + info utilisateur */}
            <div className="p-4 border-t border-white/[0.06] space-y-3">
              {/* Indicateur WebSocket temps reel */}
              <div className="flex items-center gap-2 px-1">
                {wsStatus === 'connected' ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-500" />
                    </span>
                    <Wifi className="w-3 h-3 text-gold-400/60" />
                    <span className="text-[11px] text-gold-400/80 mono">Temps reel</span>
                  </>
                ) : wsStatus === 'connecting' ? (
                  <>
                    <Loader2 className="w-3 h-3 text-gold-400 animate-spin" />
                    <span className="text-[11px] text-gold-400/80 mono">Connexion...</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-danger-500" />
                    <WifiOff className="w-3 h-3 text-danger-400/60" />
                    <span className="text-[11px] text-danger-400/80 mono">Deconnecte</span>
                  </>
                )}
              </div>

              {/* Info utilisateur compacte */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-bold">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-geo-400 truncate">
                    {session?.user?.name || 'Utilisateur'}
                  </p>
                  <p className="text-[11px] text-geo-600 truncate">
                    {session?.user?.email || ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ===== ZONE PRINCIPALE ===== */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Header */}
          <header
            className="flex-shrink-0 h-[72px] flex items-center justify-between px-4 lg:px-6 bg-[var(--bg-deep)] border-b border-[var(--border-subtle)] z-30"
          >
            {/* Gauche : hamburger + breadcrumb */}
            <div className="flex items-center gap-4">
              <button
                className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Breadcrumb */}
              <div className="hidden sm:block">
                <Breadcrumb pathname={pathname} navItems={allNavItems} />
              </div>

              {/* Nom de page sur mobile */}
              <h1 className="text-base font-semibold text-geo-400 sm:hidden truncate">
                {allNavItems.find((n) => isActive(n.href))?.name || 'Tableau de bord'}
              </h1>
            </div>

            {/* Droite : badge role, cloche alertes, user dropdown */}
            <div className="flex items-center gap-2">
              {/* Badge role couleur */}
              <div
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
                style={{
                  background: roleStyle.bg,
                  color: roleStyle.text,
                  border: `1px solid ${roleStyle.border}`,
                }}
              >
                <Shield className="w-3 h-3" />
                {roleLabel}
              </div>

              {/* Cloche alertes avec badge rouge */}
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Link
                    href="/alerts"
                    className="relative p-2 rounded-lg text-geo-500 hover:text-geo-400 hover:bg-white/[0.04] transition-colors"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold bg-danger-500 text-white px-1 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </motion.span>
                    )}
                  </Link>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="bottom"
                    sideOffset={8}
                    className="z-[60] px-3 py-1.5 rounded-lg text-xs font-medium text-geo-300 shadow-lg"
                    style={{
                      background: 'rgba(30, 41, 59, 0.95)',
                      border: '1px solid rgba(148, 163, 184, 0.12)',
                    }}
                  >
                    {unreadCount > 0
                      ? `${unreadCount} alerte${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
                      : 'Aucune nouvelle alerte'}
                    <Tooltip.Arrow className="fill-[rgba(30,41,59,0.95)]" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              {/* User dropdown Radix */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex items-center gap-2 p-2 rounded-lg text-geo-500 hover:text-geo-400 hover:bg-white/[0.04] transition-colors outline-none">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-bold">
                      {userInitial}
                    </div>
                    <span className="hidden md:block text-sm font-medium text-geo-400">
                      {session?.user?.name || 'Utilisateur'}
                    </span>
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 min-w-[220px] rounded-xl p-1.5 shadow-glass"
                    style={{
                      background: 'rgba(30, 41, 59, 0.95)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(148, 163, 184, 0.12)',
                    }}
                    sideOffset={8}
                    align="end"
                  >
                    {/* Info utilisateur dans le dropdown */}
                    <div className="px-3 py-2 mb-1 border-b border-white/[0.06]">
                      <p className="text-sm font-medium text-geo-400">
                        {session?.user?.name}
                      </p>
                      <p className="text-xs text-geo-600">
                        {session?.user?.email}
                      </p>
                      <div
                        className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold"
                        style={{
                          background: roleStyle.bg,
                          color: roleStyle.text,
                          border: `1px solid ${roleStyle.border}`,
                        }}
                      >
                        <Shield className="w-2.5 h-2.5" />
                        {roleLabel}
                      </div>
                    </div>

                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-geo-500 hover:text-geo-400 hover:bg-white/[0.04] rounded-lg cursor-pointer outline-none"
                    >
                      <User className="w-4 h-4" />
                      Mon profil
                    </DropdownMenu.Item>

                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-geo-500 hover:text-geo-400 hover:bg-white/[0.04] rounded-lg cursor-pointer outline-none"
                    >
                      <Settings className="w-4 h-4" />
                      Parametres
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px my-1 bg-white/[0.06]" />

                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-danger-400 hover:bg-danger-500/10 rounded-lg cursor-pointer outline-none"
                      onSelect={() => signOut({ callbackUrl: '/login' })}
                    >
                      <LogOut className="w-4 h-4" />
                      Se deconnecter
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </header>

          {/* Contenu de page avec scroll */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

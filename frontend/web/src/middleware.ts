/* ============================================================================
   Ge O'Miner - Middleware de protection des routes
   - Routes publiques : /login, /demo, /api/auth/*
   - Dashboard : role minimum AGENT_TERRAIN
   - Admin : SUPER_ADMIN ou ADMIN_MINES uniquement
   ============================================================================ */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/* ---------- Constantes de roles ---------- */

/** Tous les roles du systeme Keycloak Ge O'Miner */
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

/** Roles autorises pour l'acces au dashboard (tous sauf observateur seul) */
const DASHBOARD_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_MINES,
  ROLES.COORDINATEUR_REGIONAL,
  ROLES.ANALYSTE_SIG,
  ROLES.AGENT_TERRAIN,
  ROLES.OPERATEUR_AQUAGUARD,
  ROLES.AUDITEUR_GOLDPATH,
];

/** Roles autorises pour la section administration */
const ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_MINES,
];

/* ---------- Routes publiques (pas de session requise) ---------- */

const PUBLIC_PATHS = ['/login', '/demo', '/api/auth'];

/** Verifie si un chemin est public */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

/** Verifie si l'utilisateur possede au moins un des roles requis */
function hasAnyRole(userRoles: string[] | undefined, requiredRoles: string[]): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  return requiredRoles.some((role) => userRoles.includes(role));
}

/* ---------- Middleware principal ---------- */

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    /* Routes publiques : laisser passer */
    if (pathname === '/' || isPublicPath(pathname)) {
      return NextResponse.next();
    }

    /* Extraction des roles depuis le token JWT Keycloak */
    const userRoles = (token?.roles as string[]) ?? [];

    /* Protection /admin/* : uniquement SUPER_ADMIN et ADMIN_MINES */
    if (pathname.startsWith('/admin')) {
      if (!hasAnyRole(userRoles, ADMIN_ROLES)) {
        /* Rediriger vers le dashboard avec message d'acces refuse */
        const url = req.nextUrl.clone();
        url.pathname = '/dashboard';
        url.searchParams.set('error', 'access_denied');
        url.searchParams.set(
          'message',
          'Acces reserve aux administrateurs.'
        );
        return NextResponse.redirect(url);
      }
    }

    /* Protection /dashboard et routes protegees : role minimum AGENT_TERRAIN */
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/map') ||
      pathname.startsWith('/sites') ||
      pathname.startsWith('/alerts') ||
      pathname.startsWith('/analytics') ||
      pathname.startsWith('/aquaguard') ||
      pathname.startsWith('/goldtrack') ||
      pathname.startsWith('/operations') ||
      pathname.startsWith('/goldpath') ||
      pathname.startsWith('/reports')
    ) {
      if (!hasAnyRole(userRoles, DASHBOARD_ROLES)) {
        /* Rediriger vers login si aucun role dashboard */
        const url = req.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('error', 'InsufficientRole');
        url.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(url);
      }
    }

    /* Toute autre route : autoriser si authentifie */
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        /* Route racine : toujours accessible */
        if (pathname === '/') {
          return true;
        }

        /* Routes publiques */
        if (isPublicPath(pathname)) {
          return true;
        }

        /* Toutes les autres routes necessitent un token valide */
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

/* ---------- Configuration du matcher ---------- */

export const config = {
  matcher: [
    /*
     * Correspondre a toutes les routes sauf :
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation d'images)
     * - favicon.ico
     * - Fichiers publics (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

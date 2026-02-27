import type { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import CredentialsProvider from 'next-auth/providers/credentials';
import { useSession as useNextAuthSession } from 'next-auth/react';
import { useMemo } from 'react';

/* ============================================================================
   Ge O'Miner - Configuration NextAuth + hook useAuth enrichi
   Gestion SSO Keycloak + Credentials dev, extraction des roles, token JWT,
   helpers de verification de permissions
   ============================================================================ */

/* ---------- Constantes de roles ---------- */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN_MINES: 'ADMIN_MINES',
  COORDINATEUR_REGIONAL: 'COORDINATEUR_REGIONAL',
  ANALYSTE_SIG: 'ANALYSTE_SIG',
  AGENT_TERRAIN: 'AGENT_TERRAIN',
  OPERATEUR_AQUAGUARD: 'OPERATEUR_AQUAGUARD',
  AUDITEUR_GOLDPATH: 'AUDITEUR_GOLDPATH',
  OBSERVATEUR: 'OBSERVATEUR',
} as const;

/** Hierarchie des roles (du plus eleve au plus bas) */
const ROLE_HIERARCHY: string[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_MINES,
  ROLES.COORDINATEUR_REGIONAL,
  ROLES.ANALYSTE_SIG,
  ROLES.AGENT_TERRAIN,
  ROLES.OPERATEUR_AQUAGUARD,
  ROLES.AUDITEUR_GOLDPATH,
  ROLES.OBSERVATEUR,
];

/* -------------------------------------------------------------------------- */
/*  Configuration NextAuth                                                     */
/* -------------------------------------------------------------------------- */

export const authOptions: NextAuthOptions = {
  providers: [
    /* Fournisseur principal : Keycloak SSO */
    KeycloakProvider({
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'geominer-web',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      issuer: `${process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080'}/realms/${
        process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'geominer'
      }`,
    }),

    /* Fournisseur de secours pour le developpement local */
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Identifiant', type: 'text', placeholder: 'admin' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (credentials?.username === 'admin' && credentials?.password === 'admin') {
          return {
            id: '1',
            name: 'Administrateur',
            email: 'admin@geominer.local',
          };
        }
        if (credentials?.username === 'agent' && credentials?.password === 'agent') {
          return {
            id: '2',
            name: 'Agent Terrain',
            email: 'agent@geominer.local',
          };
        }
        return null;
      },
    }),
  ],

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, /* 24 heures */
  },

  callbacks: {
    async jwt({ token, user, account, profile }) {
      /* Lors de la connexion initiale, stocker le token d'acces et les roles */
      if (account && user) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.idToken = account.id_token;
      }

      /* Extraire les roles depuis le token Keycloak */
      if (profile) {
        const keycloakProfile = profile as any;
        token.roles =
          keycloakProfile?.realm_access?.roles ||
          keycloakProfile?.resource_access?.['geominer-web']?.roles ||
          [];
      }

      /* Roles par defaut pour le mode developpement (Credentials) */
      if (!token.roles && user) {
        if (user.email === 'admin@geominer.local') {
          token.roles = ['SUPER_ADMIN', 'ADMIN_MINES'];
        } else if (user.email === 'agent@geominer.local') {
          token.roles = ['AGENT_TERRAIN'];
        } else {
          token.roles = ['OBSERVATEUR'];
        }
      }

      /* Verifier l'expiration du token */
      if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number)) {
        token.error = 'TokenExpired';
      }

      return token;
    },

    async session({ session, token }) {
      /* Exposer le token d'acces et les roles au client */
      session.accessToken = token.accessToken as string;
      session.roles = (token.roles as string[]) || [];
      session.error = token.error as string | undefined;

      if (token.sub) {
        session.user = {
          ...session.user,
          id: token.sub,
        };
      }

      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/* -------------------------------------------------------------------------- */
/*  Hook useAuth enrichi                                                       */
/* -------------------------------------------------------------------------- */

export function useAuth() {
  const { data: session, status, update } = useNextAuthSession();

  /* Extraction des roles depuis la session */
  const roles = useMemo(() => {
    return (session as any)?.roles as string[] | undefined;
  }, [session]);

  /* Token d'acces */
  const accessToken = useMemo(() => {
    return (session as any)?.accessToken as string | undefined;
  }, [session]);

  /* Role principal (le plus eleve dans la hierarchie) */
  const primaryRole = useMemo(() => {
    if (!roles || roles.length === 0) return ROLES.OBSERVATEUR;
    return ROLE_HIERARCHY.find((r) => roles.includes(r)) || ROLES.OBSERVATEUR;
  }, [roles]);

  /* Verification d'un role precis */
  const hasRole = useMemo(() => {
    return (role: string): boolean => {
      return roles?.includes(role) ?? false;
    };
  }, [roles]);

  /* Verification de n'importe quel role parmi une liste */
  const hasAnyRole = useMemo(() => {
    return (requiredRoles: string[]): boolean => {
      if (!roles || roles.length === 0) return false;
      return requiredRoles.some((role) => roles.includes(role));
    };
  }, [roles]);

  /* Verification que l'utilisateur est admin (SUPER_ADMIN ou ADMIN_MINES) */
  const isAdmin = useMemo(() => {
    return hasAnyRole([ROLES.SUPER_ADMIN, ROLES.ADMIN_MINES]);
  }, [hasAnyRole]);

  /* Verification que le role de l'utilisateur est au moins aussi eleve */
  const hasMinRole = useMemo(() => {
    return (minRole: string): boolean => {
      if (!roles || roles.length === 0) return false;
      const minIndex = ROLE_HIERARCHY.indexOf(minRole);
      if (minIndex === -1) return false;
      return roles.some((r) => {
        const rIndex = ROLE_HIERARCHY.indexOf(r);
        return rIndex !== -1 && rIndex <= minIndex;
      });
    };
  }, [roles]);

  return {
    /* Session NextAuth */
    session,
    status,
    update,

    /* Etat d'authentification */
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',

    /* Informations utilisateur */
    user: session?.user,
    roles,
    accessToken,
    primaryRole,

    /* Helpers de verification de roles */
    hasRole,
    hasAnyRole,
    hasMinRole,
    isAdmin,
  };
}

/* -------------------------------------------------------------------------- */
/*  Augmentation de types NextAuth                                             */
/* -------------------------------------------------------------------------- */

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    roles?: string[];
    error?: string;
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    idToken?: string;
    roles?: string[];
    error?: string;
  }
}

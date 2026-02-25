import type { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { useSession as useNextAuthSession } from 'next-auth/react';

/* -------------------------------------------------------------------------- */
/*  NextAuth Configuration                                                     */
/* -------------------------------------------------------------------------- */

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'geominer-web',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      issuer: `${process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080'}/realms/${
        process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'geominer'
      }`,
    }),
  ],

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, store the access token and roles
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.idToken = account.id_token;
      }

      // Extract roles from the Keycloak token
      if (profile) {
        const keycloakProfile = profile as any;
        token.roles =
          keycloakProfile?.realm_access?.roles ||
          keycloakProfile?.resource_access?.['geominer-web']?.roles ||
          [];
      }

      return token;
    },

    async session({ session, token }) {
      // Expose access token and roles to the client session
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
};

/* -------------------------------------------------------------------------- */
/*  Custom useSession hook                                                     */
/* -------------------------------------------------------------------------- */

export function useAuth() {
  const { data: session, status, update } = useNextAuthSession();

  return {
    session,
    status,
    update,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    user: session?.user,
    roles: (session as any)?.roles as string[] | undefined,
    accessToken: (session as any)?.accessToken as string | undefined,
    hasRole: (role: string) => {
      const roles = (session as any)?.roles as string[] | undefined;
      return roles?.includes(role) ?? false;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Type augmentation for NextAuth                                             */
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

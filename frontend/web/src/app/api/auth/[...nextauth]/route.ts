/* ============================================================================
   Ge O'Miner - Route API NextAuth
   Utilise la configuration centralisee depuis useAuth
   ============================================================================ */

import NextAuth from 'next-auth';
import { authOptions } from '@/hooks/useAuth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

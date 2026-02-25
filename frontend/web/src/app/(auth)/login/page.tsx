'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4">
      <div className="w-full max-w-md">
        <div className="card text-center">
          {/* Logo Placeholder */}
          <div className="mx-auto w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center mb-6">
            <svg
              className="w-10 h-10 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 01-.421-.585l-1.08-2.16a.414.414 0 00-.663-.107.827.827 0 01-.812.21l-1.273-.363a.89.89 0 00-.738.145l-.495.362a.68.68 0 01-.707.045l-2.212-1.106a.68.68 0 00-.946.462l-.312 1.252a.68.68 0 01-.538.504l-1.07.214a1.386 1.386 0 00-.98.753l-.463.927a.68.68 0 00.063.682l.29.388a.68.68 0 010 .816l-.599.8a.68.68 0 00.186.943l.362.271a.68.68 0 01.293.643l-.072.725a.68.68 0 00.741.74l.726-.072a.68.68 0 01.643.293l.271.362a.68.68 0 00.943.186l.8-.599a.68.68 0 01.816 0l.388.29a.68.68 0 00.682.063l.927-.463a1.386 1.386 0 00.753-.98l.214-1.07a.68.68 0 01.504-.538l1.252-.312a.68.68 0 00.462-.946L17.63 13.7a.68.68 0 01.045-.707l.362-.495a.89.89 0 00.145-.738l-.363-1.273a.827.827 0 01.21-.812.414.414 0 00-.107-.663l-2.16-1.08a2.252 2.252 0 01-.585-.421L14.03 6.374"
              />
            </svg>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Ge O&apos;Miner
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            GeoSmart Africa - Plateforme de surveillance miniere
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
              {error === 'CredentialsSignin'
                ? 'Identifiants incorrects. Veuillez reessayer.'
                : 'Une erreur est survenue lors de la connexion.'}
            </div>
          )}

          {/* Login Button */}
          <button
            onClick={() => signIn('keycloak', { callbackUrl })}
            className="btn-primary w-full flex items-center justify-center gap-3 py-3"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
              />
            </svg>
            Se connecter avec Keycloak
          </button>

          {/* Footer */}
          <p className="mt-8 text-xs text-gray-400">
            Acces reserve aux utilisateurs autorises.
            <br />
            Contactez votre administrateur pour obtenir un compte.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

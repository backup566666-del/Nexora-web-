import React from 'react';
import { Mail, Smartphone } from 'lucide-react';
import { AuthProviderMethod } from '../../services/auth/authService';

interface ProviderLogoProps {
  providerId: AuthProviderMethod;
  size?: number;
  className?: string;
}

export function ProviderLogo({ providerId, size = 18, className = '' }: ProviderLogoProps) {
  switch (providerId) {
    case 'google.com':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`shrink-0 ${className}`}
        >
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
          />
        </svg>
      );

    case 'github.com':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className={`shrink-0 ${className}`}
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 1.27a11 11 0 0 0-3.48 21.46c.55.1.73-.24.73-.53v-1.85c-3.03.66-3.67-1.45-3.67-1.45-.55-1.29-1.28-1.65-1.28-1.65-1-.68.07-.67.07-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.67 2.57 1.19 3.2.91.1-.71.38-1.19.7-1.46-2.42-.28-4.96-1.21-4.96-5.38 0-1.19.42-2.16 1.12-2.92-.11-.28-.49-1.4.11-2.92 0 0 .92-.29 3 1.12a10.4 10.4 0 0 1 5.46 0c2.08-1.41 3-1.12 3-1.12.6 1.52.22 2.64.11 2.92.7.76 1.12 1.73 1.12 2.92 0 4.18-2.55 5.1-4.98 5.37.39.34.74 1.01.74 2.04v3.02c0 .29.19.63.74.53A11 11 0 0 0 12 1.27Z"
          />
        </svg>
      );

    case 'apple.com':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className={`shrink-0 ${className}`}
        >
          <path d="M16.365 12.92c-.022-2.463 2.01-3.648 2.1-3.705-1.147-1.675-2.926-1.904-3.553-1.929-1.497-.152-2.948.896-3.71.896-.763 0-1.92-.88-3.164-.855-1.618.024-3.118.96-3.947 2.41-1.694 2.937-.432 7.267 1.202 9.644.808 1.164 1.755 2.466 3 2.42 1.212-.049 1.668-.776 3.132-.776 1.464 0 1.883.776 3.146.751 1.3-.024 2.119-1.175 2.905-2.344.93-1.351 1.304-2.668 1.32-2.735-.03-.013-2.507-.96-2.531-3.777ZM13.943 5.713c.653-.804 1.1-1.904.978-3.013-.947.04-2.126.644-2.805 1.434-.6.695-1.136 1.829-.998 2.906 1.064.082 2.159-.533 2.825-1.327Z" />
        </svg>
      );

    case 'microsoft.com':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`shrink-0 ${className}`}
        >
          <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" rx="0.6" />
          <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" rx="0.6" />
          <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" rx="0.6" />
          <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" rx="0.6" />
        </svg>
      );

    case 'facebook.com':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`shrink-0 ${className}`}
        >
          <circle cx="12" cy="12" r="11" fill="#1877F2" />
          <path
            fill="#FFFFFF"
            d="M15.46 15.17 15.96 12h-3.04v-2.06c0-.87.43-1.71 1.8-1.71h1.39V5.53S14.85 5.3 13.65 5.3c-2.5 0-4.13 1.52-4.13 4.26V12H6.74v3.17h2.78v7.67a11.12 11.12 0 0 0 3.4 0v-7.67h2.54Z"
          />
        </svg>
      );

    case 'phone':
      return <Smartphone size={size} aria-hidden="true" className={`shrink-0 text-[#C084FC] ${className}`} />;

    case 'password':
      return <Mail size={size} aria-hidden="true" className={`shrink-0 text-[#C084FC] ${className}`} />;
  }
}

'use client';

import { SDKProvider } from '@telegram-apps/sdk-react';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <SDKProvider acceptCustomStyles>
          {children}
        </SDKProvider>
      </body>
    </html>
  );
}
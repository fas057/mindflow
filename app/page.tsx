'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const init = () => {
      const tg = window.Telegram?.WebApp;

      if (tg) {
        tg.ready();
        tg.expand();
      }

      router.replace('/dashboard');
    };

    init();

  }, [router]);


  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>
        Загрузка Telegram...
      </p>
    </div>
  );
}
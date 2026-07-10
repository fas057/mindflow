interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}


interface TelegramWebApp {

  ready(): void;

  expand(): void;

  initData: string;

  initDataUnsafe: {
    user?: TelegramUser;
  };

}


interface Window {

  Telegram?: {
    WebApp: TelegramWebApp;
  };

}
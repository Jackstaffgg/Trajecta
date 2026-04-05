import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LocaleSelect } from "@/components/ui/locale-select";
import { useLocaleStore } from "@/store/locale-store";
import { t } from "@/lib/i18n";

type LandingScreenProps = {
  isAuthenticated: boolean;
  username?: string;
  onStart: () => void;
  onLogin: () => void;
};

export function LandingScreen({
  isAuthenticated,
  username,
  onStart,
  onLogin
}: LandingScreenProps) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(212,212,216,0.09),transparent_32%),radial-gradient(circle_at_50%_85%,rgba(161,161,170,0.1),transparent_36%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-9 w-9 sm:h-10 sm:w-10" />
          <div className="leading-tight">
            <p className="text-sm font-medium text-zinc-200">Trajecta</p>
            <p className="hidden text-xs text-zinc-400 sm:block">{t(locale, "landing.caption")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LocaleSelect locale={locale} onChange={setLocale} />

          {isAuthenticated ? (
            <div className="hidden h-9 items-center rounded-md border border-border/70 bg-zinc-900/40 px-3 text-sm text-zinc-300 sm:flex">
              {t(locale, "landing.hello")}: <span className="ml-1 font-semibold text-zinc-100">{username ?? "-"}</span>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-9 px-3 text-sm sm:inline-flex"
              onClick={onLogin}
            >
              {t(locale, "landing.signIn")}
            </Button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl items-center justify-center px-4 pb-20 pt-6 sm:min-h-[calc(100vh-88px)] sm:pb-24 sm:pt-0 md:px-8">
        <section className="w-full max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-zinc-300/25 bg-zinc-900/35 backdrop-blur-md animate-rise sm:mb-6 sm:h-20 sm:w-20">
            <BrandLogo className="h-10 w-10 sm:h-12 sm:w-12" />
          </div>

          <h1 className="landing-reveal landing-reveal-title mb-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:mb-4 sm:text-4xl md:text-6xl">
            {t(locale, "landing.title")}
          </h1>
          <p className="landing-reveal landing-reveal-text landing-reveal-delay mb-8 text-sm text-zinc-300 sm:mb-10 sm:text-base md:text-xl">
            {t(locale, "landing.slogan")}
          </p>

          <div className="landing-reveal landing-reveal-delay-2 flex items-center justify-center">
            <Button
              size="lg"
              className="landing-reveal-cta h-12 w-full max-w-xs bg-white px-6 text-base font-semibold text-zinc-900 hover:bg-zinc-200 sm:h-11 sm:w-auto sm:min-w-48 sm:text-sm"
              onClick={onStart}
            >
              {t(locale, "landing.workspace")}
            </Button>
          </div>
        </section>
      </main>

      <footer className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4 sm:bottom-6">
        <p className="landing-team-footer text-[11px] tracking-[0.14em] text-zinc-500 sm:text-xs">
          <span className="landing-team-typing">{t(locale, "landing.teamTagline")}</span>
        </p>
      </footer>
    </div>
  );
}

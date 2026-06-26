import Link from "next/link"

export const metadata = {
  title: "Polityka prywatności",
}

export default function PolitykaPrywatnosci() {
  return (
    <div
      className="
        min-h-screen
        w-full
        flex
        flex-col
        items-center
        justify-start
        p-6
        before:content-['']
        before:absolute
        before:inset-0
        before:bg-[url('/images/x-bg.webp')]
        before:bg-cover
        before:bg-center
        before:opacity-80
        before:z-[-1]
        relative"
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.20)", backdropFilter: "blur(6px)" }}
      />

      <div
        className="relative z-10 w-full max-w-2xl rounded-2xl p-8 shadow-2xl my-10"
        style={{
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.15), inset 0 2px 0 rgba(255,255,255,0.8)",
        }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold font-sans text-slate-500 hover:text-slate-800 transition-colors mb-6"
        >
          ← Wróć do logowania
        </Link>

        <h1 className="text-slate-800 text-2xl font-bold font-sans mb-8">
          Polityka prywatności
        </h1>

        <div className="flex flex-col gap-6 text-slate-800 font-sans text-sm leading-relaxed">
          <section>
            <h2 className="font-bold text-slate-800 mb-1">1. Administrator danych</h2>
            <p>
              Administratorem danych osobowych jest Katarzyna Pietryka, kontakt:{" "}
             contact.psycholog@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">2. Zakres przetwarzanych danych</h2>
            <p className="mb-2">Przetwarzamy następujące dane:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-800">
              <li>adres e-mail użytkownika</li>
              <li>numer telefonu użytkownika</li>
              <li>informacje o umówionych wizytach</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">3. Cel przetwarzania danych</h2>
            <p className="mb-2">Dane przetwarzane są w celu:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-800">
              <li>umożliwienia logowania do aplikacji (za pomocą jednorazowego kodu wysyłanego e-mailem)</li>
              <li>zarządzania wizytami</li>
              <li>kontaktu z użytkownikiem w sprawie wizyt (np. potwierdzenia,przypomnienia, zmiany terminu)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">4. Podstawa prawna przetwarzania</h2>
            <p className="mb-2">Dane przetwarzane są na podstawie:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-800">
              <li>art. 6 ust. 1 lit. b RODO – przetwarzanie niezbędne do wykonania usługi</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">5. Przechowywanie danych</h2>
            <p>
            Dane przechowywane są przez okres korzystania z aplikacji oraz do 12 miesięcy od ostatniej aktywności użytkownika, chyba że przepisy prawa wymagają dłuższego przechowywania.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">6. Odbiorcy danych</h2>
            <p>
            Dane mogą być przekazywane podmiotom wspierającym działanie aplikacji, takim jak dostawcy usług hostingowych oraz dostawcy usług e-mail i komunikacji (np. SMS), wyłącznie w zakresie niezbędnym do realizacji usług.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">7. Prawa użytkownika</h2>
            <p className="mb-2">Użytkownik ma prawo do:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-800 mb-2">
              <li>dostępu do swoich danych</li>
              <li>ich poprawiania</li>
              <li>usunięcia</li>
              <li>ograniczenia przetwarzania</li>
            </ul>
            <p>
              W celu realizacji praw należy skontaktować się pod adresem: contact.psycholog@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">8. Dobrowolność podania danych</h2>
            <p>
              Podanie danych jest dobrowolne, ale niezbędne do korzystania z aplikacji.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-slate-800 mb-1">9. Bezpieczeństwo danych</h2>
            <p>
            Dane są przetwarzane z zastosowaniem odpowiednich środków technicznych i organizacyjnych zapewniających ich ochronę, w szczególności przed nieuprawnionym dostępem, utratą lub zniszczeniem.
            </p>
          </section>
          <section>
          <h2 className="font-bold text-slate-800 mb-1">10. Zmiany polityki prywatności</h2>
            <p>
            Polityka prywatności może być okresowo aktualizowana. O istotnych zmianach użytkownicy będą informowani w aplikacji.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

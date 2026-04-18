/**
 * German privacy policy body — single source for landing + PWA.
 * Styling comes from the parent `PrivacyPolicyLayout` / article classes.
 */
export function PrivacyPolicyDe() {
  return (
    <>
      <h1>Datenschutzerklärung</h1>
      <p>
        Diese Datenschutzerklärung gilt für die Marketing-Website (Landing Page) und die
        Bitboard-Wallet-Web-App (Progressive Web App, „PWA“) als gemeinsame Information —
        mit klar getrennten Abschnitten, je nachdem welche Datenverarbeitung für welche Oberfläche
        relevant ist.
      </p>
      <p>
        <strong>Hinweis:</strong> Diese Seite stellt keine Rechtsberatung dar. Lassen Sie den Text
        im Zweifel von einer Rechtsanwaltskanzlei prüfen.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist die im Impressum
        genannte Person bzw. die dort genannte Stelle.
      </p>

      <h2>2. Hosting</h2>
      <p>
        Sowohl die Landing Page als auch die Auslieferung der App werden über{' '}
        <strong>Vercel</strong> als Hosting- und Edge-Plattform bereitgestellt. Dabei können
        technisch bedingt Zugriffs‑/Server‑ und Sicherheitsprotokolle entstehen (u. a. IP-Adressen,
        Zeitstempel, URLs), wie sie Vercel und die zugrundeliegende Infrastruktur dokumentieren.
        Für Bitboard besteht <strong>kein eigener Anwendungs-Server</strong>, der Wallet-Inhalte
        speichert oder auswertet (siehe Abschnitt zur App).
      </p>

      <h2>3. Marketing-Website (Landing Page)</h2>
      <p>
        Die Landing Page dient der Information über das Produkt. In Ihrem Browser wird — neben den
        üblichen technischen Vorgängen beim Aufruf einer Website — ausdrücklich nur Ihre{' '}
        <strong>Sprachauswahl für rechtliche Texte</strong> (Deutsch/Englisch) lokal im Browser
        gespeichert (<code>localStorage</code>, Schlüssel <code>bitboard.legalLocale</code>).
        Weitere von der Landing Page bewusst gesetzte, personenbezogene Daten werden hier nicht
        beschrieben.
      </p>

      <h2>4. Wallet-App (PWA)</h2>
      <p>
        Die Bitboard-Wallet-App ist eine <strong>lokal betriebene</strong> Anwendung in Ihrem
        Gerät (Browser). Es gibt <strong>keinen Bitboard-Backend-Server</strong>, auf dem Ihre
        Wallet-Daten gespeichert oder ausgewertet werden. Wallet-relevante Daten liegen in der
        lokalen Datenhaltung auf Ihrem Endgerät (z. B. IndexedDB/SQLite im Browserkontext), soweit
        die App deren Speicher nutzt.
      </p>

      <h2>5. Netzwerkzugriff (Esplora)</h2>
      <p>
        Damit die App Blockchain-Informationen abrufen kann, baut sie Verbindungen zu den von Ihnen
        unter <strong>Einstellungen</strong> konfigurierten <strong>Esplora</strong>-Endpunkten
        (oder vergleichbaren HTTP(S)-Diensten) auf. Dabei werden insbesondere Ihre{' '}
        <strong>IP-Adresse</strong> sowie übliche technische Metadaten (z. B. TLS) für den
        jeweiligen Drittanbieter sichtbar — nicht für einen Bitboard-Server, den es für die
        App-Logik nicht gibt. Welche genauen Anfragen abgehen, hängt von Ihrer Nutzung der Wallet
        (z. B. Kontostandsabfragen, Transaktionslisten) ab.
      </p>

      <h2>6. Verschlüsselung sensibler App-Daten</h2>
      <p>
        Sensible Daten wie Wiederherstellungsphrasen (Seeds), kryptographische Schlüssel, Deskriptoren,
        NWC-Verbindungszeichenfolgen sowie zwischengespeicherte Salden und Transaktionen in der
        Wallet-Datenbank werden <strong>nur dann stark verschlüsselt</strong>, wenn Sie ein{' '}
        <strong>App-Passwort</strong> gesetzt haben und die Anwendung diesen Schutzmodus nutzt.
        Ohne von Ihnen eingerichteten Verschlüsselungsschutz können einzelne Modi mit sehr wenig
        oder ohne zusätzliches Passwort technisch abweichen — orientieren Sie sich an den Hinweisen
        in der App (z. B. zu Near-Zero-Sicherheit).
      </p>

      <h2>7. Datensicherungen (Exports)</h2>
      <p>
        Sie können Wallet-Datensicherungen exportieren. Die <strong>Exportdatei ist als Ganzes
        nicht verschlüsselt</strong>. Die zuvor genannten sensiblen Inhalte können innerhalb der
        Wallet-Datenbank weiterhin verschlüsselt vorliegen; die Datei kann zusätzlich Metadaten
        enthalten, die für den Import oder die Diagnose notwendig sind. Die <strong>Integrität</strong>{' '}
        von Exporten kann durch eine <strong>digitale Signatur</strong> geschützt sein — bitte
        beachten Sie die konkrete Darstellung in der jeweiligen App-Version.
      </p>

      <h2>8. Ihre Rechte</h2>
      <p>
        Soweit personenbezogene Daten verarbeitet werden, stehen Ihnen die in der DSGVO vorgesehenen
        Rechte (u. a. Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Datenübertragbarkeit)
        grundsätzlich zu. Viele Verarbeitungsvorgänge in dieser App erfolgen jedoch lokal auf Ihrem
        Gerät — dort können Sie Daten oft am direktesten löschen (z. B. App-Daten im Browser entfernen).
      </p>
    </>
  )
}

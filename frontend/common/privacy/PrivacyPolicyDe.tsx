/**
 * German privacy policy body — single source for landing + PWA.
 * Styling comes from the parent `PrivacyPolicyLayout` / article classes.
 *
 * Imports use cross-project-safe aliases (@legal-entity-fields, @legal-entity)
 * so this file resolves both from the frontend (PWA) Vite config and from the
 * landing-page Vite config.
 */
import { LegalEntityFields } from '@legal-entity-fields'
import { legalEntity } from '@legal-entity'

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

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:
      </p>
      <LegalEntityFields entity={legalEntity} className="mb-3 space-y-1" />
      <p>
        Für Anfragen zum Datenschutz erreichen Sie uns vorzugsweise per E-Mail an die oben
        genannte Adresse. Inhalte solcher E-Mails verarbeiten wir auf Grundlage von{' '}
        <strong>Art. 6 Abs. 1 lit. b und/oder f DSGVO</strong> zur Bearbeitung Ihres Anliegens und
        löschen sie, sobald sie hierfür nicht mehr erforderlich sind, vorbehaltlich gesetzlicher
        Aufbewahrungspflichten.
      </p>
      <p>
        <strong>Datenschutzbeauftragter:</strong> Ein betrieblicher Datenschutzbeauftragter ist
        nicht bestellt.
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
      <p>
        <strong>Marketing-/Tracking-Tools:</strong> In der aktuellen Auslieferung sind keine
        zusätzlichen Drittanbieter-Tools wie Web-Analytics oder Werbe-Tracker eingebunden; es
        entstehen insbesondere die technisch bedingten Hosting-Daten bei Vercel sowie die
        nachfolgend beschriebenen lokalen Einstellungen.
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
        Wallet-Daten gespeichert oder ausgewertet werden. Wallet-relevante Daten werden in einer{' '}
        <strong>SQLite</strong>-Datenbank im <strong>Origin Private File System (OPFS)</strong> des
        Browsers gespeichert — nicht in IndexedDB. OPFS ist ein vom Browser bereitgestellter,
        origin-gebundener Speicherbereich für Dateien (hier für die SQLite-Datenbank). Der
        In-App-Lab-Simulator nutzt eine <strong>weitere, getrennte</strong> SQLite-Datei in OPFS für
        lokale Simulationsdaten der Kette.
      </p>
      <p>
        Für einen datenschutzorientierten Reset auf diesem Gerät bietet die App unter{' '}
        <strong>Einstellungen → Sicherheit</strong> die Funktion{' '}
        <strong>Alle App-Daten löschen</strong>: Sie entfernt nach ausdrücklicher Bestätigung sowohl
        die Wallet- als auch die Lab-SQLite-Datenbank aus OPFS. Nutzen Sie sie nur, wenn Sie
        verstehen, dass Sie zur Wiederherstellung von Guthaben eine Seed-Phrase-Sicherung oder ein
        signiertes Wallet-Exportarchiv benötigen — Bitboard kann gelöschte lokale Daten nicht für Sie
        wiederherstellen.
      </p>
      <p>
        Die PWA registriert zusätzlich einen <strong>Service Worker</strong> und nutzt den{' '}
        <strong>Cache Storage</strong> des Browsers, um statische App-Bestandteile (HTML,
        JavaScript, CSS, Schriften, WebAssembly-Module) für den Offline-Betrieb zwischenzuspeichern.
        Diese Caches sind <strong>technisch erforderlich</strong> für die Funktion der PWA und
        enthalten keine Wallet-Inhalte.
      </p>

      <h2>5. Netzwerkzugriff (Esplora)</h2>
      <p>
        Damit die App Blockchain-Informationen abrufen kann, baut sie Verbindungen zu den von Ihnen
        unter <strong>Einstellungen</strong> konfigurierten <strong>Esplora</strong>-Endpunkten auf.
        Esplora ist eine Block-Explorer-API (HTTP(S)-Schnittstelle zu Blockchain-Daten).
        Dabei werden insbesondere Ihre <strong>IP-Adresse</strong> sowie übliche technische Metadaten (z. B. TLS) für den
        jeweiligen Drittanbieter sichtbar — nicht für einen Bitboard-Server, den es für die
        App-Logik nicht gibt. Welche genauen Anfragen abgehen, hängt von Ihrer Nutzung der Wallet
        (z. B. Kontostandsabfragen, Transaktionslisten) ab.
      </p>
      <p>
        Der Betreiber des jeweiligen Esplora-Dienstes könnte vielleicht — auch wenn die
        Schnittstelle <strong>Anonymisierungsmaßnahmen</strong> vorsieht — versuchen, aus den von
        Ihrer Wallet ausgelösten Anfragen ein <strong>Nutzungs- bzw. Transaktionsprofil</strong> zu
        erstellen (z. B. welche Adressen oder Transaktionen wann abgefragt werden). Das{' '}
        <strong>Bitboard-Wallet selbst hat darauf keinen Einfluss</strong>; die Wahl des Endpunkts
        und ggf. zusätzliche Schutzmaßnahmen (z. B. Tor, eigener Knoten) liegen bei Ihnen.
      </p>

      <h2>6. Nostr Wallet Connect (NWC)</h2>
      <p>
        Bitboard unterstützt Lightning derzeit <strong>ausschließlich über Nostr Wallet Connect
        (NWC)</strong>. NWC ist ein Protokoll, mit dem Sie eine <strong>bereits bestehende</strong>{' '}
        Lightning-Wallet über das Nostr-Netzwerk anbinden; Bitboard verwahrt keine Lightning-Guthaben
        auf eigenen Servern.
      </p>
      <p>
        Wenn Sie NWC nutzen, können <strong>Metadaten und zur Nutzung erforderliche Inhalte</strong>{' '}
        über <strong>von Ihnen gewählte oder von der verbundenen Wallet vorgegebene Nostr-Relays</strong>{' '}
        sowie den <strong>Betreiber der verbundenen Lightning-Infrastruktur</strong> verarbeitet
        werden. Bitboard betreibt <strong>weder</strong> eigene Nostr-Relays <strong>noch</strong> ein
        Lightning-Backend für Ihre Zahlungen.
      </p>
      <p>
        Die <strong>NWC-Verbindungszeichenfolge</strong> sowie <strong>Schnappschüsse</strong> von
        Salden und Transaktionen, die von dieser externen Lightning-Wallet abgerufen werden, werden
        lokal in der App gespeichert. Sie werden <strong>nur dann im Ruhezustand stark verschlüsselt</strong>,
        wenn Sie ein <strong>App-Passwort</strong> gesetzt haben — im Einklang mit den übrigen
        Ausführungen zur Verschlüsselung in dieser Datenschutzerklärung.
      </p>

      <h2>7. Verschlüsselung sensibler App-Daten</h2>
      <p>
        Kurz gesagt: Ohne von Ihnen gesetztes <strong>App-Passwort</strong> liegen sensible Inhalte
        (z. B. Wiederherstellungsphrase, Schlüssel, Verbindungsdaten zu Lightning) auf Ihrem Gerät{' '}
        <strong>nicht</strong> mit der beschriebenen starken Verschlüsselung „im Ruhezustand“ geschützt.
        Wir <strong>empfehlen, vor dem Speichern</strong> von Seed, Deskriptoren oder einer
        NWC-Verbindungszeichenfolge in der App zunächst <strong>ein App-Passwort zu setzen</strong>.
      </p>
      <p>
        Technisch: Daten wie Wiederherstellungsphrasen (Seeds), kryptographische Schlüssel,
        Deskriptoren, NWC-Verbindungszeichenfolgen sowie zwischengespeicherte Salden und
        Transaktionen in der Wallet-Datenbank werden <strong>nur dann im Ruhezustand stark
        verschlüsselt</strong>, wenn Sie ein <strong>App-Passwort</strong> gesetzt haben. Bis dahin
        kommt diese starke Verschlüsselung nicht zur Anwendung.
      </p>

      <h2>8. Datensicherungen (Exports)</h2>
      <p>
        Sie können Daten aus der App herunterladen (Export). <strong>Wallet-Exporte</strong> sind
        mit einer <strong>digitalen Signatur</strong> versehen — das hilft zu prüfen, dass die Datei
        von der App stammt. Die Datei selbst ist <strong>als Ganzes nicht zusätzlich
        verschlüsselt</strong>; einzelne Inhalte können weiterhin im Wallet-Format geschützt sein.
        Die Datei kann Metadaten für Wiederherstellung oder Fehlersuche enthalten.
      </p>
      <p>
        Exporte <strong>weniger sensibler Daten</strong> — etwa simulierter lokaler Blockchain-Daten in
        der App — werden <strong>niemals</strong> digital signiert.
      </p>

      <h2>9. Rechtsgrundlagen (Art. 6 DSGVO)</h2>
      <p>
        Soweit personenbezogene Daten verarbeitet werden, stützen wir uns auf folgende
        Rechtsgrundlagen (Auszug — im Einzelfall kann auch eine andere Vorschrift einschlägig sein):
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Auslieferung der Website/App über Vercel</strong> (technische Protokolle wie IP,
          Zeitstempel, angeforderte URLs):{' '}
          <strong>Art. 6 Abs. 1 lit. f DSGVO</strong> (berechtigtes Interesse an einem sicheren und
          stabilen Betrieb des Hostings).
        </li>
        <li>
          <strong>Sprachwahl für rechtliche Texte</strong> (localStorage{' '}
          <code>bitboard.legalLocale</code>):{' '}
          <strong>Art. 6 Abs. 1 lit. f DSGVO</strong> (berechtigtes Interesse an einer konsistenten
          Darstellung rechtlicher Inhalte).
        </li>
        <li>
          <strong>Lokale Wallet- und App-Funktionen</strong> (Speicherung und Verarbeitung auf Ihrem
          Gerät, einschließlich optionaler Verschlüsselung mit App-Passwort):{' '}
          <strong>Art. 6 Abs. 1 lit. b DSGVO</strong> (Vertrag über die Nutzung der Wallet-App) und/oder{' '}
          <strong>Art. 6 Abs. 1 lit. f DSGVO</strong> (berechtigtes Interesse an der Funktionsfähigkeit
          der App), soweit anwendbar.
        </li>
        <li>
          <strong>Verbindungen zu von Ihnen konfigurierten Esplora-Endpoints</strong>:{' '}
          <strong>Art. 6 Abs. 1 lit. b DSGVO</strong> (Durchführung der von Ihnen gewünschten
          Wallet-Funktionen) und/oder <strong>Art. 6 Abs. 1 lit. f DSGVO</strong> gegenüber dem
          jeweiligen Betreiber, soweit deren Verarbeitung relevant ist.
        </li>
        <li>
          <strong>NWC-Verbindung</strong> (Anbindung an die von Ihnen gewählte Lightning-Wallet):{' '}
          <strong>Art. 6 Abs. 1 lit. b DSGVO</strong> und/oder{' '}
          <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>, soweit personenbezogene Daten im Zusammenhang
          mit der Nutzung anfallen.
        </li>
        <li>
          <strong>E-Mail-Korrespondenz mit dem Verantwortlichen</strong> (z. B. Datenschutzanfragen):{' '}
          <strong>Art. 6 Abs. 1 lit. b DSGVO</strong> und/oder <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>.
        </li>
      </ul>

      <h2>10. Empfänger und Empfängerkategorien</h2>
      <p>
        Über Bitboard als Verantwortlichen hinaus können personenbezogene Daten — abhängig von Ihrer
        Nutzung der Website und der App — von folgenden Kategorien von Empfängern verarbeitet werden:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Hosting-Anbieter:</strong> <strong>Vercel Inc.</strong> sowie die dort genutzten
          Infrastrukturanbieter, im Zusammenhang mit der Auslieferung der Website und der App.
        </li>
        <li>
          <strong>Esplora-Betreiber:</strong> der Betreiber des in den{' '}
          <strong>Einstellungen</strong> von Ihnen konfigurierten Esplora-Endpunkts, im Zusammenhang
          mit den von Ihnen ausgelösten Konto- und Transaktionsabfragen.
        </li>
        <li>
          <strong>Nostr-Relays und Lightning-Betreiber (NWC):</strong> die von Ihnen gewählten oder
          von Ihrer angebundenen Lightning-Wallet vorgegebenen Nostr-Relays sowie der Betreiber der
          verbundenen Lightning-Infrastruktur, im Zusammenhang mit NWC-Zahlungen und -Benachrichtigungen.
        </li>
        <li>
          <strong>E-Mail-Anbieter</strong> des Verantwortlichen (derzeit{' '}
          <strong>Proton AG</strong>, Schweiz), im Zusammenhang mit der von Ihnen initiierten
          E-Mail-Korrespondenz.
        </li>
      </ul>
      <p>
        Eine Veräußerung personenbezogener Daten findet nicht statt; eine Weitergabe an Dritte
        erfolgt nicht über das hinaus, was zur Erfüllung der oben genannten Zwecke erforderlich ist.
      </p>

      <h2>11. Datenkategorien und Speicherdauer</h2>
      <p>
        <strong>Kategorien:</strong> können insbesondere umfassen: technische Verbindungs- und
        Zugriffsdaten beim Hosting (Vercel); Sprachpräferenz (lokal im Browser); Wallet-Daten lokal
        (u. a. Schlüsselmaterial, Deskriptoren, Transaktions- und Kontostandsinformationen, sofern
        von Ihnen angelegt oder abgerufen); NWC-Verbindungsdaten und zwischengespeicherte
        Lightning-Informationen lokal; Daten, die im Rahmen der von Ihnen ausgelösten Anfragen an
        Esplora- und NWC-/Lightning-Dritte sichtbar oder verarbeitet werden; sowie Kontaktdaten in
        einer E-Mail-Korrespondenz mit dem Verantwortlichen.
      </p>
      <p>
        <strong>Speicherdauer:</strong> Hosting- und Sicherheitsprotokolle bei Vercel richten sich
        nach den Aufbewahrungs- und Löschfristen des Anbieters — typischerweise im Bereich weniger
        Wochen für Zugriffs- und Firewall-Logs (maßgeblich ist die jeweils aktuelle{' '}
        <a
          href="https://vercel.com/legal/privacy-policy"
          className="text-primary underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel Privacy Policy
        </a>
        ). Daten, die nur lokal in Ihrem Browser bzw. auf Ihrem Gerät gespeichert werden, bleiben
        gespeichert, bis Sie sie löschen (z. B. App- oder Website-Daten des Browsers entfernen,
        App-Daten der PWA löschen). Von Ihnen heruntergeladene Exportdateien unterliegen Ihrer
        eigenen Verantwortung; Bitboard hat darauf nach dem Download keinen Zugriff. Inhalte einer
        E-Mail-Korrespondenz löschen wir, sobald sie für die Bearbeitung Ihres Anliegens nicht mehr
        erforderlich sind, vorbehaltlich gesetzlicher Aufbewahrungspflichten.
      </p>

      <h2>12. Drittlandübermittlung (insbesondere USA / Vercel)</h2>
      <p>
        Die Nutzung von Vercel kann eine <strong>Übermittlung personenbezogener Daten in die USA</strong>{' '}
        beinhalten. Vercel ist nach eigenen Angaben unter dem{' '}
        <strong>EU-US Data Privacy Framework (DPF) zertifiziert</strong> (Stand der Prüfung: April
        2026); dies soll eine angemessene Garantie für derartige Übermittlungen darstellen.
        Ergänzend können je nach Sachverhalt <strong>Standardvertragsklauseln</strong> der
        EU-Kommission und weitere Maßnahmen eine Rolle spielen. Einzelheiten entnehmen Sie bitte der
        aktuellen{' '}
        <a
          href="https://vercel.com/legal/privacy-policy"
          className="text-primary underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel Privacy Policy
        </a>{' '}
        und den Vertragsunterlagen von Vercel.
      </p>

      <h2>13. Keine automatisierte Entscheidungsfindung</h2>
      <p>
        Eine <strong>automatisierte Entscheidungsfindung</strong> einschließlich Profiling mit
        rechtlicher Wirkung oder ähnlich erheblicher Beeinträchtigung im Sinne von{' '}
        <strong>Art. 22 DSGVO</strong> findet nicht statt.
      </p>

      <h2>14. Beschwerderecht</h2>
      <p>
        Sie haben das Recht, sich bei einer <strong>Aufsichtsbehörde</strong> über die Verarbeitung
        personenbezogener Daten zu beschweren, insbesondere in dem Mitgliedstaat Ihres gewöhnlichen
        Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes. In Deutschland
        ist hierfür beispielsweise die für Ihr Bundesland zuständige Datenschutzaufsicht zuständig.
      </p>

      <h2>15. Ihre Rechte</h2>
      <p>
        Soweit personenbezogene Daten verarbeitet werden, stehen Ihnen die in der DSGVO vorgesehenen
        Rechte grundsätzlich zu, insbesondere:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Auskunft</strong> (Art. 15 DSGVO),
        </li>
        <li>
          <strong>Berichtigung</strong> (Art. 16 DSGVO),
        </li>
        <li>
          <strong>Löschung</strong> („Recht auf Vergessenwerden“, Art. 17 DSGVO),
        </li>
        <li>
          <strong>Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO),
        </li>
        <li>
          <strong>Widerspruch</strong> gegen die Verarbeitung (Art. 21 DSGVO),
        </li>
        <li>
          <strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO),
        </li>
        <li>
          <strong>Widerruf einer Einwilligung</strong> jederzeit mit Wirkung für die Zukunft, sofern
          eine Verarbeitung auf Ihrer Einwilligung beruht (<strong>Art. 7 Abs. 3 DSGVO</strong>);
          die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt unberührt.
        </li>
      </ul>
      <p>
        Viele Verarbeitungsvorgänge in dieser App erfolgen jedoch lokal auf Ihrem Gerät — dort können
        Sie Daten oft am direktesten löschen (z. B. App-Daten im Browser entfernen). Wo die App es
        anbietet, können Sie auch <strong>Einstellungen → Sicherheit → Alle App-Daten löschen</strong>{' '}
        verwenden, um die lokalen Wallet- und Lab-Datenbanken zu löschen, ohne die globalen
        Website-Daten des Browsers zu leeren.
      </p>
      <p>
        Zur Ausübung Ihrer Rechte im Zusammenhang mit Verarbeitungen, die Bitboard als
        Verantwortlicher steuert, können Sie sich an die oben genannten Kontaktdaten wenden. Bei
        rein lokaler Verarbeitung auf Ihrem Gerät ist eine Löschung häufig durch Entfernen der
        App-Daten oder der gesamten Website-Daten im Browser möglich.
      </p>

      <h2>16. Stand und Änderungen dieser Datenschutzerklärung</h2>
      <p>
        <strong>Stand:</strong> April 2026.
      </p>
      <p>
        Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn sich technische oder
        rechtliche Rahmenbedingungen ändern. Die jeweils aktuelle Version finden Sie unter der
        URL dieser Seite (z. B. <strong>/privacy</strong> in der App bzw. unter der öffentlich
        erreichbaren Entsprechung auf der Landing Page). Über <strong>wesentliche Änderungen</strong>{' '}
        informieren wir nach Möglichkeit, z. B. über diese Website oder das öffentliche
        Projekt-Repository (z. B. GitHub).
      </p>
      <p>
        Da es sich um eine <strong>reine Client-seitige Wallet</strong> handelt, haben Sie in der
        Regel die <strong>maximale Kontrolle über Ihre lokalen Daten</strong>: Sie können
        jederzeit die lokal gespeicherten Daten der App im Browser entfernen und damit die
        beschriebene lokale Verarbeitung beenden.
      </p>
    </>
  )
}

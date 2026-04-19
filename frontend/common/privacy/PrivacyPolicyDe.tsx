/**
 * German privacy policy body — single source for landing + PWA.
 * Styling comes from the parent `PrivacyPolicyLayout` / article classes.
 */
import { Link } from '@tanstack/react-router'
import { LegalEntityFields } from '@/components/LegalEntityFields'
import { legalEntity } from '@/legal-entity/legal-entity'

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
        Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist die folgende Stelle.
        Für Anfragen zum Datenschutz wenden Sie sich bitte vorzugsweise per E-Mail an die
        angegebene Adresse.
      </p>
      <LegalEntityFields entity={legalEntity} className="mb-3 space-y-1" />
      <p>
        <strong>Hinweis:</strong> Vollständige gesetzliche Angaben (Impressum) finden Sie in
        den Einstellungen unter{' '}
        <Link to="/settings#legal-notice" className="text-primary underline underline-offset-4">
          Impressum
        </Link>
        , ergänzend zu den oben genannten Kontaktdaten.
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
        <strong>Marketing-/Tracking-Tools:</strong> In der aktuellen Auslieferung sind uns keine
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
        origin-gebundener Speicherbereich für Dateien (hier für die SQLite-Datenbank).
      </p>

      <h2>5. Netzwerkzugriff (Esplora)</h2>
      <p>
        Damit die App Blockchain-Informationen abrufen kann, baut sie Verbindungen zu den von Ihnen
        unter <strong>Einstellungen</strong> konfigurierten <strong>Esplora</strong>-Endpunkten
        (oder vergleichbaren HTTP(S)-Diensten) auf. Esplora ist typischerweise eine
        Block-Explorer-API (HTTP(S)-Schnittstelle zu Blockchain-Daten). Dabei werden insbesondere
        Ihre <strong>IP-Adresse</strong> sowie übliche technische Metadaten (z. B. TLS) für den
        jeweiligen Drittanbieter sichtbar — nicht für einen Bitboard-Server, den es für die
        App-Logik nicht gibt. Welche genauen Anfragen abgehen, hängt von Ihrer Nutzung der Wallet
        (z. B. Kontostandsabfragen, Transaktionslisten) ab.
      </p>
      <p>
        Der Betreiber des jeweiligen Esplora-Dienstes kann technisch bedingt — auch wenn die
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
        Sensible Daten wie Wiederherstellungsphrasen (Seeds), kryptographische Schlüssel, Deskriptoren,
        NWC-Verbindungszeichenfolgen sowie zwischengespeicherte Salden und Transaktionen in der
        Wallet-Datenbank werden <strong>nur dann im Ruhezustand stark verschlüsselt</strong>, wenn Sie
        ein <strong>App-Passwort</strong> gesetzt haben. Bis dahin kommt diese starke Verschlüsselung
        nicht zur Anwendung.
      </p>

      <h2>8. Datensicherungen (Exports)</h2>
      <p>
        Sie können Daten aus der App exportieren. <strong>Wallet-Datenexporte</strong> sind mit einer{' '}
        <strong>digitalen Signatur</strong> versehen (<strong>Pflicht</strong>). Die Exportdatei ist
        dennoch <strong>als Ganzes nicht verschlüsselt</strong>; die zuvor genannten sensiblen Inhalte
        können innerhalb der Wallet-Datenbank weiterhin verschlüsselt vorliegen; die Datei kann
        zusätzlich Metadaten enthalten, die für den Import oder die Diagnose notwendig sind.
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
          <strong>NWC-Verbindung</strong> (Anbindung an die von Ihnen gewählte Lightning-Wallet):
          <strong> Art. 6 Abs. 1 lit. b DSGVO</strong> und/oder{' '}
          <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>, soweit personenbezogene Daten im Zusammenhang
          mit der Nutzung anfallen.
        </li>
      </ul>

      <h2>10. Datenkategorien und Speicherdauer</h2>
      <p>
        <strong>Kategorien:</strong> können insbesondere umfassen: technische Verbindungs- und
        Zugriffsdaten beim Hosting (Vercel); Sprachpräferenz (lokal im Browser); Wallet-Daten lokal
        (u. a. Schlüsselmaterial, Deskriptoren, Transaktions- und Kontostandsinformationen, sofern
        von Ihnen angelegt oder abgerufen); NWC-Verbindungsdaten und zwischengespeicherte
        Lightning-Informationen lokal; sowie Daten, die im Rahmen der von Ihnen ausgelösten
        Anfragen an Esplora- und NWC-/Lightning-Dritte sichtbar oder verarbeitet werden.
      </p>
      <p>
        <strong>Speicherdauer:</strong> Hosting-Logs bei Vercel richten sich nach den Aufbewahrungs-
        und Löschfristen des Anbieters (siehe die Dokumentation von Vercel). Daten, die nur lokal in
        Ihrem Browser bzw. auf Ihrem Gerät gespeichert werden, bleiben gespeichert, bis Sie sie
        löschen (z. B. App- oder Website-Daten des Browsers entfernen, App-Daten der PWA löschen).
        Von Ihnen heruntergeladene Exportdateien unterliegen Ihrer eigenen Verantwortung; Bitboard
        hat darauf nach dem Download keinen Zugriff.
      </p>

      <h2>11. Drittlandübermittlung (insbesondere USA / Vercel)</h2>
      <p>
        Die Nutzung von Vercel kann eine <strong>Übermittlung personenbezogener Daten in ein
        Drittland</strong> (u. a. die USA) beinhalten. Für solche Übermittlungen werden — je nach
        Anbieter und Sachverhalt — <strong>angemessene Garantien</strong> im Sinne der DSGVO
        eingesetzt, etwa die <strong>Standardvertragsklauseln</strong> der EU-Kommission und/oder
        die Teilnahme am <strong>EU-US Data Privacy Framework</strong>, soweit der Anbieter
        zertifiziert ist. Einzelheiten entnehmen Sie bitte der aktuellen Datenschutzerklärung und
        den Vertragsunterlagen von Vercel.
      </p>

      <h2>12. Beschwerderecht</h2>
      <p>
        Sie haben das Recht, sich bei einer <strong>Aufsichtsbehörde</strong> über die Verarbeitung
        personenbezogener Daten zu beschweren, insbesondere in dem Mitgliedstaat Ihres gewöhnlichen
        Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes. In Deutschland
        ist hierfür beispielsweise die für Ihr Bundesland zuständige Datenschutzaufsicht zuständig.
      </p>

      <h2>13. Ihre Rechte</h2>
      <p>
        Soweit personenbezogene Daten verarbeitet werden, stehen Ihnen die in der DSGVO vorgesehenen
        Rechte (u. a. Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch
        gegen bestimmte Verarbeitungen, Datenübertragbarkeit) grundsätzlich zu. Viele
        Verarbeitungsvorgänge in dieser App erfolgen jedoch lokal auf Ihrem Gerät — dort können Sie
        Daten oft am direktesten löschen (z. B. App-Daten im Browser entfernen).
      </p>
      <p>
        Zur Ausübung Ihrer Rechte im Zusammenhang mit Verarbeitungen, die Bitboard als
        Verantwortlicher steuert, können Sie sich an die oben genannten Kontaktdaten wenden. Bei
        rein lokaler Verarbeitung auf Ihrem Gerät ist eine Löschung häufig durch Entfernen der
        App-Daten oder der gesamten Website-Daten im Browser möglich.
      </p>

      <h2>14. Stand und Änderungen dieser Datenschutzerklärung</h2>
      <p>
        <strong>Stand:</strong> April 2026.
      </p>
      <p>
        Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn sich technische oder
        rechtliche Rahmenbedingungen ändern. Die jeweils aktuelle Version finden Sie hier auf der
        Seite <strong>/privacy</strong> der App (bzw. der öffentlich erreichbaren Version dieser
        Seite).
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

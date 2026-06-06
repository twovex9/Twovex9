-- ============================================================================
-- Contractsjablonen: de 7 echte ETF-templates
-- ----------------------------------------------------------------------------
-- Vervangt de 4 korte demo-sjablonen door de daadwerkelijke ETF-templates
-- (aangeleverd door de directie, 2026-06-06). Merge-velden {{...}} worden bij
-- het opstellen van een contract (medewerker.js) ingevuld met medewerker-
-- gegevens + HR-maatwerk; ontbrekende velden worden een invul-streep.
--
-- De demo-sjablonen worden eerst geback-upt (omkeerbaar) en daarna verwijderd
-- op uitdrukkelijk verzoek van de directie. Er verwijzen 0 contracten naar.
-- Idempotent: vaste UUIDs + ON CONFLICT, dus opnieuw draaien is veilig.
-- ============================================================================

-- 1. Backup van de 4 demo-sjablonen (omkeerbaar) ----------------------------
create table if not exists _contract_sjablonen_bak_demo_20260606 as
  select * from contract_sjablonen
  where id in (
    '5d27013d-9776-4542-94a4-8d0419bfd712',
    '6224cc7b-8312-49df-8519-8bf63eca657d',
    '7d0e03d1-c831-4268-9f89-a64f793e05cc',
    'd8fd8f67-6bcf-4dad-89a3-2e9146e85447'
  );
alter table _contract_sjablonen_bak_demo_20260606 enable row level security;

-- 2. Verwijder de 4 korte demo-sjablonen ------------------------------------
delete from contract_sjablonen
  where id in (
    '5d27013d-9776-4542-94a4-8d0419bfd712',
    '6224cc7b-8312-49df-8519-8bf63eca657d',
    '7d0e03d1-c831-4268-9f89-a64f793e05cc',
    'd8fd8f67-6bcf-4dad-89a3-2e9146e85447'
  );

-- 3. De 7 echte ETF-templates ----------------------------------------------
insert into contract_sjablonen (id, naam, type, beschrijving, body, volgorde, archived) values

-- ---- 1. Arbeidsovereenkomst bepaalde tijd --------------------------------
('a1c70001-0000-4000-8000-000000000001',
 'Arbeidsovereenkomst bepaalde tijd',
 'arbeidsovereenkomst',
 'Arbeidsovereenkomst voor bepaalde tijd (loondienst, CAO Jeugdzorg).',
 $body$ARBEIDSOVEREENKOMST BEPAALDE TIJD

De ondergetekenden:

1. Embrace the Future B.V., rechtsgeldig vertegenwoordigd door haar directeuren de heer L. Austin en mevrouw R. Austin-Winder, gevestigd te (1811 JR) Alkmaar aan de Magdalenenstraat 17,
hierna te noemen: "de werkgever";

en

2. {{volledige_naam}}, geboren op {{geboortedatum}}, woonachtig te {{straat_huisnummer}}, {{postcode}} {{woonplaats}},
hierna te noemen "de werknemer";

Verklaren een arbeidsovereenkomst te zijn aangegaan onder de navolgende bepalingen:

Artikel 1: aard overeenkomst
1.1 Deze overeenkomst is een arbeidsovereenkomst in de zin van artikel 7:610 van het Burgerlijk Wetboek.
1.2 Deze arbeidsovereenkomst is een arbeidsovereenkomst voor bepaalde tijd.
1.3 Deze arbeidsovereenkomst is geen oproepovereenkomst in de zin van artikel 7:628a lid 9 en 10 van het Burgerlijk Wetboek.

Artikel 2: CAO
2.1 Op deze arbeidsovereenkomst is de CAO voor Jeugdzorg van toepassing. Deze CAO bevat ook informatie over onder meer het recht op betaald verlof, recht op scholing en de regels die gelden bij ontslag (in aanvulling op boek 7 titel 10 van het Burgerlijk Wetboek).

Artikel 3: ingangsdatum
3.1 De werknemer treedt bij de werkgever in dienst per {{startdatum}}.

Artikel 4: functie
4.1 De werknemer treedt in dienst in de functie van {{functie}}.
4.2 Als zodanig zullen tot de werkzaamheden van de werknemer behoren: {{werkzaamheden}}.
4.3 De werkgever kan van de werknemer verlangen ook andere werkzaamheden te verrichten dan die welke tot een normale uitoefening van zijn functie behoren, indien en voor zover deze andere werkzaamheden redelijkerwijs van hem gevergd kunnen worden.

Artikel 5: standplaats
5.1 De werkzaamheden worden verricht op een door werkgever aan te wijzen locatie.

Artikel 6: duur
6.1 De arbeidsovereenkomst is aangegaan voor de duur van {{contractduur}} en eindigt van rechtswege op {{einddatum}}.
6.2 De werkgever en de werknemer kunnen deze arbeidsovereenkomst tussentijds schriftelijk opzeggen met inachtneming van de op basis van de wet geldende opzegtermijn, tenzij uit de CAO een afwijkende opzegtermijn voortvloeit.
6.3 De arbeidsovereenkomst eindigt in elk geval met ingang van de dag waarop de werknemer de leeftijd bereikt waarop op grond van de Algemene Ouderdomswet recht op ouderdomspensioen ontstaat.

Artikel 7: proeftijd
7.1 De eerste maand van de arbeidsovereenkomst geldt als proeftijd.
7.2 Gedurende de proeftijd zullen zowel de werkgever als de werknemer de arbeidsovereenkomst op elk gewenst moment met onmiddellijke ingang kunnen opzeggen.

Artikel 8: arbeidstijd
8.1 De arbeidsovereenkomst wordt aangegaan voor gemiddeld {{uren}} uur per week.
8.2 De dagen en tijden waarop de arbeid dient te worden verricht worden bepaald door de werkgever.
8.3 De werkgever kan van de werknemer verlangen in bijzondere gevallen overwerk te verrichten conform het bepaalde in de CAO. Overwerk wordt vergoed conform het bepaalde in de CAO.

Artikel 9: salaris
9.1 De werknemer is ingedeeld in salarisschaal {{schaal}} van de CAO, periodiek {{periodiek}}. Het salaris bedraagt ten tijde van het aangaan van de overeenkomst EUR {{salaris}} bruto per maand op basis van een dienstverband van {{uren}} uur per week.
9.2 Het salaris zal maandelijks tegen het einde van de maand uitbetaald worden op een door de werknemer aan te wijzen bankrekening.
9.3 De werknemer stemt ermee in dat de loonstrook door de werkgever op elektronische wijze kan worden verstrekt.

Artikel 10: arbeidsongeschiktheid
10.1 De werknemer is verplicht zich te onderwerpen aan de controlevoorschriften ter zake van ziekteverzuim, welke door of namens de werkgever zijn of zullen worden vastgesteld. De werknemer verklaart een exemplaar van deze controlevoorschriften te hebben ontvangen.
10.2 De werkgever is steeds bevoegd tot wijziging van deze voorschriften.
10.3 Bij niet-nakoming van de controlevoorschriften is de werkgever bevoegd tot opschorting van de betaling van het loon op grond van het bepaalde in artikel 7:629 lid 6 van het Burgerlijk Wetboek.

Artikel 11: vakantie
11.1 Aan de werknemer met een fulltime dienstverband (36 uur) wordt een recht op wettelijke vakantie met behoud van salaris toegekend van 144 uur en recht op bovenwettelijke vakantie met behoud van salaris toegekend van 56 uur. In totaal bedraagt het recht op vakantie met behoud van salaris 200 uur bij een fulltime dienstverband (per vakantiejaar lopend van januari tot januari).
11.2 Vakantiedagen worden opgenomen in overleg met en na goedkeuring door werkgever.

Artikel 12: vakantietoeslag
12.1 Aan de werknemer zal 8% van zijn salaris als vakantietoeslag worden uitgekeerd.
12.2 De betaling van de vakantietoeslag lopende over de periode van 1 juni tot en met 31 mei zal plaatsvinden in de maand mei.

Artikel 13: beëindiging
13.1 Bij beëindiging van de arbeidsovereenkomst zal verrekening van te veel dan wel te weinig opgenomen vakantiedagen en eventueel te weinig uitbetaalde vakantietoeslag geschieden door inhouding op, dan wel uitbetaling in de maand na de uitdiensttreding. Een en ander naar rato van het aantal gewerkte maanden in de betreffende periode.

Artikel 14: pensioen
14.1 De werknemer is verplicht toe te treden tot het bedrijfstakpensioenfonds waarbij de werkgever is aangesloten, een en ander conform de bepalingen van het reglement van dit pensioenfonds.

Artikel 15: geheimhouding
15.1 De werknemer erkent, dat aan hem door de werkgever geheimhouding is opgelegd van alle bijzonderheden het bedrijf van de werkgever en de cliënten van de werkgever betreffende, of daarmee verband houdende.
15.2 Het is aan de werknemer verboden om hetzij tijdens de duur van de arbeidsovereenkomst, hetzij erna op enigerlei wijze, direct of indirect in welke vorm ook, mededelingen te doen van of aangaande het bedrijf van de werkgever alsmede van of aangaande de cliënten van de werkgever. Onder schending van de geheimhoudingsplicht wordt tevens verstaan het – zonder voorafgaande toestemming van de werkgever – brengen van vertrouwelijke bedrijfs- of cliëntinformatie buiten de gegevensdragers/'Cloud omgeving' van de werkgever, alsmede de verzending van dergelijke gegevens naar gegevensdragers van de werknemer en sociale media en/of privé-emailadres(sen) van de werknemer.
15.3 Bij overtreding van de verplichtingen uit hoofde van het bepaalde in dit artikel zal de werknemer, in afwijking van het bepaalde in artikel 7:650 lid 3, 4 en 5 BW, aan de werkgever zonder dat enige ingebrekestelling is vereist, voor iedere overtreding een boete verbeuren ten bedrage van EUR 5.000,-, een en ander onverminderd het recht van de werkgever om – in plaats van de boetes – volledige schadevergoeding te vorderen.

Artikel 16: contact met cliënten
16.1 Het is aan de werknemer verboden om hetzij tijdens de duur van de arbeidsovereenkomst, hetzij erna op enigerlei wijze, direct of indirect in welke vorm dan ook contact buiten diensttijden met de cliënten te onderhouden. Denkende bijvoorbeeld aan sociale media kanalen of telefonisch.

Artikel 17: verbod van nevenwerkzaamheden
17.1 De werknemer onthoudt zich van het verrichten van werkzaamheden voor derden gelijk aan of vergelijkbaar met de voor de werkgever te verrichten werkzaamheden, van het doen van zaken voor eigen rekening gelijk aan of vergelijkbaar met de zaken van de werkgever, alsmede van elke directe of indirecte betrokkenheid of financiële interesse bij dergelijke werkzaamheden of zaken, een en ander behoudens de uitdrukkelijke voorafgaande schriftelijke toestemming van de werkgever.
17.2 Bij overtreding van de verplichtingen uit hoofde van het bepaalde in dit artikel zal de werknemer, in afwijking van het bepaalde in artikel 7:650 lid 3, 4 en 5 BW, aan de werkgever zonder dat enige ingebrekestelling is vereist, voor iedere overtreding een boete verbeuren ten bedrage van EUR 2.500,-, alsmede een boete van EUR 250,- voor elke dag dat de overtreding voortduurt, een en ander onverminderd het recht van de werkgever om – in plaats van de boetes – volledige schadevergoeding te vorderen.

Artikel 18: afwijkingen en aanpassingen
18.1 Deze arbeidsovereenkomst wordt geacht een volledige weergave te bevatten van de afspraken ter zake tussen partijen, zoals die bestaan op het moment van de ondertekening van de overeenkomst. Deze overeenkomst prevaleert boven en vervangt alle voorgaande mondelinge en schriftelijke overeenkomsten tussen de werkgever en de werknemer.
18.2 Aanvullingen op, en afwijkingen van deze arbeidsovereenkomst zullen alleen geldig zijn indien en voor zover zij schriftelijk tussen partijen zijn overeengekomen, of schriftelijk door de werkgever zijn bevestigd.
18.3 De werkgever is gerechtigd één of meer uit deze arbeidsovereenkomst voortvloeiende arbeidsvoorwaarde(n) te wijzigen in de gevallen als vermeld in artikel 7:613 van het Burgerlijk Wetboek (dat wil zeggen: indien de werkgever bij deze wijziging een zodanig zwaarwichtig belang heeft dat het belang van de werknemer dat door de wijziging zou worden geschaad daarvoor naar maatstaven van redelijkheid en billijkheid moet wijken). Daarnaast behoudt de werkgever zich uitdrukkelijk het recht voor om deze arbeidsovereenkomst en de daarin voorkomende bepalingen eenzijdig te wijzigen indien de invoering van (bepalingen van) wet- en regelgeving daartoe aanleiding geven.

Artikel 19: toepasselijk recht/bevoegde rechter
19.1 Op deze arbeidsovereenkomst is het Nederlandse recht bij uitsluiting van ieder ander rechtsstelsel van toepassing.
19.2 De Nederlandse rechter is bij uitsluiting van ieder ander bevoegd tot beslechting van geschillen voortvloeiend uit deze overeenkomst.

Artikel 20: verstrekking kopie arbeidsovereenkomst
20.1 Door ondertekening van deze overeenkomst verklaart de werknemer een exemplaar van deze overeenkomst te hebben ontvangen.

Aldus overeengekomen, opgemaakt in 2-voud en ondertekend te Alkmaar op {{datum_vandaag}}.


de werkgever                                  de werknemer
Embrace the Future B.V.                       {{volledige_naam}}$body$,
 1, false),

-- ---- 2. BBL-arbeidsovereenkomst -------------------------------------------
('a1c70001-0000-4000-8000-000000000002',
 'BBL-arbeidsovereenkomst',
 'bbl',
 'Arbeidsovereenkomst bepaalde tijd voor een werknemer-in-opleiding via de Beroepsbegeleidende Leerweg (BBL).',
 $body$ARBEIDSOVEREENKOMST BEPAALDE TIJD – BBL (BEROEPSBEGELEIDENDE LEERWEG)

De ondergetekenden:

1. Embrace the Future B.V., rechtsgeldig vertegenwoordigd door haar directeuren de heer L. Austin en mevrouw R. Austin-Winder, gevestigd te (1811 JR) Alkmaar aan de Magdalenenstraat 17,
hierna te noemen: "de werkgever" of "ETF";

en

2. {{volledige_naam}}, geboren op {{geboortedatum}}, woonachtig te {{straat_huisnummer}}, {{postcode}} {{woonplaats}},
hierna te noemen "de werknemer";

Verklaren een arbeidsovereenkomst voor de duur van een BBL-leertraject te zijn aangegaan onder de navolgende bepalingen:

Artikel 1: Aard van de overeenkomst
1.1 Deze overeenkomst is een arbeidsovereenkomst in de zin van artikel 7:610 BW, aangegaan in het kader van de Beroepsbegeleidende Leerweg (BBL) zoals bedoeld in artikel 7.2.7 lid 4 Wet educatie en beroepsonderwijs (WEB).
1.2 Deze arbeidsovereenkomst is een arbeidsovereenkomst voor bepaalde tijd, gekoppeld aan de duur van de in artikel 4 genoemde BBL-opleiding.
1.3 Naast deze arbeidsovereenkomst sluiten de werknemer en de onderwijsinstelling een praktijkovereenkomst (POK) waarbij ETF als erkend leerbedrijf betrokken is. De praktijkovereenkomst regelt de onderwijsinhoudelijke aspecten van de BBL-opleiding.

Artikel 2: CAO
2.1 Op deze arbeidsovereenkomst is de CAO voor Jeugdzorg van toepassing, met inachtneming van de specifieke bepalingen die gelden voor BBL-werknemers / werknemers-in-opleiding.

Artikel 3: Ingangsdatum en duur
3.1 De werknemer treedt bij de werkgever in dienst per {{startdatum}}.
3.2 Deze arbeidsovereenkomst is aangegaan voor de duur van de in artikel 4 genoemde BBL-opleiding en eindigt van rechtswege op {{einddatum}}.
3.3 De arbeidsovereenkomst eindigt eveneens van rechtswege en met onmiddellijke ingang indien de werknemer:
   a. de BBL-opleiding voortijdig staakt;
   b. wordt uitgeschreven door de onderwijsinstelling;
   c. de praktijkovereenkomst (POK) wordt beëindigd.

Artikel 4: Opleiding
4.1 De werknemer volgt de opleiding {{opleiding}} aan {{onderwijsinstelling}}.
4.2 De werknemer is verplicht de opleiding actief en gemotiveerd te volgen, regelmatig aanwezig te zijn op de geplande lesdagen, en zich naar beste vermogen in te spannen om de opleiding met goed gevolg af te ronden.
4.3 De werknemer informeert de werkgever onverwijld over: stagnatie in de studievoortgang, voortijdige beëindiging van de opleiding, niet-behaalde tentamens of examens, en wijzigingen in de planning of duur van de opleiding.
4.4 De werkgever vergoedt de in het kader van de BBL-opleiding noodzakelijke studiekosten (zoals lesgeld en lesmateriaal). Een aanvullende studiekostenovereenkomst kan, indien partijen dat overeenkomen, worden gesloten voor additionele kosten of in geval van voortijdige beëindiging.

Artikel 5: Functie
5.1 De werknemer treedt in dienst in de functie van {{functie}}.
5.2 De werkzaamheden worden uitgevoerd op een door de werkgever aan te wijzen locatie en onder begeleiding van een gekwalificeerde medewerker (de praktijkbegeleider).
5.3 De werknemer voert geen werkzaamheden uit waarvoor hij/zij (nog) niet gekwalificeerd is.

Artikel 6: Arbeidstijd en verdeling werk/school
6.1 De arbeidsovereenkomst wordt aangegaan voor gemiddeld {{uren}} uur per week aan werkzaamheden bij ETF, in beginsel verdeeld over {{dagen}} dagen per week.
6.2 Daarnaast volgt de werknemer gemiddeld één lesdag per week (of een equivalent daarvan) onderwijs aan de onderwijsinstelling. De lesdag is geen arbeidstijd, tenzij anders schriftelijk overeengekomen.
6.3 De werkgever houdt bij de roostering rekening met de verplichte lesdagen, examenmomenten en stage-onderdelen van de BBL-opleiding.

Artikel 7: Salaris
7.1 De werknemer is ingedeeld in salarisschaal {{schaal}}, periodiek {{periodiek}}. Het salaris bedraagt ten tijde van het aangaan van de overeenkomst EUR {{salaris}} bruto per maand op basis van {{uren}} uur per week.
7.2 Het salaris wordt periodiek aangepast volgens de in de CAO Jeugdzorg vastgelegde regels voor BBL-werknemers, waaronder eventuele tussentijdse verhoging bij voortgang in de opleiding.
7.3 Het salaris wordt maandelijks tegen het einde van de maand uitbetaald op een door de werknemer aan te wijzen bankrekening.

Artikel 8: Proeftijd
8.1 De eerste {{proeftijd}} van de arbeidsovereenkomst geldt als proeftijd, in overeenstemming met artikel 7:652 BW.
8.2 Gedurende de proeftijd kunnen zowel de werkgever als de werknemer de arbeidsovereenkomst op elk gewenst moment met onmiddellijke ingang opzeggen.

Artikel 9: Vakantie
9.1 Aan de werknemer met een fulltime dienstverband (36 uur) wordt een recht op wettelijke vakantie van 144 uur en bovenwettelijke vakantie van 56 uur toegekend, totaal 200 uur per vakantiejaar (lopend van januari tot januari). Naar rato bij parttime dienstverband.
9.2 Vakantieaanvragen worden zoveel mogelijk in de schoolvakanties opgenomen, om de aanwezigheid op de lesdagen niet te verstoren.

Artikel 10: Vakantietoeslag, arbeidsongeschiktheid en pensioen
10.1 Aan de werknemer wordt 8% van het salaris als vakantietoeslag uitgekeerd, jaarlijks in de maand mei.
10.2 Bij arbeidsongeschiktheid gelden de wettelijke regels en de in de bijlage bij deze overeenkomst opgenomen controlevoorschriften ziekteverzuim.
10.3 De werknemer treedt toe tot het bedrijfstakpensioenfonds waarbij ETF is aangesloten, conform het reglement van dat fonds.

Artikel 11: Personeelsreglement, geheimhouding en gedrag
11.1 Op deze arbeidsovereenkomst is het Personeelsreglement van ETF van toepassing, dat als bijlage bij deze overeenkomst wordt verstrekt en door ondertekening door de werknemer wordt aanvaard.
11.2 De werknemer is gebonden aan de geheimhoudingsplicht, het verbod op contact met cliënten buiten diensttijd, het verbod van nevenwerkzaamheden zonder toestemming, en de overige bepalingen zoals opgenomen in het Personeelsreglement, met de daarin genoemde boetebedingen.

Artikel 12: Voortijdige beëindiging van de opleiding
12.1 Indien de werknemer de BBL-opleiding voortijdig staakt of door eigen toedoen wordt uitgeschreven door de onderwijsinstelling, eindigt deze arbeidsovereenkomst van rechtswege overeenkomstig artikel 3.3.
12.2 Indien partijen aanvullende afspraken hebben gemaakt over terugbetaling van studiekosten, gelden deze afspraken zoals vastgelegd in de afzonderlijke studiekostenovereenkomst.

Artikel 13: Toepasselijk recht en overige bepalingen
13.1 Op deze arbeidsovereenkomst is uitsluitend Nederlands recht van toepassing.
13.2 Wijzigingen op deze overeenkomst zijn slechts geldig indien schriftelijk tussen partijen overeengekomen en door beide partijen ondertekend.
13.3 Door ondertekening verklaart de werknemer een exemplaar van deze overeenkomst te hebben ontvangen, evenals het Personeelsreglement en de controlevoorschriften ziekteverzuim.

Aldus overeengekomen, opgemaakt in 2-voud en ondertekend te Alkmaar op {{datum_vandaag}}.


de werkgever                                  de werknemer
Embrace the Future B.V.                       {{volledige_naam}}$body$,
 2, false),

-- ---- 3. Overeenkomst van opdracht (ZZP) -----------------------------------
('a1c70001-0000-4000-8000-000000000003',
 'Overeenkomst van opdracht (ZZP)',
 'opdracht',
 'Overeenkomst van opdracht (art. 7:400 BW) voor zelfstandigen zonder personeel (ZZP). Geen arbeidsovereenkomst.',
 $body$OVEREENKOMST VAN OPDRACHT

Ondergetekenden:

1. Besloten vennootschap met gewone structuur Embrace the Future B.V., ingeschreven bij de Kamer van Koophandel onder nummer 80102093 en gevestigd aan Magdalenenstraat 17, 1811 JR te Alkmaar, vertegenwoordigd door L. Austin & R. Austin-Winder, hierna te noemen "Opdrachtgever";

en

2. {{bedrijfsnaam}}, ingeschreven bij de Kamer van Koophandel onder nummer {{kvk_nummer}} en gevestigd aan {{vestigingsadres}}, {{vestiging_postcode}} {{vestigingsplaats}}, rechtsgeldig vertegenwoordigd door {{volledige_naam}}, hierna te noemen "Opdrachtnemer";

Opdrachtnemer en Opdrachtgever hierna gezamenlijk ook te noemen: "Partijen".

Overwegende dat:
- Partijen een Overeenkomst van Opdracht (hierna: Overeenkomst) wensen aan te gaan;
- Opdrachtgever werkzaam is binnen de (jeugd)zorg en/of geestelijke gezondheidszorg;
- Opdrachtgever in het kader hiervan behoefte heeft aan verlening van de door Opdrachtnemer vastgestelde zorg aan de door Opdrachtgever aangewezen patiënten c.q. cliënten en/of aan de patiënten c.q. cliënten van derde(n) (hierna te noemen "Opdracht"), doorgaans samenwerkingspartners en/of opdrachtgevers van Opdrachtgever (hierna te noemen "Derde(n)");
- Opdrachtnemer als zelfstandig ondernemer eigen ondernemersrisico draagt, voor meerdere opdrachtgevers werkzaam is en de Opdracht uitvoert in de uitoefening van een eigen bedrijf of beroep;
- Partijen uitdrukkelijk de toepasselijkheid van een arbeidsovereenkomst in de zin van artikel 7:610 e.v. BW uitsluiten en uitsluitend wensen te contracteren op basis van een overeenkomst van opdracht in de zin van artikel 7:400 e.v. BW;
- Partijen de voorwaarden waaronder Opdrachtnemer voor Opdrachtgever de Opdracht zal verrichten, in deze Overeenkomst wensen vast te leggen.

Artikel 1 – De Overeenkomst
1. De opdracht vangt aan op {{startdatum}} en eindigt op {{einddatum}}.
2. Opdrachtgever verklaart zich er uitdrukkelijk mee akkoord dat Opdrachtnemer ook ten behoeve van andere opdrachtgevers Opdrachten verricht.
3. Eventuele aanvullingen op de Overeenkomst zijn slechts geldig indien en voor zover deze door beide Partijen schriftelijk bevestigd zijn.
4. Partijen zijn gerechtigd deze overeenkomst met onmiddellijke ingang, zonder dat daartoe een ingebrekestelling vereist is, te beëindigen en/of hun verplichtingen per direct op te schorten, indien zich een dringende reden voordoet welke deze maatregel rechtvaardigt (waaronder faillissement, surseance van betaling, het staken van activiteiten, beslag, fraude of overlijden van een der Partijen).
5. Opdrachtgever heeft het recht de overeenkomst met onmiddellijke ingang op te zeggen indien blijkt dat Opdrachtnemer niet (meer) voldoet aan de in artikel 4 gestelde verplichtingen en/of kwalificaties.
6. De Partij die de overeenkomst op grond van lid 4 en lid 5 eindigt, is jegens de andere Partij(en) nimmer gehouden tot enige schadevergoeding ter zake van die beëindiging.
7. Na beëindiging van deze Overeenkomst blijven de bepalingen inzake geheimhouding, het relatiebeding en de aansprakelijkheid onverkort van kracht.

Artikel 2 – De Opdracht
1. Opdrachtnemer accepteert de Opdracht en aanvaardt daarmee de volle verantwoordelijkheid voor het op juiste wijze uitvoeren hiervan.
2. Opdrachtnemer deelt zijn werkzaamheden voortvloeiend uit de Opdracht zelfstandig in. Voor zover dat voor de uitvoering nodig is, vindt afstemming met Opdrachtgever plaats.
3. Opdrachtnemer is bij het uitvoeren van de overeengekomen Opdracht geheel zelfstandig en verricht deze naar eigen inzicht en zonder toezicht of leiding van Opdrachtgever. Opdrachtgever kan wel aanwijzingen en instructies geven omtrent het resultaat van de Opdracht.
4. Onder de taken en verantwoordelijkheden van Opdrachtnemer wordt verstaan: het verlenen van de door Opdrachtnemer vast te stellen zorg aan de door Opdrachtgever aangewezen derde(n).
5. Volledige en tijdige rapportage in het afgesproken rapportagesysteem maakt onderdeel uit van het op te leveren resultaat van de Opdracht.
6. Opdrachtnemer voert de Opdracht naar haar beste inzicht en het vermogen van een zorgvuldig handelend Opdrachtnemer uit.
7. Opdrachtnemer draagt zorg voor zijn eigen scholing, zodat hij voldoet aan het vereiste opleidingsniveau, diploma's, certificeringen en competenties.
8. Indien Opdrachtnemer voorziet dat zij de Opdracht (tijdelijk) niet kan uitvoeren, informeert zij Opdrachtgever en/of Derde(n) zo spoedig mogelijk, doch uiterlijk 48 uur voor aanvang van de Opdracht.
9. Opdrachtnemer kan worden verzocht de Opdracht op locatie van Derde(n) uit te voeren en zorg te verlenen aan patiënten van deze Derde(n).
10. Bij meerwerk vanwege onvoorziene omstandigheden meldt Opdrachtnemer dit per e-mail aan de planning van Opdrachtgever.

Artikel 2A – Vrije vervanging
1. Opdrachtnemer heeft het recht zich bij de uitvoering van de Opdracht te laten vervangen door een derde, mits deze derde voldoet aan de voor de Opdracht geldende kwaliteitseisen (opleidingsniveau, diploma's, certificeringen, VOG en – indien van toepassing – SKJ-registratie).
2. Opdrachtnemer informeert Opdrachtgever vooraf over de inzet van een vervanger en draagt er zorg voor dat de vervanger op de hoogte is van de inhoud van de Opdracht en de geheimhoudingsverplichting.
3. Opdrachtnemer blijft jegens Opdrachtgever volledig verantwoordelijk voor de correcte uitvoering van de Opdracht, ook indien deze door een vervanger wordt uitgevoerd.

Artikel 3 – Vergoeding en betaling
1. Voor het verrichten van de Opdracht ontvangt Opdrachtnemer EUR {{tarief}} per uur, vrijgesteld van btw; dit is een all-in tarief.
2. Opdrachtnemer ontvangt alleen een vergoeding voor de daadwerkelijk gemaakte uren. Bij een ambulante casus geldt: als er sprake is van een no-show van een cliënt, ontvangt Opdrachtnemer 1 uur vergoeding voor de opkomst. De facturatie vindt plaats op maandbasis; uiterlijk de tiende dag van de nieuwe maand dient de factuur te worden verstuurd naar facturatie@embracethefuture.nl.
3. Opdrachtnemer specificeert de factuur op gewerkte uren per locatie (elke locatie op een aparte factuur; ambulante werkzaamheden eveneens apart). Opdrachtgever voldoet de factuur uiterlijk binnen 40 dagen na ontvangst. De factuur dient binnen twee maanden te worden ingediend; hierna vervalt de incassoplicht.

Artikel 4 – Verplichtingen Opdrachtnemer
1. Opdrachtnemer verklaart en staat ervoor in dat zij ten tijde van deze Overeenkomst als zelfstandig ondernemer werkzaam is. Het risico van eventuele naheffingen in het kader van de fiscale en socialeverzekeringswetgeving ligt bij Opdrachtnemer.
2. Opdrachtnemer verklaart over de benodigde deskundigheid, het vereiste opleidingsniveau, diploma's, certificeringen en competenties te beschikken.
3. Opdrachtnemer beschikt over een adequate beroeps- en bedrijfsaansprakelijkheidsverzekering.
4. Opdrachtnemer informeert Opdrachtgever en/of Derde(n) over alle omstandigheden die een tijdige of juiste uitvoering van de Opdracht belemmeren.
5. Indien Opdrachtnemer op voorhand weet dat zij de Opdracht niet kan uitvoeren, maakt zij dit zo spoedig mogelijk kenbaar per e-mail aan planning@embracethefuture.nl, en kan zij gebruikmaken van het vervangingsrecht (artikel 2A).

Artikel 5 – Dossier Opdrachtnemer
Vóór de start van de Opdracht overhandigt Opdrachtnemer onder meer: kopie bankrekeningnummer, zorgdiploma's, (indien van toepassing) een geldig BHV-certificaat, bewijs van aanmelding klachtenportaal, bewijs van aanmelding zorgaanbiedersportaal, (indien van toepassing) een SKJ-registratie, een door beide Partijen ondertekende overeenkomst van opdracht, uittreksel KvK, en een Verklaring Omtrent Gedrag (niet ouder dan 3 maanden). Zodra de documenten zijn ontvangen en in orde zijn, vangt de Opdracht aan.

Artikel 6 – Verplichtingen Opdrachtgever
Opdrachtgever voorziet Opdrachtnemer van alle benodigde informatie om de Opdracht uit te voeren en stuurt op eerste verzoek de noodzakelijke schriftelijke stukken toe.

Artikel 7 – Voorkomen tussenkomstfictie
Partijen willen de toepasselijkheid van de fictieve dienstbetrekking van tussenkomst voorkomen. Opdrachtnemer verricht de Opdracht in de uitoefening van een bedrijf of beroep. Opdrachtnemer verklaart in het bezit te zijn van een adequate bedrijfs- en beroepsaansprakelijkheidsverzekering met een minimale dekking van EUR 500.000,- per gebeurtenis en minimaal EUR 1.000.000,- per jaar, en voldoet aan zijn wettelijke verplichtingen inzake belastingen en sociale premies.

Artikel 8 – Bedrijfsmiddelen
Opdrachtgever zal voor de uitvoering van de Opdracht geen bedrijfsmiddelen aan Opdrachtnemer verstrekken.

Artikel 9 – Privacy
Opdrachtgever geeft Opdrachtnemer toestemming tot het verwerken van persoonsgegevens in het kader van deze Overeenkomst. Indien Opdrachtnemer inzage heeft in persoonsgegevens, wordt een verwerkersovereenkomst gesloten en wordt Opdrachtnemer gezien als Verwerker in de zin van de AVG.

Artikel 10 – Aansprakelijkheid
Partijen zijn aansprakelijk en gehouden tot vergoeding van alle schade, voor zover deze door de uitvoering van de Opdracht is ontstaan en te wijten is aan het (roekeloos) handelen of nalaten van een der Partijen. Het schadebedrag is gemaximaliseerd tot de uit te keren vergoeding van de verzekeraar, vermeerderd met het eigen risico. Opdrachtnemer vrijwaart Opdrachtgever en de Derde(n) tegen een mogelijke vordering van de Belastingdienst tot inhouding en/of afdracht van loonbelasting en premies.

Artikel 11 – Vrijwaring en juistheid van informatie
Opdrachtnemer is zelf verantwoordelijk voor de juistheid, betrouwbaarheid en volledigheid van alle gegevens die zij aan Opdrachtgever verstrekt, en vrijwaart Opdrachtgever van elke aansprakelijkheid ingevolge het niet of niet tijdig nakomen daarvan.

Artikel 12 – Relatiebeding
1. Het is Opdrachtnemer niet toegestaan om gedurende één jaar na beëindiging van deze Overeenkomst een Derde, bij wie Opdrachtnemer in het kader van de Opdracht werkzaamheden heeft uitgevoerd, rechtstreeks te benaderen of voor deze werkzaamheden te verrichten.
2. Bij overtreding verbeurt Opdrachtnemer een direct opeisbare boete van EUR 2.500,- per overtreding, alsmede EUR 250,- voor iedere dag dat de overtreding voortduurt, zonder nadere ingebrekestelling.

Artikel 13 – Geheimhouding
Partijen zijn verplicht tot geheimhouding van alle vertrouwelijke informatie die hen in het kader van deze Overeenkomst ter kennis is gekomen. Bij overtreding verbeurt de overtredende Partij een direct opeisbare boete van EUR 2.500,- per overtreding, alsmede EUR 250,- voor iedere dag dat de overtreding voortduurt.

Artikel 14 – Algemene Voorwaarden
Op deze Overeenkomst zijn geen algemene voorwaarden van toepassing.

Artikel 15 – Slotbepalingen
Deze Overeenkomst vervangt alle eerdere overeenkomsten met een gelijkwaardig onderwerp. Wijzigingen binden Partijen slechts indien schriftelijk overeengekomen. Indien een clausule (deels) nietig is, blijven de overige bepalingen van kracht.

Artikel 16 – Geschillen
Op deze Overeenkomst is Nederlands recht van toepassing. Geschillen worden beslecht door de bevoegde Nederlandse rechter waar het kantoor van Opdrachtgever is gevestigd (Noord-Holland, locatie Haarlem), tenzij dwingend recht anders bepaalt.

Aldus in tweevoud overeengekomen en ondertekend te Alkmaar op {{datum_vandaag}}.


Opdrachtgever                                 Opdrachtnemer
L. Austin & R. Austin-Winder                  {{volledige_naam}}
Embrace the Future B.V.                        {{bedrijfsnaam}}$body$,
 3, false),

-- ---- 4. Stageovereenkomst (onderwijsstage) --------------------------------
('a1c70001-0000-4000-8000-000000000004',
 'Stageovereenkomst (onderwijsstage)',
 'stage',
 'Driepartijenovereenkomst voor een onderwijsstage (MBO/HBO). Geen arbeidsovereenkomst.',
 $body$STAGEOVEREENKOMST

De ondergetekenden:

1. Embrace the Future B.V., rechtsgeldig vertegenwoordigd door haar directeuren de heer L. Austin en mevrouw R. Austin-Winder, gevestigd te (1811 JR) Alkmaar aan de Magdalenenstraat 17,
hierna te noemen: "de stagebieder" of "ETF";

en

2. {{volledige_naam}}, geboren op {{geboortedatum}}, woonachtig te {{straat_huisnummer}}, {{postcode}} {{woonplaats}}, student aan {{onderwijsinstelling}} in de opleiding {{opleiding}}, studentnummer {{studentnummer}},
hierna te noemen "de stagiair";

en

3. {{onderwijsinstelling}}, gevestigd te {{adres_onderwijsinstelling}}, vertegenwoordigd door {{contactpersoon}},
hierna te noemen "de onderwijsinstelling";

stagebieder, stagiair en onderwijsinstelling hierna gezamenlijk ook te noemen: "partijen".

In aanmerking nemende dat:
- de stagiair voor zijn/haar opleiding praktijkervaring dient op te doen in de zorgsector, in de vorm van een leerstage;
- ETF bereid is de stagiair een stageplaats aan te bieden waarin het opdoen van leerervaring centraal staat;
- partijen uitdrukkelijk niet wensen te contracteren op basis van een arbeidsovereenkomst in de zin van artikel 7:610 BW, maar uitsluitend op basis van een stageovereenkomst gericht op leren.

Komen overeen als volgt:

Artikel 1: Aard van de overeenkomst
1.1 Deze overeenkomst is een stageovereenkomst, geen arbeidsovereenkomst in de zin van artikel 7:610 BW. Het primaire doel van de stage is het opdoen van leerervaring door de stagiair.
1.2 De stagiair heeft uit hoofde van deze overeenkomst geen recht op loon, vakantiegeld, vakantiedagen of pensioenopbouw. De stagiair komt uitsluitend de in artikel 5 genoemde stagevergoeding toe.

Artikel 2: Duur en omvang van de stage
2.1 De stage vangt aan op {{startdatum}} en eindigt op {{einddatum}}.
2.2 De stagiair is gedurende de stage gemiddeld {{uren}} uur per week aanwezig bij ETF, verdeeld over {{dagen}} dagen per week. De stagedagen en -tijden worden in onderling overleg vastgesteld.
2.3 De eerste maand van de stage geldt als proefperiode. Tijdens deze proefperiode kunnen partijen de stage met onmiddellijke ingang beëindigen indien blijkt dat de stage niet aansluit bij de leerdoelen of de werkwijze van ETF.

Artikel 3: Stageopdracht en leerdoelen
3.1 De stagiair voert tijdens de stage de volgende werkzaamheden uit, passend bij het niveau van de opleiding: {{werkzaamheden}}.
3.2 De leerdoelen worden vastgesteld in overleg tussen de stagiair, de stagebegeleider van ETF en de onderwijsinstelling, en vastgelegd in een stageplan dat als bijlage bij deze overeenkomst wordt gevoegd.
3.3 De stagiair voert geen werkzaamheden uit waarvoor hij/zij niet gekwalificeerd is, en handelt te allen tijde onder verantwoordelijkheid van een gekwalificeerde medewerker van ETF.

Artikel 4: Begeleiding
4.1 ETF wijst als stagebegeleider aan: {{stagebegeleider}}. De stagebegeleider is het eerste aanspreekpunt voor de stagiair en draagt zorg voor inhoudelijke begeleiding op de werkvloer.
4.2 De onderwijsinstelling wijst als praktijkbegeleider/stagedocent aan: {{stagedocent}}.
4.3 Tussentijdse evaluaties vinden plaats op afgesproken momenten. De eindbeoordeling wordt opgesteld door de stagebegeleider in overleg met de praktijkbegeleider en de stagiair.

Artikel 5: Stagevergoeding
5.1 De stagiair ontvangt een stagevergoeding van EUR {{salaris}} bruto per maand, gebaseerd op de in artikel 2.2 genoemde urenomvang van {{uren}} uur per week.
5.2 De stagevergoeding is uitdrukkelijk geen loon in de zin van het Burgerlijk Wetboek of de fiscale wetgeving, maar een onkosten- en motivatievergoeding.
5.3 De stagevergoeding wordt maandelijks tegen het einde van de maand uitbetaald op een door de stagiair aan te wijzen bankrekening.
5.4 Bij ziekte, langdurige afwezigheid of voortijdige beëindiging wordt de stagevergoeding naar rato berekend over de daadwerkelijk gevolgde stageperiode.

Artikel 6: Verplichtingen stagiair
6.1 De stagiair houdt zich aan de bij ETF geldende huisregels, gedragsregels, veiligheidsvoorschriften en het personeelsreglement, voor zover deze redelijkerwijs op een stagiair van toepassing zijn.
6.2 De stagiair is verplicht tot strikte geheimhouding ten aanzien van alle informatie betreffende ETF, haar cliënten, medewerkers en bedrijfsvoering, zowel tijdens als na afloop van de stage.
6.3 De stagiair handelt conform de Algemene Verordening Gegevensbescherming (AVG) en de aanvullende privacybepalingen van ETF.
6.4 De stagiair levert vóór aanvang van de stage een geldige Verklaring Omtrent het Gedrag (VOG) in, niet ouder dan drie maanden.
6.5 Het is de stagiair niet toegestaan buiten diensttijd contact te onderhouden met cliënten van ETF, ook niet via sociale media, telefoon of in persoonlijke ontmoetingen.

Artikel 7: Verplichtingen ETF
7.1 ETF biedt de stagiair een veilige en leerzame stageplek, met passende begeleiding op het niveau van de opleiding.
7.2 ETF zorgt ervoor dat de stagiair de benodigde middelen, informatie en toegang krijgt om de stage en het stageplan goed te kunnen uitvoeren.
7.3 ETF werkt mee aan tussentijdse en eindevaluaties en levert tijdig een eindbeoordeling aan de onderwijsinstelling.

Artikel 8: Aansprakelijkheid en verzekering
8.1 De stagiair is tijdens de stage verzekerd via de aansprakelijkheidsverzekering van de onderwijsinstelling, voor zover de onderwijsinstelling daartoe een dekking heeft afgesloten. Bij gebreke daarvan is de stagiair zelf verantwoordelijk voor een passende particuliere aansprakelijkheidsverzekering.
8.2 ETF is niet aansprakelijk voor schade die de stagiair veroorzaakt tijdens de uitvoering van de stage, behoudens schade ontstaan door opzet of bewuste roekeloosheid van ETF.
8.3 De stagiair is aansprakelijk voor schade aan eigendommen van ETF of derden, indien deze schade is ontstaan door opzet of grove nalatigheid van de stagiair.

Artikel 9: Tussentijdse beëindiging
9.1 Deze stageovereenkomst kan tussentijds worden beëindigd: in onderling overleg; door ETF indien de stagiair zich niet houdt aan de afspraken, het stageplan, het personeelsreglement of de geheimhoudingsplicht; door de onderwijsinstelling indien de stagiair zijn/haar studie staakt; en door ETF met onmiddellijke ingang in geval van een dringende reden.

Artikel 10: Slotbepalingen
10.1 Wijzigingen of aanvullingen zijn slechts geldig indien schriftelijk tussen partijen overeengekomen en door alle drie de partijen ondertekend.
10.2 Op deze overeenkomst is uitsluitend Nederlands recht van toepassing.
10.3 Door ondertekening verklaren partijen een exemplaar te hebben ontvangen, de inhoud te hebben gelezen, begrepen en zonder voorbehoud te aanvaarden.

Aldus overeengekomen, opgemaakt in 3-voud en ondertekend te Alkmaar op {{datum_vandaag}}.


De stagebieder (ETF)        De stagiair                 De onderwijsinstelling
Embrace the Future B.V.     {{volledige_naam}}          {{onderwijsinstelling}}$body$,
 4, false),

-- ---- 5. Geldleningsovereenkomst -------------------------------------------
('a1c70001-0000-4000-8000-000000000005',
 'Geldleningsovereenkomst medewerker',
 'geldlening',
 'Overeenkomst van geldlening van ETF aan een medewerker, met aflossing via inhouding op het netto-salaris.',
 $body$OVEREENKOMST VAN GELDLENING

De ondergetekenden:

1. Embrace the Future B.V., rechtsgeldig vertegenwoordigd door haar directeuren de heer L. Austin en mevrouw R. Austin-Winder, gevestigd te (1811 JR) Alkmaar aan de Magdalenenstraat 17,
hierna te noemen: "de uitlener";

en

2. {{volledige_naam}}, geboren op {{geboortedatum}}, woonachtig te {{straat_huisnummer}}, {{postcode}} {{woonplaats}}, in dienst bij Embrace the Future B.V. in de functie van {{functie}},
hierna te noemen "de lener";

uitlener en lener hierna gezamenlijk ook te noemen: "partijen".

In aanmerking nemende dat:
- de lener bij de uitlener in dienst is op basis van een arbeidsovereenkomst;
- de lener de uitlener heeft verzocht om een geldlening te verstrekken;
- de uitlener bereid is dit verzoek in te willigen onder de in deze overeenkomst opgenomen voorwaarden.

Komen overeen als volgt:

Artikel 1: Hoofdsom
1.1 De uitlener verstrekt aan de lener een geldlening ten bedrage van EUR {{hoofdsom}} (zegge: {{hoofdsom_voluit}}), hierna te noemen "de hoofdsom".
1.2 De hoofdsom wordt door de uitlener overgemaakt op rekeningnummer {{iban}} ten name van de lener, uiterlijk binnen vijf (5) werkdagen na ondertekening van deze overeenkomst.
1.3 De lener verklaart de hoofdsom van de uitlener te hebben ontvangen respectievelijk te zullen ontvangen en daarvoor aan de uitlener verschuldigd te zijn.

Artikel 2: Rente
2.1 Over de hoofdsom is de lener aan de uitlener een rente verschuldigd van 4% per jaar, berekend over het openstaande saldo.
2.2 De rente wordt maandelijks berekend en bij elke aflossingstermijn samen met het af te lossen deel van de hoofdsom voldaan.

Artikel 3: Aflossing
3.1 De lener lost de hoofdsom, vermeerderd met de verschuldigde rente, af door middel van inhouding op het netto-salaris dat de uitlener aan de lener verschuldigd is uit hoofde van de bestaande arbeidsovereenkomst.
3.2 De lener verleent door ondertekening uitdrukkelijke en onherroepelijke toestemming aan de uitlener om de in artikel 3.1 bedoelde inhouding maandelijks op het netto-salaris te verrichten.
3.3 Het bedrag van de maandelijkse inhouding bedraagt EUR {{maandbedrag}} per maand, voor het eerst in te houden op het salaris over de maand {{eerste_inhouding}}, en vervolgens iedere kalendermaand totdat de hoofdsom vermeerderd met rente volledig is afgelost.
3.4 Partijen kunnen schriftelijk overeenkomen dat de lening in één keer wordt afgelost, of dat een afwijkend aflossingsschema wordt gehanteerd; dit wordt vastgelegd in een addendum.
3.5 De lener is te allen tijde bevoegd de gehele lening of een deel daarvan vervroegd af te lossen, zonder dat hiervoor een boete of vergoeding verschuldigd is.

Artikel 4: Direct opeisbaarheid
4.1 Het nog openstaande saldo, vermeerderd met de tot dat moment verschuldigde rente, is direct en zonder nadere ingebrekestelling volledig opeisbaar indien: de arbeidsovereenkomst eindigt (ongeacht de reden); de lener zijn verplichtingen niet nakomt; de lener failliet wordt verklaard, surseance aanvraagt of tot schuldsanering wordt toegelaten; beslag wordt gelegd op een aanzienlijk deel van het vermogen van de lener; of de lener overlijdt.
4.2 Bij beëindiging van de arbeidsovereenkomst is de uitlener gerechtigd het volledig openstaande saldo te verrekenen met het laatste loon, vakantietoeslag, niet-genoten vakantiedagen en/of eindafrekening. Een eventueel resterend bedrag voldoet de lener binnen 14 dagen na de uitdiensttreding.

Artikel 5: Wijziging arbeidsverhouding
5.1 Bij een wijziging van de arbeidsovereenkomst die leidt tot een aanzienlijke verlaging van het netto-salaris kunnen partijen op verzoek van de lener een aangepast aflossingsschema overeenkomen, schriftelijk vastgelegd in een addendum.

Artikel 6: Verrekening met andere vorderingen
6.1 De uitlener is gerechtigd de uit deze overeenkomst voortvloeiende vorderingen te verrekenen met enige andere vordering die de lener op de uitlener heeft, waaronder vorderingen uit hoofde van salaris, vakantietoeslag, eindafrekening of onkostenvergoedingen.

Artikel 7: Slotbepalingen
7.1 Wijzigingen of aanvullingen zijn slechts geldig indien schriftelijk tussen partijen overeengekomen en door beide partijen ondertekend.
7.2 Op deze overeenkomst is uitsluitend Nederlands recht van toepassing.
7.3 Geschillen worden voorgelegd aan de bevoegde Nederlandse rechter.
7.4 Door ondertekening verklaart de lener een exemplaar te hebben ontvangen en de inhoud te hebben gelezen, begrepen en zonder voorbehoud te aanvaarden.

Aldus overeengekomen, opgemaakt in 2-voud en ondertekend te Alkmaar op {{datum_vandaag}}.


de uitlener                                   de lener
Embrace the Future B.V.                       {{volledige_naam}}$body$,
 5, false),

-- ---- 6. Bruikleenovereenkomst bedrijfsmiddelen ----------------------------
('a1c70001-0000-4000-8000-000000000006',
 'Bruikleenovereenkomst bedrijfsmiddelen',
 'bruikleen',
 'Overeenkomst voor het in bruikleen geven van bedrijfsmiddelen (laptop, telefoon, voertuig, sleutels, pas) aan een medewerker.',
 $body$BRUIKLEENOVEREENKOMST BEDRIJFSMIDDELEN

De ondergetekenden:

1. Embrace the Future B.V., rechtsgeldig vertegenwoordigd door haar directeuren de heer L. Austin en mevrouw R. Austin-Winder, gevestigd te (1811 JR) Alkmaar aan de Magdalenenstraat 17,
hierna te noemen: "de uitlener" of "ETF";

en

2. {{volledige_naam}}, geboren op {{geboortedatum}}, woonachtig te {{straat_huisnummer}}, {{postcode}} {{woonplaats}}, in dienst bij ETF in de functie van {{functie}},
hierna te noemen "de gebruiker";

uitlener en gebruiker hierna gezamenlijk ook te noemen: "partijen".

In aanmerking nemende dat:
- de gebruiker bij de uitlener in dienst is op basis van een arbeidsovereenkomst;
- de uitlener voor de uitvoering van de werkzaamheden van de gebruiker bepaalde bedrijfsmiddelen ter beschikking stelt;
- partijen de voorwaarden waaronder deze terbeschikkingstelling plaatsvindt in deze overeenkomst wensen vast te leggen.

Komen overeen als volgt:

Artikel 1: Aard van de overeenkomst
1.1 Deze overeenkomst is een bruikleenovereenkomst in de zin van artikel 7A:1777 van het Burgerlijk Wetboek.
1.2 De in artikel 2 genoemde bedrijfsmiddelen blijven te allen tijde eigendom van de uitlener. De gebruiker verkrijgt door deze overeenkomst uitsluitend het recht op gebruik, onder de in deze overeenkomst opgenomen voorwaarden.

Artikel 2: In bruikleen gegeven bedrijfsmiddelen
2.1 De uitlener stelt aan de gebruiker de volgende bedrijfsmiddelen in bruikleen ter beschikking:
{{bedrijfsmiddelen}}
2.2 Bij verstrekking worden de bedrijfsmiddelen door beide partijen gecontroleerd op staat en functioneren. Eventuele bestaande gebreken worden vóór ondertekening schriftelijk vastgelegd.
2.3 De gebruiker bevestigt door ondertekening de bovengenoemde bedrijfsmiddelen in goede staat te hebben ontvangen, behoudens eventueel vooraf schriftelijk vastgelegde gebreken.

Artikel 3: Gebruik
3.1 De gebruiker gebruikt de bedrijfsmiddelen uitsluitend voor de uitoefening van zijn/haar werkzaamheden ten behoeve van ETF. Beperkt persoonlijk gebruik is toegestaan, mits dit het zakelijke gebruik niet belemmert en niet in strijd is met de belangen van ETF.
3.2 Het is de gebruiker niet toegestaan de bedrijfsmiddelen aan derden te verstrekken, te verhuren, te verpanden, te verkopen of op enige andere wijze ter beschikking te stellen.
3.3 De gebruiker beheert de bedrijfsmiddelen als een goed huisvader, gebruikt ze zorgvuldig en neemt alle redelijke maatregelen ter voorkoming van schade, verlies of diefstal.
3.4 De gebruiker neemt de gebruiks- en veiligheidsvoorschriften van de fabrikant en aanvullende richtlijnen van ETF in acht.
3.5 Het is de gebruiker niet toegestaan zonder voorafgaande schriftelijke toestemming van ETF wijzigingen of installaties op de bedrijfsmiddelen aan te brengen, anders dan noodzakelijk voor normaal gebruik.

Artikel 4: Onderhoud, kosten en verzekering
4.1 De kosten van regulier onderhoud, reparaties en – voor zover van toepassing – verzekering en wegenbelasting komen voor rekening van ETF, met uitzondering van schade en kosten die op grond van artikel 5 voor rekening van de gebruiker komen.
4.2 De gebruiker meldt defecten, schade of vermissing onverwijld bij ETF. Bij diefstal of vandalisme doet de gebruiker tevens onverwijld aangifte bij de politie en verstrekt een kopie van het proces-verbaal aan ETF.

Artikel 5: Aansprakelijkheid en verrekening van schade
5.1 De gebruiker is aansprakelijk voor schade aan, verlies van of vermissing van de bedrijfsmiddelen, indien dit te wijten is aan opzet, bewuste roekeloosheid of grove nalatigheid, dan wel het gevolg is van gebruik in strijd met deze overeenkomst.
5.2 De omvang van de aansprakelijkheid bedraagt het bedrag dat ETF noodzakelijkerwijs moet uitgeven voor herstel of vervanging, verminderd met een eventuele verzekeringsuitkering.
5.3 De gebruiker verleent door ondertekening uitdrukkelijke en onherroepelijke toestemming aan ETF om de verschuldigde bedragen te verrekenen met het netto-salaris, vakantietoeslag, niet-genoten vakantiedagen of eindafrekening.
5.4 Bij normale gebruiksslijtage of schade ontstaan zonder schuld van de gebruiker is de gebruiker niet aansprakelijk.

Artikel 6: Duur en inlevering
6.1 Deze bruikleenovereenkomst gaat in op de datum van ondertekening en eindigt van rechtswege op het moment dat de arbeidsovereenkomst tussen partijen, om welke reden dan ook, eindigt.
6.2 ETF is gerechtigd de bruikleen van één of meer bedrijfsmiddelen te allen tijde te beëindigen, indien de bedrijfsvoering of de aard van de werkzaamheden dat met zich meebrengt.
6.3 Bij beëindiging levert de gebruiker alle bedrijfsmiddelen, inclusief toebehoren (opladers, hoesjes, sleutels, documentatie), op de laatste werkdag in goede staat – behoudens normale gebruiksslijtage – bij ETF in.
6.4 Indien de gebruiker de bedrijfsmiddelen niet of niet tijdig inlevert, is ETF gerechtigd de vervangingswaarde te verrekenen overeenkomstig artikel 5.3.
6.5 De gebruiker stelt vóór inlevering persoonlijke gegevens en bestanden veilig. Na inlevering kan ETF de bedrijfsmiddelen resetten of wissen.

Artikel 7: Privacy en gegevensbeheer
7.1 Op de bedrijfsmiddelen mogen geen vertrouwelijke ETF-gegevens of cliëntgegevens worden opgeslagen buiten de daarvoor bestemde, beveiligde ETF-systemen.
7.2 ETF kan, met inachtneming van de geldende privacywetgeving en het personeelsreglement, het gebruik van de bedrijfsmiddelen monitoren ten behoeve van beheer, beveiliging en controle op naleving.

Artikel 8: Slotbepalingen
8.1 Wijzigingen of aanvullingen zijn slechts geldig indien schriftelijk tussen partijen overeengekomen en door beide partijen ondertekend.
8.2 Op deze overeenkomst is uitsluitend Nederlands recht van toepassing.
8.3 Geschillen worden voorgelegd aan de bevoegde Nederlandse rechter.
8.4 Door ondertekening verklaart de gebruiker een exemplaar te hebben ontvangen en de inhoud te hebben gelezen, begrepen en zonder voorbehoud te aanvaarden, waaronder uitdrukkelijk de in artikel 5.3 opgenomen toestemming tot verrekening met het salaris.

Aldus overeengekomen, opgemaakt in 2-voud en ondertekend te Alkmaar op {{datum_vandaag}}.


de uitlener (ETF)                             de gebruiker
Embrace the Future B.V.                       {{volledige_naam}}$body$,
 6, false),

-- ---- 7. Personeelsreglement -----------------------------------------------
('a1c70001-0000-4000-8000-000000000007',
 'Personeelsreglement ETF',
 'reglement',
 'Personeelsreglement van ETF: gedragsregels en interne afspraken voor alle medewerkers. Wordt door de medewerker voor ontvangst en akkoord ondertekend.',
 $body$PERSONEELSREGLEMENT EMBRACE THE FUTURE B.V.

Inleiding
Dit personeelsreglement bevat de gedragsregels en interne afspraken die gelden voor alle medewerkers van Embrace the Future B.V. (hierna: "ETF"). Het reglement maakt onderdeel uit van de arbeidsovereenkomst en geldt naast de bepalingen van de CAO Jeugdzorg en de geldende wet- en regelgeving. ETF is een zorgorganisatie waar warmte, professionaliteit en kwaliteit van zorg centraal staan. Dit reglement is bedoeld om die kwaliteit te borgen, helderheid te scheppen over wederzijdse verwachtingen, en een veilige werkomgeving te creëren voor medewerkers én cliënten.

Artikel 1 – Toepassingsbereik
1.1 Dit reglement is van toepassing op alle medewerkers van ETF, ongeacht functie, contractvorm of dienstverband.
1.2 Bij strijdigheid tussen dit reglement en de individuele arbeidsovereenkomst, prevaleert de arbeidsovereenkomst, tenzij dit reglement een verzwaring inhoudt die schriftelijk door de medewerker is aanvaard via addendum.
1.3 ETF behoudt zich het recht voor dit reglement te wijzigen, conform artikel 7:613 BW en het wijzigingsbeding in de arbeidsovereenkomst.

Artikel 2 – Geheimhouding en vertrouwelijkheid
2.1 De medewerker is verplicht tot strikte geheimhouding ten aanzien van alle informatie betreffende ETF, haar cliënten, medewerkers en bedrijfsvoering, zowel tijdens als na het dienstverband.
2.2 Onder vertrouwelijke informatie wordt onder andere verstaan: cliëntdossiers, medische gegevens, behandelplannen, financiële gegevens, strategische plannen, personeelsgegevens, en alle informatie die redelijkerwijs als vertrouwelijk aangemerkt kan worden.
2.3 Het is verboden vertrouwelijke informatie te delen met derden zonder voorafgaande schriftelijke toestemming van ETF.
2.4 Het is verboden vertrouwelijke informatie te kopiëren, op te slaan of te verzenden naar privé-apparaten, privé-emailadressen, sociale media of cloudomgevingen buiten de officiële ETF-systemen.
2.5 Bij overtreding is ETF gerechtigd de boete als bedoeld in de arbeidsovereenkomst op te leggen, onverminderd het recht op volledige schadevergoeding.

Artikel 3 – Omgang met cliënten
3.1 De medewerker behandelt cliënten met respect, professionaliteit en in lijn met de waarden van ETF.
3.2 Het is verboden om buiten diensttijd op enigerlei wijze, direct of indirect, contact te onderhouden met cliënten of hun familieleden, tenzij dit professioneel noodzakelijk is en vooraf schriftelijk is goedgekeurd door de leidinggevende.
3.3 Onder verboden contact wordt onder meer verstaan: contact via sociale media, telefonisch contact, persoonlijke ontmoetingen buiten werkverband, en het delen van privé-contactgegevens.
3.4 Het is medewerkers niet toegestaan om geschenken, leningen of financiële tegemoetkomingen aan te nemen van cliënten of hun familie.
3.5 Het aangaan van een persoonlijke, romantische of seksuele relatie met een cliënt of voormalig cliënt (gedurende een periode van twee jaar na beëindiging van de zorgrelatie) is uitdrukkelijk verboden.
3.6 Bij overtreding van dit artikel is ETF gerechtigd directe maatregelen te treffen, waaronder schorsing en ontslag, en kan een boete worden opgelegd van EUR 2.500 per overtreding, plus EUR 250 per dag dat de overtreding voortduurt, onverminderd het recht op volledige schadevergoeding.

Artikel 4 – Nevenwerkzaamheden
4.1 De medewerker mag nevenwerkzaamheden verrichten, mits deze geen afbreuk doen aan de werkzaamheden voor ETF en geen sprake is van een belangenconflict.
4.2 Voorafgaande schriftelijke toestemming van ETF is vereist indien de nevenwerkzaamheden plaatsvinden in de zorgsector, betrekking hebben op (voormalig) cliënten van ETF, een omvang hebben waardoor de Arbeidstijdenwet kan worden overschreden, of mogelijk een belangenconflict opleveren.
4.3 ETF kan toestemming uitsluitend weigeren op grond van een objectieve rechtvaardiging.
4.4 De medewerker meldt voorgenomen nevenwerkzaamheden vooraf schriftelijk bij de leidinggevende.

Artikel 5 – Gebruik van bedrijfsmiddelen
5.1 Bedrijfsmiddelen (laptops, telefoons, voertuigen, sleutels, toegangspassen, software-accounts) zijn uitsluitend bestemd voor zakelijk gebruik. Beperkt privégebruik is toegestaan, mits dit niet ten koste gaat van de werkzaamheden of de belangen van ETF.
5.2 De medewerker gaat zorgvuldig om met bedrijfsmiddelen en is aansprakelijk voor schade door grove nalatigheid of opzet.
5.3 Bij beëindiging van het dienstverband worden alle bedrijfsmiddelen onverwijld ingeleverd.
5.4 ETF behoudt zich het recht voor om gebruik van bedrijfsmiddelen te monitoren, conform de geldende privacywetgeving.

Artikel 6 – E-mail, internet en cloudomgeving
6.1 De zakelijke e-mail-, internet- en cloudomgeving van ETF is uitsluitend bestemd voor werkgerelateerde doeleinden.
6.2 Het is verboden vertrouwelijke informatie te verzenden naar privé-emailadressen of op te slaan in privé-cloudomgevingen.
6.3 De medewerker volgt de IT-veiligheidsrichtlijnen van ETF (sterke wachtwoorden, niet delen van inloggegevens, melden van datalekken).
6.4 Bij vermoeden van een datalek of beveiligingsincident meldt de medewerker dit onverwijld bij de leidinggevende en de FG/privacyverantwoordelijke.

Artikel 7 – Sociale media
7.1 De medewerker plaatst geen berichten, foto's of video's op sociale media die herleidbaar zijn naar cliënten, collega's of bedrijfsgevoelige informatie van ETF, zonder uitdrukkelijke schriftelijke toestemming.
7.2 De medewerker onthoudt zich van uitingen op sociale media die de reputatie van ETF, haar medewerkers of cliënten kunnen schaden.
7.3 Het accepteren van vriendschapsverzoeken of volgrelaties met cliënten op sociale media is niet toegestaan.

Artikel 8 – Integriteit en gedragscode
8.1 De medewerker handelt integer, eerlijk en in het belang van ETF en haar cliënten.
8.2 Het aannemen of geven van geschenken, gunsten of betalingen van/aan zakelijke relaties is alleen toegestaan binnen de grenzen van het redelijke (richtbedrag: EUR 50). Geschenken die deze waarde overschrijden moeten worden gemeld bij de leidinggevende.
8.3 Belangenverstrengeling – bijvoorbeeld zakelijke relaties met familieleden of partners – moet vooraf worden gemeld.
8.4 De medewerker meldt vermoedens van fraude, misbruik, onveilige situaties of schendingen van wet- of regelgeving onverwijld bij de leidinggevende of de directie.

Artikel 9 – Omgangsvormen en gedrag op de werkvloer
9.1 ETF staat voor een veilige, respectvolle en inclusieve werkomgeving. Iedere vorm van discriminatie, intimidatie, (seksuele) grensoverschrijding, agressie of pesten is verboden.
9.2 De medewerker behandelt collega's, cliënten en externe contacten met respect, ongeacht achtergrond, geslacht, geaardheid, religie of overtuiging.
9.3 Klachten of meldingen kunnen worden gedaan bij de leidinggevende, de vertrouwenspersoon of rechtstreeks bij de directie. ETF garandeert een vertrouwelijke en zorgvuldige behandeling.

Artikel 10 – Ziekte en verzuim
10.1 Bij ziekmelding gelden de controlevoorschriften zoals opgenomen in de bijlage van de arbeidsovereenkomst.
10.2 De medewerker is verplicht actief mee te werken aan re-integratie conform de Wet Verbetering Poortwachter.
10.3 Misbruik van ziekteverlof kan leiden tot opschorting van loondoorbetaling en/of arbeidsrechtelijke maatregelen.

Artikel 11 – Verlof en vakantie
11.1 Verlof wordt aangevraagd in overleg met en na goedkeuring van de leidinggevende, via de daarvoor bestemde systemen.
11.2 Verlof tijdens piekperiodes (zoals zomervakantie en kerstperiode) wordt zo vroeg mogelijk aangevraagd om planning mogelijk te maken.
11.3 Bij ongeoorloofd verzuim is ETF gerechtigd het loon op te schorten en passende maatregelen te treffen.

Artikel 12 – Werktijden en planning
12.1 De medewerker werkt volgens het rooster zoals vastgesteld door ETF, conform de bepalingen in de arbeidsovereenkomst en CAO Jeugdzorg.
12.2 Wijzigingen in het rooster worden zo tijdig mogelijk gecommuniceerd; in spoedgevallen kan ETF redelijkerwijs flexibiliteit verlangen.
12.3 Te laat komen, ongeoorloofd verzuim of het zonder reden verlaten van de werkplek kan leiden tot maatregelen.

Artikel 13 – Kleding en presentatie
13.1 De medewerker presenteert zich verzorgd en passend bij de functie en de uitstraling van ETF.
13.2 Voor specifieke functies kan ETF voorschriften geven over werkkleding, hygiëne en persoonlijke beschermingsmiddelen.

Artikel 14 – Privacy van cliënten en medewerkers
14.1 ETF en haar medewerkers handelen conform de Algemene Verordening Gegevensbescherming (AVG) en de daaraan gerelateerde wetgeving.
14.2 Het is verboden persoonsgegevens van cliënten of collega's te delen, te kopiëren of buiten de ETF-systemen te brengen, anders dan strikt noodzakelijk voor de uitvoering van de functie.
14.3 Bij twijfel over toegestaan gebruik van gegevens wordt vooraf overlegd met de leidinggevende of de privacyverantwoordelijke.

Artikel 15 – Sancties bij overtreding
15.1 Bij overtreding van dit reglement kan ETF, afhankelijk van de aard en ernst, één of meer van de volgende maatregelen treffen: mondelinge of schriftelijke waarschuwing; officiële berisping; schorsing met of zonder behoud van loon; opschorting of inhouding van loon; boete conform de arbeidsovereenkomst en/of dit reglement; (ontslag op staande voet en) beëindiging van het dienstverband; vordering van schadevergoeding.
15.2 Maatregelen worden schriftelijk vastgelegd in het personeelsdossier.

Artikel 16 – Slotbepalingen
16.1 In gevallen waarin dit reglement niet voorziet, beslist de directie van ETF.
16.2 Dit reglement is in werking getreden op 8 mei 2026 en vervangt alle eerdere reglementen of mondelinge afspraken op de hierin geregelde onderwerpen.
16.3 Wijzigingen worden schriftelijk gecommuniceerd en gepubliceerd in de daarvoor bestemde kanalen.

Ondertekening en kennisname
Door ondertekening van dit personeelsreglement verklaart de medewerker dat hij/zij dit reglement heeft ontvangen, gelezen en begrepen, en dat hij/zij zich zonder voorbehoud aan de daarin opgenomen bepalingen zal houden. De medewerker aanvaardt uitdrukkelijk de in dit reglement opgenomen boetebedingen, sanctiebepalingen en overige verzwarende bepalingen, waaronder begrepen – maar niet beperkt tot – de bepalingen in de artikelen 2 (geheimhouding), 3 (omgang met cliënten), 4 (nevenwerkzaamheden) en 15 (sancties bij overtreding).

Aldus voor ontvangst en akkoord ondertekend te Alkmaar op {{datum_vandaag}}.


de werkgever                                  de medewerker
Embrace the Future B.V.                       {{volledige_naam}}$body$,
 7, false)

on conflict (id) do update set
  naam            = excluded.naam,
  type            = excluded.type,
  beschrijving    = excluded.beschrijving,
  body            = excluded.body,
  volgorde        = excluded.volgorde,
  archived        = false,
  laatst_gewijzigd = now();

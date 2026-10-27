import type { SupportedLocale } from "@platform/website-engine";

export type TrialCategory =
  | "auto-repair"
  | "car-dealership"
  | "restaurant"
  | "fast-food"
  | "barber"
  | "hair-salon"
  | "beauty"
  | "medical-practice"
  | "dental-practice"
  | "home-care"
  | "psychotherapy"
  | "physiotherapy"
  | "professional"
  | "pet"
  | "cleaning"
  | "electrician"
  | "plumbing"
  | "construction"
  | "garden"
  | "delivery";

export type ServiceDescriptionSet = Record<
  SupportedLocale,
  readonly [string, string, string]
>;

export const genericServiceDescriptions: ServiceDescriptionSet = {
  en: [
    "A clear first conversation to understand what you need.",
    "A service shaped around the practical details of your request.",
    "A straightforward follow-up to keep the next steps organised.",
  ],
  de: [
    "Ein klares Erstgespräch, um Ihren Bedarf zu verstehen.",
    "Eine Leistung, die sich an den praktischen Details Ihres Anliegens orientiert.",
    "Eine unkomplizierte Nachbetreuung für gut organisierte nächste Schritte.",
  ],
  fr: [
    "Un premier échange clair pour comprendre votre besoin.",
    "Un service adapté aux aspects concrets de votre demande.",
    "Un suivi simple pour organiser clairement les prochaines étapes.",
  ],
  es: [
    "Una primera conversación clara para entender lo que necesita.",
    "Un servicio adaptado a los detalles prácticos de su solicitud.",
    "Un seguimiento sencillo para organizar los próximos pasos.",
  ],
  it: [
    "Un primo confronto chiaro per capire ciò di cui hai bisogno.",
    "Un servizio costruito sui dettagli pratici della tua richiesta.",
    "Un seguito semplice per organizzare con chiarezza i prossimi passi.",
  ],
  sq: [
    "Një bisedë e qartë fillestare për të kuptuar nevojën tuaj.",
    "Një shërbim i përshtatur me detajet praktike të kërkesës suaj.",
    "Një ndjekje e thjeshtë për të organizuar qartë hapat e ardhshëm.",
  ],
};

export const trialServiceDescriptions: Record<TrialCategory, ServiceDescriptionSet> = {
  "auto-repair": {
    en: [
      "Checks that help clarify vehicle issues before work begins.",
      "Planned maintenance and repair work for everyday driving needs.",
      "Inspection and care focused on brakes and tyres.",
    ],
    de: [
      "Prüfungen, die Fahrzeugprobleme vor Beginn der Arbeiten verständlich machen.",
      "Geplante Wartungs- und Reparaturarbeiten für den täglichen Fahrbetrieb.",
      "Kontrolle und Pflege mit Fokus auf Bremsen und Reifen.",
    ],
    fr: [
      "Des contrôles pour mieux cerner les problèmes du véhicule avant les travaux.",
      "Des opérations d’entretien et de réparation adaptées à l’usage quotidien.",
      "Un contrôle et un entretien dédiés aux freins et aux pneus.",
    ],
    es: [
      "Comprobaciones para aclarar los problemas del vehículo antes de trabajar en él.",
      "Mantenimiento y reparaciones planificados para el uso diario del vehículo.",
      "Revisión y cuidado centrados en los frenos y los neumáticos.",
    ],
    it: [
      "Controlli utili a chiarire i problemi del veicolo prima dei lavori.",
      "Interventi programmati di manutenzione e riparazione per l’uso quotidiano.",
      "Controllo e cura dedicati a freni e pneumatici.",
    ],
    sq: [
      "Kontrolle që ndihmojnë të qartësohen problemet e automjetit para punës.",
      "Mirëmbajtje dhe riparime të planifikuara për përdorimin e përditshëm.",
      "Kontroll dhe kujdes i përqendruar te frenat dhe gomat.",
    ],
  },
  "car-dealership": {
    en: [
      "A focused conversation to narrow down the vehicles that fit your needs.",
      "A chance to experience a selected vehicle before making a decision.",
      "Clear coordination from the purchase steps through to handover.",
    ],
    de: [
      "Ein fokussiertes Gespräch, um passende Fahrzeuge für Ihren Bedarf einzugrenzen.",
      "Die Möglichkeit, ein ausgewähltes Fahrzeug vor der Entscheidung kennenzulernen.",
      "Klare Koordination von den Kaufschritten bis zur Übergabe.",
    ],
    fr: [
      "Un échange ciblé pour trouver les véhicules qui correspondent à vos besoins.",
      "La possibilité de découvrir un véhicule sélectionné avant de décider.",
      "Une coordination claire des étapes d’achat jusqu’à la remise du véhicule.",
    ],
    es: [
      "Una conversación concreta para encontrar los vehículos que se ajustan a sus necesidades.",
      "La oportunidad de conocer un vehículo seleccionado antes de decidir.",
      "Coordinación clara desde los pasos de compra hasta la entrega.",
    ],
    it: [
      "Un confronto mirato per individuare i veicoli adatti alle tue esigenze.",
      "La possibilità di conoscere un veicolo selezionato prima della decisione.",
      "Un coordinamento chiaro dai passaggi d’acquisto fino alla consegna.",
    ],
    sq: [
      "Një bisedë e përqendruar për të gjetur automjetet që i përshtaten nevojës suaj.",
      "Mundësia për të provuar një automjet të përzgjedhur para vendimit.",
      "Koordinim i qartë nga hapat e blerjes deri te dorëzimi.",
    ],
  },
  restaurant: {
    en: [
      "A seasonal selection that gives the menu its current character.",
      "A welcoming table experience with attentive coordination throughout the visit.",
      "A considered setting for private meals and small occasions.",
    ],
    de: [
      "Eine saisonale Auswahl, die der Speisekarte ihren aktuellen Charakter gibt.",
      "Ein gastfreundlicher Service am Tisch mit aufmerksamer Koordination.",
      "Ein passender Rahmen für private Essen und kleinere Anlässe.",
    ],
    fr: [
      "Une sélection de saison qui donne son caractère actuel à la carte.",
      "Un accueil à table chaleureux et une coordination attentive pendant le repas.",
      "Un cadre pensé pour les repas privés et les petites occasions.",
    ],
    es: [
      "Una selección de temporada que aporta su carácter actual a la carta.",
      "Un servicio de mesa acogedor y coordinado durante toda la visita.",
      "Un entorno cuidado para comidas privadas y pequeñas celebraciones.",
    ],
    it: [
      "Una selezione stagionale che dà alla carta il suo carattere del momento.",
      "Un servizio al tavolo accogliente e coordinato con attenzione.",
      "Un ambiente curato per cene private e piccole occasioni.",
    ],
    sq: [
      "Një menu sezonale që i jep karakterin e saj përzgjedhjes së ushqimit.",
      "Shërbim mikpritës në tavolinë me koordinim të kujdesshëm gjatë vizitës.",
      "Një ambient i përshtatshëm për vakte private dhe raste të vogla.",
    ],
  },
  "fast-food": {
    en: [
      "Fresh, quickly prepared choices for a practical everyday meal.",
      "An easy way to place and collect an order away from the counter.",
      "Local delivery coordination for meals ordered nearby.",
    ],
    de: [
      "Frische, schnell zubereitete Auswahl für eine praktische Mahlzeit im Alltag.",
      "Eine einfache Möglichkeit, Bestellungen zum Mitnehmen aufzugeben und abzuholen.",
      "Koordinierte lokale Lieferung für Bestellungen in der näheren Umgebung.",
    ],
    fr: [
      "Des choix frais préparés rapidement pour un repas pratique au quotidien.",
      "Une façon simple de commander et de récupérer un repas à emporter.",
      "Une livraison locale coordonnée pour les commandes du secteur.",
    ],
    es: [
      "Opciones frescas y preparadas con rapidez para una comida práctica.",
      "Una forma sencilla de pedir y recoger su pedido para llevar.",
      "Coordinación de repartos locales para pedidos cercanos.",
    ],
    it: [
      "Proposte fresche preparate rapidamente per un pasto pratico ogni giorno.",
      "Un modo semplice per ordinare e ritirare il cibo da asporto.",
      "Coordinamento delle consegne locali per gli ordini della zona.",
    ],
    sq: [
      "Zgjedhje të freskëta të përgatitura shpejt për një vakt praktik të përditshëm.",
      "Një mënyrë e thjeshtë për të porositur dhe marrë ushqimin me vete.",
      "Koordinim i dërgesave lokale për porositë në zonën përreth.",
    ],
  },
  barber: {
    en: [
      "A precise cut shaped around your preferred length and style.",
      "Careful beard shaping to keep the lines and finish well defined.",
      "A traditional shave with a calm, detail-focused finish.",
    ],
    de: [
      "Ein präziser Haarschnitt, abgestimmt auf die gewünschte Länge und den Stil.",
      "Sorgfältiges Formen des Bartes für klare Konturen und einen gepflegten Abschluss.",
      "Eine klassische Rasur mit ruhigem Ablauf und sorgfältigem Finish.",
    ],
    fr: [
      "Une coupe précise adaptée à la longueur et au style souhaités.",
      "Une taille de barbe soignée pour des contours nets et une finition précise.",
      "Un rasage classique avec une finition calme et attentive aux détails.",
    ],
    es: [
      "Un corte preciso adaptado a la longitud y al estilo que prefiere.",
      "Un arreglo cuidadoso de la barba para mantener contornos definidos.",
      "Un afeitado clásico con un acabado tranquilo y detallista.",
    ],
    it: [
      "Un taglio preciso in linea con la lunghezza e lo stile che preferisci.",
      "Una regolazione accurata della barba per contorni definiti.",
      "Una rasatura classica con una finitura curata e attenta ai dettagli.",
    ],
    sq: [
      "Një prerje e saktë e përshtatur me gjatësinë dhe stilin që dëshironi.",
      "Rregullim i kujdesshëm i mjekrës për konture të qarta dhe pamje të rregullt.",
      "Një rruajtje klasike me përfundim të qetë dhe të kujdesshëm.",
    ],
  },
  "hair-salon": {
    en: [
      "A cut and finish planned around your hair and preferred look.",
      "Colour services discussed and coordinated around the result you want.",
      "Hair treatments selected for the routine and finish that suit you.",
    ],
    de: [
      "Ein Schnitt und Styling, abgestimmt auf Ihr Haar und den gewünschten Look.",
      "Farbservices, die passend zum gewünschten Ergebnis besprochen und koordiniert werden.",
      "Haarpflege, die sich an Ihrer Routine und dem passenden Finish orientiert.",
    ],
    fr: [
      "Une coupe et un coiffage pensés pour vos cheveux et le style souhaité.",
      "Des services de coloration préparés autour du résultat recherché.",
      "Des soins capillaires choisis selon votre routine et la finition souhaitée.",
    ],
    es: [
      "Un corte y peinado pensados para su cabello y el estilo que desea.",
      "Servicios de coloración coordinados según el resultado que busca.",
      "Tratamientos capilares elegidos para su rutina y el acabado que prefiere.",
    ],
    it: [
      "Un taglio e uno styling pensati per i tuoi capelli e il look desiderato.",
      "Servizi di colorazione concordati in base al risultato che cerchi.",
      "Trattamenti per capelli scelti per la tua routine e la finitura preferita.",
    ],
    sq: [
      "Prerje dhe stilim të menduar për flokët dhe pamjen që dëshironi.",
      "Shërbime ngjyrosjeje të planifikuara sipas rezultatit që kërkoni.",
      "Trajtime për flokët të zgjedhura sipas rutinës dhe përfundimit që ju përshtatet.",
    ],
  },
  beauty: {
    en: [
      "A personal conversation to understand your preferences before the appointment.",
      "A treatment selected around the details and result you have in mind.",
      "Ongoing care that helps keep your chosen routine easy to follow.",
    ],
    de: [
      "Ein persönliches Gespräch, um Ihre Wünsche vor dem Termin zu verstehen.",
      "Eine Behandlung, die sich an den gewünschten Details und dem Ergebnis orientiert.",
      "Begleitende Pflege, die Ihre gewählte Routine einfach fortführbar macht.",
    ],
    fr: [
      "Un échange personnel pour comprendre vos préférences avant le rendez-vous.",
      "Un soin choisi selon les détails et le résultat que vous envisagez.",
      "Un suivi beauté qui facilite la continuité de votre routine choisie.",
    ],
    es: [
      "Una conversación personal para conocer sus preferencias antes de la cita.",
      "Un tratamiento elegido según los detalles y el resultado que tiene en mente.",
      "Un cuidado continuado para mantener fácilmente la rutina elegida.",
    ],
    it: [
      "Un confronto personale per capire le tue preferenze prima dell’appuntamento.",
      "Un trattamento scelto in base ai dettagli e al risultato che desideri.",
      "Una cura continuativa per mantenere semplice la routine scelta.",
    ],
    sq: [
      "Një bisedë personale për të kuptuar preferencat tuaja para takimit.",
      "Një trajtim i zgjedhur sipas detajeve dhe rezultatit që dëshironi.",
      "Kujdes i vazhdueshëm për ta mbajtur të lehtë rutinën tuaj të zgjedhur.",
    ],
  },
  "medical-practice": {
    en: [
      "Time to discuss your concern and the information relevant to your visit.",
      "A routine check-up conversation focused on the matters you bring with you.",
      "Clear guidance to help you understand the next steps discussed in your visit.",
    ],
    de: [
      "Zeit, um Ihr Anliegen und die für den Termin wichtigen Informationen zu besprechen.",
      "Ein Gespräch zur Routineuntersuchung mit Fokus auf Ihre mitgebrachten Anliegen.",
      "Verständliche Orientierung zu den nächsten Schritten aus Ihrem Termin.",
    ],
    fr: [
      "Un temps d’échange sur votre demande et les informations utiles à la consultation.",
      "Une visite de routine centrée sur les sujets que vous souhaitez aborder.",
      "Des explications claires sur les prochaines étapes évoquées pendant la consultation.",
    ],
    es: [
      "Un espacio para hablar de su motivo de consulta y de la información útil para la visita.",
      "Una revisión rutinaria centrada en los asuntos que desea comentar.",
      "Orientación clara sobre los siguientes pasos tratados durante la consulta.",
    ],
    it: [
      "Un momento per parlare della tua esigenza e delle informazioni utili alla visita.",
      "Un controllo di routine concentrato sugli aspetti che desideri discutere.",
      "Indicazioni chiare sui prossimi passi affrontati durante il consulto.",
    ],
    sq: [
      "Kohë për të diskutuar shqetësimin tuaj dhe informacionin e nevojshëm për vizitën.",
      "Një kontroll rutinë i përqendruar te çështjet që dëshironi të trajtoni.",
      "Udhëzim i qartë për hapat e ardhshëm të diskutuar gjatë konsultës.",
    ],
  },
  "dental-practice": {
    en: [
      "A conversation to understand your dental concern and the options to discuss.",
      "A preventive visit focused on the everyday care topics relevant to you.",
      "A clear outline of the treatment steps considered during your consultation.",
    ],
    de: [
      "Ein Gespräch, um Ihr zahnmedizinisches Anliegen und mögliche Optionen zu verstehen.",
      "Ein Vorsorgetermin mit Fokus auf die für Sie wichtigen Themen der täglichen Pflege.",
      "Eine klare Übersicht der Behandlungsschritte, die im Gespräch betrachtet werden.",
    ],
    fr: [
      "Un échange pour comprendre votre demande dentaire et les options à envisager.",
      "Une visite préventive centrée sur les gestes de soin qui vous concernent.",
      "Une présentation claire des étapes de traitement envisagées pendant l’échange.",
    ],
    es: [
      "Una conversación para entender su necesidad dental y las opciones que se pueden valorar.",
      "Una visita preventiva centrada en los cuidados cotidianos que le resultan útiles.",
      "Una explicación clara de los pasos del tratamiento considerados en la consulta.",
    ],
    it: [
      "Un confronto per capire la tua esigenza dentale e le opzioni da valutare.",
      "Una visita preventiva concentrata sulle abitudini di cura utili per te.",
      "Una panoramica chiara dei passaggi di trattamento considerati durante il consulto.",
    ],
    sq: [
      "Një bisedë për të kuptuar shqetësimin dentar dhe mundësitë që mund të diskutohen.",
      "Një vizitë parandaluese e përqendruar te kujdesi i përditshëm që ju nevojitet.",
      "Një përmbledhje e qartë e hapave të trajtimit të diskutuar gjatë konsultës.",
    ],
  },
  "home-care": {
    en: [
      "A planned visit at home that follows the person’s familiar routine.",
      "Practical support for everyday movement and the activities that matter at home.",
      "Clear coordination with family members around the agreed care routine.",
    ],
    de: [
      "Ein geplanter Pflegebesuch zu Hause, der sich an vertrauten Abläufen orientiert.",
      "Praktische Unterstützung bei der Bewegung und den wichtigen Tätigkeiten im Alltag.",
      "Klare Abstimmung mit Angehörigen rund um die vereinbarte Pflegeroutine.",
    ],
    fr: [
      "Une visite à domicile organisée autour des habitudes de la personne.",
      "Un soutien pratique pour les déplacements et les activités importantes au quotidien.",
      "Une coordination claire avec la famille autour de la routine convenue.",
    ],
    es: [
      "Una visita a domicilio organizada según las rutinas habituales de la persona.",
      "Apoyo práctico para la movilidad y las actividades importantes del día a día.",
      "Coordinación clara con la familia en torno a la rutina de cuidados acordada.",
    ],
    it: [
      "Una visita a domicilio organizzata intorno alle abitudini della persona.",
      "Un supporto pratico per la mobilità e le attività importanti di ogni giorno.",
      "Un coordinamento chiaro con la famiglia sulla routine concordata.",
    ],
    sq: [
      "Një vizitë në shtëpi e planifikuar sipas rutinës së njohur të personit.",
      "Mbështetje praktike për lëvizjen dhe aktivitetet e rëndësishme të përditshme.",
      "Koordinim i qartë me familjen rreth rutinës së kujdesit të rënë dakord.",
    ],
  },
  psychotherapy: {
    en: [
      "A confidential first conversation to understand what brings you to the practice.",
      "Individual sessions shaped around the topics and pace you choose to discuss.",
      "Steady guidance for reflecting on the next steps in your own time.",
    ],
    de: [
      "Ein vertrauliches Erstgespräch, um Ihr Anliegen in der Praxis zu verstehen.",
      "Einzelgespräche, die sich an den Themen und dem Tempo orientieren, die Sie wählen.",
      "Kontinuierliche Orientierung, um die nächsten Schritte in Ihrem Tempo zu betrachten.",
    ],
    fr: [
      "Un premier échange confidentiel pour comprendre votre démarche.",
      "Des séances individuelles adaptées aux thèmes et au rythme que vous choisissez.",
      "Un accompagnement régulier pour réfléchir aux prochaines étapes à votre rythme.",
    ],
    es: [
      "Una primera conversación confidencial para comprender el motivo de su consulta.",
      "Sesiones individuales adaptadas a los temas y al ritmo que usted elija.",
      "Orientación continuada para reflexionar sobre los siguientes pasos a su ritmo.",
    ],
    it: [
      "Un colloquio iniziale riservato per capire cosa ti porta allo studio.",
      "Sedute individuali costruite sui temi e sui tempi che scegli di affrontare.",
      "Un orientamento continuativo per riflettere sui prossimi passi con i tuoi tempi.",
    ],
    sq: [
      "Një bisedë fillestare konfidenciale për të kuptuar arsyen e vizitës suaj.",
      "Seanca individuale të përshtatura me temat dhe ritmin që zgjidhni.",
      "Udhëzim i vazhdueshëm për të reflektuar mbi hapat e ardhshëm në kohën tuaj.",
    ],
  },
  physiotherapy: {
    en: [
      "A first assessment to discuss your movement needs and everyday activities.",
      "Hands-on therapy planned around the areas and movements you want to address.",
      "Practical guidance for the next stages of your personal recovery routine.",
    ],
    de: [
      "Eine erste Befundaufnahme zu Ihren Bewegungsbedürfnissen und Alltagsaktivitäten.",
      "Manuelle Therapie, abgestimmt auf die Bereiche und Bewegungen, die Sie ansprechen möchten.",
      "Praktische Orientierung für die nächsten Schritte Ihrer persönlichen Übungsroutine.",
    ],
    fr: [
      "Un bilan initial pour échanger sur vos besoins de mouvement au quotidien.",
      "Une thérapie manuelle adaptée aux zones et aux mouvements que vous souhaitez travailler.",
      "Des conseils pratiques pour les prochaines étapes de votre routine personnelle.",
    ],
    es: [
      "Una valoración inicial para hablar de sus necesidades de movimiento y de su día a día.",
      "Terapia manual adaptada a las zonas y movimientos que desea trabajar.",
      "Orientación práctica para las siguientes etapas de su rutina personal.",
    ],
    it: [
      "Una valutazione iniziale per parlare delle tue esigenze di movimento quotidiano.",
      "Terapia manuale pensata per le aree e i movimenti che desideri affrontare.",
      "Indicazioni pratiche per i prossimi passaggi della tua routine personale.",
    ],
    sq: [
      "Një vlerësim fillestar për të diskutuar nevojat tuaja të lëvizjes në përditshmëri.",
      "Terapi manuale e planifikuar sipas zonave dhe lëvizjeve që dëshironi të trajtoni.",
      "Udhëzim praktik për hapat e ardhshëm të rutinës suaj personale.",
    ],
  },
  professional: {
    en: [
      "A focused first conversation to define the question or goal you bring.",
      "A structured review of the needs, information and priorities involved.",
      "Practical support for keeping agreed actions and next steps on track.",
    ],
    de: [
      "Ein fokussiertes Erstgespräch, um Ihre Frage oder Ihr Ziel zu klären.",
      "Eine strukturierte Prüfung der beteiligten Bedürfnisse, Informationen und Prioritäten.",
      "Praktische Begleitung, damit vereinbarte Aufgaben und nächste Schritte übersichtlich bleiben.",
    ],
    fr: [
      "Un premier échange ciblé pour préciser votre question ou votre objectif.",
      "Une analyse structurée des besoins, informations et priorités concernés.",
      "Un soutien pratique pour garder le cap sur les actions et les prochaines étapes convenues.",
    ],
    es: [
      "Una primera conversación concreta para definir su pregunta o su objetivo.",
      "Un análisis estructurado de las necesidades, la información y las prioridades implicadas.",
      "Apoyo práctico para mantener organizadas las acciones y los próximos pasos acordados.",
    ],
    it: [
      "Un primo confronto mirato per definire la domanda o l’obiettivo che porti.",
      "Un’analisi strutturata di esigenze, informazioni e priorità coinvolte.",
      "Un supporto pratico per mantenere in ordine le azioni e i prossimi passi concordati.",
    ],
    sq: [
      "Një konsultim fillestar i përqendruar për të përcaktuar pyetjen ose qëllimin tuaj.",
      "Një analizë e strukturuar e nevojave, informacionit dhe përparësive përkatëse.",
      "Mbështetje praktike për t’i mbajtur të organizuar veprimet dhe hapat e rënë dakord.",
    ],
  },
  pet: {
    en: [
      "A first conversation about your pet’s routine, needs and the reason for your visit.",
      "Care arranged around the animal’s situation, daily routine and your preferences.",
      "Clear guidance for owners on the practical next steps discussed together.",
    ],
    de: [
      "Ein Erstgespräch über die Routine, Bedürfnisse und den Anlass Ihres Tieres.",
      "Eine Betreuung, die sich an der Situation, dem Alltag und Ihren Wünschen orientiert.",
      "Klare Beratung für Halter zu den gemeinsam besprochenen nächsten Schritten.",
    ],
    fr: [
      "Un premier échange sur les habitudes, les besoins et le motif de votre visite avec votre animal.",
      "Des soins organisés selon la situation de l’animal, son quotidien et vos préférences.",
      "Des conseils clairs pour les propriétaires sur les prochaines étapes évoquées ensemble.",
    ],
    es: [
      "Una primera conversación sobre la rutina, las necesidades y el motivo de la visita de su mascota.",
      "Un cuidado organizado según la situación, la rutina diaria y sus preferencias.",
      "Orientación clara para los propietarios sobre los siguientes pasos tratados.",
    ],
    it: [
      "Un primo confronto sulle abitudini, le esigenze e il motivo della visita del tuo animale.",
      "Una cura organizzata in base alla situazione dell’animale, alla sua routine e alle tue preferenze.",
      "Indicazioni chiare per i proprietari sui prossimi passi discussi insieme.",
    ],
    sq: [
      "Një konsultim fillestar për rutinën, nevojat dhe arsyen e vizitës së kafshës suaj.",
      "Kujdes i organizuar sipas situatës, rutinës së përditshme dhe preferencave tuaja.",
      "Udhëzim i qartë për pronarët mbi hapat e ardhshëm të diskutuar së bashku.",
    ],
  },
  cleaning: {
    en: [
      "A recurring cleaning rhythm for spaces that need regular attention.",
      "A more detailed clean focused on surfaces and areas needing extra care.",
      "A cleaning plan arranged around the size, use and timing of your space.",
    ],
    de: [
      "Ein regelmäßiger Reinigungsrhythmus für Räume mit wiederkehrendem Pflegebedarf.",
      "Eine gründliche Reinigung mit Fokus auf Oberflächen und besonders wichtige Bereiche.",
      "Ein Reinigungsplan, abgestimmt auf Größe, Nutzung und Zeitplan Ihrer Räume.",
    ],
    fr: [
      "Un rythme de nettoyage régulier pour les espaces qui demandent une attention suivie.",
      "Un nettoyage approfondi concentré sur les surfaces et zones qui nécessitent plus de soin.",
      "Un plan de nettoyage adapté à la taille, à l’usage et au calendrier de vos locaux.",
    ],
    es: [
      "Un ritmo de limpieza periódica para espacios que requieren atención regular.",
      "Una limpieza detallada centrada en las superficies y zonas que necesitan más cuidado.",
      "Un plan de limpieza adaptado al tamaño, el uso y el horario de su espacio.",
    ],
    it: [
      "Un ritmo di pulizia periodica per gli spazi che richiedono attenzione regolare.",
      "Una pulizia approfondita concentrata sulle superfici e sulle aree che richiedono più cura.",
      "Un piano di pulizia organizzato in base a dimensioni, uso e tempi del tuo spazio.",
    ],
    sq: [
      "Një ritëm pastrimi periodik për hapësirat që kërkojnë kujdes të rregullt.",
      "Një pastrim i detajuar i përqendruar te sipërfaqet dhe zonat që kërkojnë më shumë kujdes.",
      "Një plan pastrimi i përshtatur me madhësinë, përdorimin dhe orarin e hapësirës suaj.",
    ],
  },
  electrician: {
    en: [
      "A review of the electrical points and questions relevant to your property.",
      "Planned electrical installation work for the agreed fixtures or spaces.",
      "Practical maintenance to keep electrical equipment and connections organised.",
    ],
    de: [
      "Eine Prüfung der elektrischen Punkte und Fragen, die für Ihre Immobilie wichtig sind.",
      "Geplante Elektroarbeiten für die vereinbarten Anschlüsse, Geräte oder Räume.",
      "Praktische Wartung, damit elektrische Anlagen und Verbindungen übersichtlich bleiben.",
    ],
    fr: [
      "Un contrôle des éléments électriques et des questions importantes pour votre bâtiment.",
      "Des travaux d’installation électrique planifiés pour les équipements ou espaces convenus.",
      "Une maintenance pratique pour garder les équipements et raccordements bien organisés.",
    ],
    es: [
      "Una revisión de los puntos eléctricos y las cuestiones relevantes para su inmueble.",
      "Trabajos de instalación eléctrica planificados para los equipos o espacios acordados.",
      "Mantenimiento práctico para mantener organizados los equipos y las conexiones eléctricas.",
    ],
    it: [
      "Una verifica dei punti elettrici e delle esigenze importanti per il tuo immobile.",
      "Lavori di installazione elettrica programmati per gli spazi o gli elementi concordati.",
      "Una manutenzione pratica per mantenere ordinati impianti e collegamenti elettrici.",
    ],
    sq: [
      "Një kontroll i pikave elektrike dhe çështjeve të rëndësishme për pronën tuaj.",
      "Punime instalimi elektrik të planifikuara për pajisjet ose hapësirat e rëna dakord.",
      "Mirëmbajtje praktike për t’i mbajtur të organizuara pajisjet dhe lidhjet elektrike.",
    ],
  },
  plumbing: {
    en: [
      "A review of the plumbing or heating system and the issue you want to address.",
      "Planned installation work for the agreed plumbing or heating components.",
      "Routine maintenance to keep the system’s practical needs on the schedule.",
    ],
    de: [
      "Eine Prüfung der Sanitär- oder Heizungsanlage und des konkreten Anliegens.",
      "Geplante Installationsarbeiten für die vereinbarten Sanitär- oder Heizungskomponenten.",
      "Regelmäßige Wartung, damit die praktischen Anforderungen der Anlage im Blick bleiben.",
    ],
    fr: [
      "Un contrôle de la plomberie ou du chauffage et du problème que vous souhaitez traiter.",
      "Des travaux d’installation planifiés pour les éléments sanitaires ou de chauffage convenus.",
      "Une maintenance régulière pour suivre les besoins pratiques de l’installation.",
    ],
    es: [
      "Una revisión de la fontanería o la calefacción y del problema que desea tratar.",
      "Trabajos de instalación planificados para los componentes de fontanería o calefacción acordados.",
      "Mantenimiento periódico para tener al día las necesidades prácticas del sistema.",
    ],
    it: [
      "Un controllo dell’impianto idraulico o di riscaldamento e del problema da affrontare.",
      "Lavori di installazione programmati per i componenti idraulici o di riscaldamento concordati.",
      "Una manutenzione ordinaria per seguire le esigenze pratiche dell’impianto.",
    ],
    sq: [
      "Një kontroll i sistemit hidraulik ose të ngrohjes dhe i çështjes që dëshironi të trajtoni.",
      "Punime instalimi të planifikuara për komponentët hidraulikë ose të ngrohjes.",
      "Mirëmbajtje e rregullt për të mbajtur në plan nevojat praktike të sistemit.",
    ],
  },
  construction: {
    en: [
      "A first project conversation to clarify the scope, setting and priorities.",
      "Clear coordination of the people, timing and work stages involved.",
      "Careful finishing work and practical maintenance for the completed area.",
    ],
    de: [
      "Ein erstes Projektgespräch, um Umfang, Rahmen und Prioritäten zu klären.",
      "Klare Koordination der beteiligten Personen, Termine und Arbeitsphasen.",
      "Sorgfältige Ausbauarbeiten und praktische Instandhaltung für den fertigen Bereich.",
    ],
    fr: [
      "Un premier échange de projet pour préciser le périmètre, le contexte et les priorités.",
      "Une coordination claire des intervenants, du calendrier et des étapes de travail.",
      "Des finitions soignées et une maintenance pratique pour l’espace réalisé.",
    ],
    es: [
      "Una primera conversación de proyecto para aclarar el alcance, el contexto y las prioridades.",
      "Coordinación clara de las personas, los tiempos y las fases de trabajo implicadas.",
      "Trabajos de acabado cuidadosos y mantenimiento práctico para el espacio terminado.",
    ],
    it: [
      "Un primo confronto sul progetto per chiarire ambito, contesto e priorità.",
      "Un coordinamento chiaro delle persone coinvolte, dei tempi e delle fasi di lavoro.",
      "Finiture accurate e manutenzione pratica per l’area completata.",
    ],
    sq: [
      "Një konsultim fillestar për projektin për të qartësuar fushën, kushtet dhe përparësitë.",
      "Koordinim i qartë i personave, afateve dhe fazave të punës.",
      "Punime të kujdesshme përfundimi dhe mirëmbajtje praktike për hapësirën e përfunduar.",
    ],
  },
  garden: {
    en: [
      "A first look at the outdoor space, its use and the work it needs.",
      "Care and pruning planned around the plants, trees and areas being maintained.",
      "A seasonal maintenance rhythm for keeping outdoor work organised throughout the year.",
    ],
    de: [
      "Ein erster Blick auf die Außenfläche, ihre Nutzung und den anstehenden Pflegebedarf.",
      "Pflege und Schnitt, abgestimmt auf Pflanzen, Bäume und die zu betreuenden Bereiche.",
      "Ein saisonaler Pflegeplan, damit die Arbeiten im Außenbereich übersichtlich bleiben.",
    ],
    fr: [
      "Un premier regard sur l’espace extérieur, son usage et les travaux nécessaires.",
      "Un entretien et une taille organisés selon les plantes, les arbres et les zones concernées.",
      "Un rythme d’entretien saisonnier pour organiser les travaux extérieurs toute l’année.",
    ],
    es: [
      "Una primera revisión del espacio exterior, su uso y los trabajos que necesita.",
      "Cuidado y poda organizados según las plantas, los árboles y las zonas que se mantienen.",
      "Un ritmo de mantenimiento estacional para organizar el cuidado exterior durante todo el año.",
    ],
    it: [
      "Una prima valutazione dello spazio esterno, del suo uso e dei lavori necessari.",
      "Cura e potatura organizzate in base a piante, alberi e aree da mantenere.",
      "Un ritmo di manutenzione stagionale per organizzare la cura degli spazi esterni durante l’anno.",
    ],
    sq: [
      "Një vlerësim fillestar i hapësirës së jashtme, përdorimit dhe punëve që nevojiten.",
      "Kujdes dhe krasitje të planifikuara sipas bimëve, pemëve dhe zonave që mirëmbahen.",
      "Një ritëm mirëmbajtjeje sezonale për ta organizuar kujdesin gjatë gjithë vitit.",
    ],
  },
  delivery: {
    en: [
      "A clear handover of the order before it starts its local journey.",
      "Coordinated delivery for packages or orders moving within the local area.",
      "Practical updates that make it easier to follow an order’s progress.",
    ],
    de: [
      "Eine klare Übergabe der Bestellung, bevor sie lokal auf den Weg gebracht wird.",
      "Koordinierte lokale Lieferung für Pakete oder Bestellungen in der Umgebung.",
      "Praktische Informationen, mit denen sich der Fortschritt einer Bestellung verfolgen lässt.",
    ],
    fr: [
      "Une remise claire de la commande avant son acheminement local.",
      "Une livraison coordonnée pour les colis et commandes dans la zone locale.",
      "Des informations pratiques pour suivre l’avancement de la commande.",
    ],
    es: [
      "Una recogida clara del pedido antes de iniciar su recorrido local.",
      "Reparto coordinado de paquetes o pedidos dentro de la zona local.",
      "Actualizaciones prácticas para seguir el progreso del pedido.",
    ],
    it: [
      "Una presa in carico chiara dell’ordine prima del suo percorso locale.",
      "Una consegna coordinata per pacchi o ordini nell’area locale.",
      "Aggiornamenti pratici per seguire l’avanzamento dell’ordine.",
    ],
    sq: [
      "Marrje e qartë e porosisë para se të nisë rrugëtimin lokal.",
      "Dërgesë e koordinuar për paketa ose porosi brenda zonës lokale.",
      "Përditësime praktike për të ndjekur ecurinë e porosisë.",
    ],
  },
};

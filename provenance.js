/*
  Provenance du visiteur : d'où vient-il quand il arrive sur /contact ou /rendez-vous ?
  (26/10/2026)

  1. ?sujet=xxx dans l'URL (posé par les boutons des pages modèles, articles, décryptages)
  2. sinon, la page du site d'où il arrive (document.referrer, même domaine uniquement)

  window.nmProvenance() renvoie { cle, source, info } où source vaut "lien" ou "navigation",
  et info contient les textes adaptés (null si la provenance est inconnue).
  Pour ajouter une provenance, il suffit d'ajouter une entrée dans SUJETS et, si besoin,
  une règle dans CHEMINS.
*/
(function () {
  // Principe d'écriture (26/10/2026) : on ne dit jamais au visiteur d'où il vient.
  // Les textes parlent simplement de ce qui l'occupe probablement, la personnalisation
  // doit se sentir sans se voir. avant = sous le titre de /rendez-vous (et sur /contact),
  // apres = dans la confirmation de réservation. null = texte générique.
  var SUJETS = {
    'ai-act': {
      libelle: 'le décryptage AI Act',
      href: '/decryptages/ai-act/',
      avant: "Si un outil précis vous occupe, tri de CV, scoring de candidats ou entretien vidéo analysé par IA, notez simplement son nom en réservant, on partira de ce cas concret plutôt que du texte du règlement.",
      apres: "Si un outil précis vous occupe, on partira de lui, c'est en général le chemin le plus court pour savoir ce qui s'applique vraiment.",
      liens: [
        { texte: 'Qualifier un outil', href: '/decryptages/ai-act/parcours-qualification' },
        { texte: 'Lister ses obligations', href: '/decryptages/ai-act/registre-obligations' }
      ]
    },
    'turnover': {
      libelle: 'le modèle Turnover volontaire',
      href: '/modeles/turnover',
      avant: "Rien à préparer, les indicateurs que vous suivez déjà, taux de départ, enquête d'engagement ou entretiens de sortie, suffisent largement pour démarrer.",
      apres: "On partira de ce que vos indicateurs montrent aujourd'hui, et de ce qu'ils ne disent pas encore sur les raisons des départs.",
      liens: [
        { texte: "D'où viennent les ratios de coût du turnover", href: '/articles/cout-turnover-ratios' },
        { texte: 'Pourquoi les salariés partent', href: '/articles/causes-turnover-recherche' }
      ]
    },
    'article-turnover': {
      libelle: "l'article sur les causes du turnover",
      href: '/articles/causes-turnover-recherche',
      avant: "Rien à préparer, si certains facteurs vous semblent jouer chez vous, on pourra simplement partir de ceux-là.",
      apres: "On pourra partir des facteurs qui vous semblent jouer chez vous, et regarder ensemble lesquels pèsent vraiment.",
      liens: [
        { texte: 'Explorer le modèle Turnover', href: '/modeles/turnover' },
        { texte: "D'où viennent les ratios de coût du turnover", href: '/articles/cout-turnover-ratios' }
      ]
    },
    'burnout': {
      libelle: 'le modèle Burn-out & RPS',
      href: '/modeles/burnout',
      avant: "Rien à préparer, si vous avez une évaluation des risques psychosociaux ou une enquête récente, elle aidera simplement à situer le point de départ.",
      apres: "On partira de ce que vous savez déjà de la situation, pour voir quels leviers mériteraient d'être traités en premier.",
      liens: [
        { texte: 'Revoir le modèle Burn-out & RPS', href: '/modeles/burnout' },
        { texte: 'Comment les modèles sont construits', href: '/methode' }
      ]
    },
    'modeles': {
      libelle: 'la page Modèles',
      href: '/modeles/',
      avant: "Si votre question ne ressemble à aucun modèle existant, c'est justement un bon sujet d'échange.",
      apres: "Que votre question ressemble à un modèle existant ou à aucun, on partira d'elle.",
      liens: [
        { texte: 'Comment les modèles sont construits', href: '/methode' },
        { texte: 'Les questions fréquentes', href: '/faq' }
      ]
    },
    'methode': {
      libelle: 'la page Méthode',
      href: '/methode',
      avant: "Si une étape vous laisse une question, données, calibration ou restitution, c'est un très bon point de départ.",
      apres: "Si une étape vous laisse une question, données, calibration ou restitution, on pourra commencer par là.",
      liens: [
        { texte: 'Voir les modèles en action', href: '/modeles/' },
        { texte: 'Les questions fréquentes', href: '/faq' }
      ]
    },
    'articles': {
      libelle: 'les articles',
      href: '/articles',
      avant: null,
      apres: null,
      liens: [
        { texte: 'Explorer les modèles', href: '/modeles/' },
        { texte: 'Comprendre la méthode', href: '/methode' }
      ]
    },
    'decryptages': {
      libelle: 'les décryptages',
      href: '/decryptages',
      avant: "Si un texte ou une réglementation vous occupe en ce moment, notez-le en une ligne en réservant, on partira de là.",
      apres: null,
      liens: [
        { texte: 'Le décryptage AI Act', href: '/decryptages/ai-act/' },
        { texte: 'Explorer les modèles', href: '/modeles/' }
      ]
    },
    'faq': {
      libelle: 'la FAQ',
      href: '/faq',
      avant: "Si une question est restée sans réponse, c'est un très bon début d'échange.",
      apres: null,
      liens: [
        { texte: 'Explorer les modèles', href: '/modeles/' },
        { texte: 'Comprendre la méthode', href: '/methode' }
      ]
    },
    'a-propos': {
      libelle: 'la page À propos',
      href: '/a-propos',
      avant: null,
      apres: null,
      liens: [
        { texte: 'Explorer les modèles', href: '/modeles/' },
        { texte: 'Comprendre la méthode', href: '/methode' }
      ]
    }
  };

  // Chemin de la page précédente -> clé (premier motif qui correspond)
  var CHEMINS = [
    [/^\/decryptages\/ai-act/, 'ai-act'],
    [/^\/decryptages/, 'decryptages'],
    [/^\/modeles\/turnover/, 'turnover'],
    [/^\/modeles\/burnout/, 'burnout'],
    [/^\/modeles/, 'modeles'],
    [/^\/articles\/causes-turnover/, 'article-turnover'],
    [/^\/articles\/cout-turnover/, 'turnover'],
    [/^\/articles/, 'articles'],
    [/^\/methode/, 'methode'],
    [/^\/faq/, 'faq'],
    [/^\/a-propos/, 'a-propos']
  ];

  function depuisReferrer() {
    try {
      if (!document.referrer) return null;
      var r = new URL(document.referrer);
      if (r.host !== location.host) return null;
      // la page contact transmet déjà son propre ?sujet=
      var s = r.searchParams.get('sujet');
      if (s) return s;
      var chemin = r.pathname.replace(/\.html$/, '');
      for (var i = 0; i < CHEMINS.length; i++) {
        if (CHEMINS[i][0].test(chemin)) return CHEMINS[i][1];
      }
    } catch (e) {}
    return null;
  }

  window.nmSujets = SUJETS;
  window.nmProvenance = function () {
    var cle = null, source = null;
    try { cle = new URLSearchParams(location.search).get('sujet'); } catch (e) {}
    if (cle) { source = 'lien'; }
    else { cle = depuisReferrer(); if (cle) source = 'navigation'; }
    if (cle) cle = String(cle).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || null;
    return { cle: cle, source: cle ? source : null, info: cle ? (SUJETS[cle] || null) : null };
  };
})();
